import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from '../database';
import { syncUserProfile } from '../services/userService';

const AuthContext = createContext();

export const DEV_ROLES = [
    { key: 'admin',    label: '마스터 (Admin)',     color: 'bg-rose-500' },
    { key: 'engineer', label: '개발 부서',           color: 'bg-blue-500' },
    { key: 'sales',    label: '영업 부서',           color: 'bg-amber-500' },
    { key: 'qa',       label: 'QA 부서',             color: 'bg-purple-500' },
    { key: 'production', label: '생산 부서',          color: 'bg-emerald-500' },
    { key: 'manager',  label: '관리 부서',           color: 'bg-indigo-500' },
];

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [devRoleOverride, setDevRoleOverride] = useState(null); // 임시 역할 오버라이드
    const [isOdooOnlyAuth, setIsOdooOnlyAuth] = useState(false);
    const [odooLinked, setOdooLinked] = useState(!!localStorage.getItem('odoo_password'));

    // Domain restriction configuration
    const ALLOWED_DOMAINS = ['mightyzap.com', 'irrobot.com'];
    
    // Odoo API 동적 설정 (로컬 망 1차 시도 후 Tailscale 외부망 폴백)
    const [odooApiUrl, setOdooApiUrl] = useState('http://192.168.0.7:8069'); // 기본 로컬 주소
    const ODOO_DB = 'odoo';

    useEffect(() => {
        const checkOdooConnection = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000); // 2초 대기 후 타임아웃
                // no-cors 모드를 사용하여 CORS 제한 없이 네트워크 도달 가능성만 단순 체크 (응답 여부만 판단)
                await fetch('http://192.168.0.7:8069/web/login', {
                    method: 'GET',
                    mode: 'no-cors',
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                console.log('[Odoo Fallback] 로컬 사내망(192.168.0.7) Odoo 서버 접근 가능! 로컬 주소를 유지합니다.');
                setOdooApiUrl('http://192.168.0.7:8069');
            } catch (err) {
                console.warn('[Odoo Fallback] 로컬 사내망 Odoo 접근 불가! (2초 타임아웃 또는 연결거부). Tailscale(100.67.238.32)로 전환합니다.', err.message);
                setOdooApiUrl('http://100.67.238.32:8069');
            }
        };
        checkOdooConnection();
    }, []);

    async function login() {
        try {
            setError('');
            // firebase.js의 signInWithPopup이 Electron 환경에서는
            // 자동으로 electronAPI.googleOAuthSignIn() (별도 창 방식)을 호출합니다.
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Access Token 저장
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                localStorage.setItem('google_access_token', credential.accessToken);
                const expiresIn = credential.expiresIn || 3500;
                localStorage.setItem('google_access_token_expires_at', Date.now() + (expiresIn - 60) * 1000);
            }

            // 도메인 제한 체크
            const userEmail = user?.email || '';
            const domain = userEmail.split('@')[1]?.toLowerCase();
            if (!ALLOWED_DOMAINS.includes(domain)) {
                await logout();
                setError(`접속이 허용되지 않은 도메인입니다: ${domain} (허용: @mightyzap.com, @irrobot.com)`);
                return;
            }

            // 프로필 동기화
            const profile = await syncUserProfile(user);
            setUserProfile(profile);

            // Google 로그인 완료 → Odoo 웹뷰도 /web으로 이동 (기존 Odoo 세션 활용)
            window.dispatchEvent(new CustomEvent('odoo-google-login', { detail: { email: userEmail } }));

        } catch (e) {
            if (e.message !== '로그인이 취소되었습니다.') {
                setError('Google 로그인 실패: ' + e.message);
            }
        }
    }

    async function linkOdoo(password) {
        try {
            setError('');
            const username = currentUser?.email;
            if (!username) throw new Error("Google 로그인이 필요합니다.");

            // 메인 렌더러에서도 인증 확인 (uid 체크용)
            const response = await fetch(`${odooApiUrl}/web/session/authenticate`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    params: { db: ODOO_DB, login: username, password }
                })
            });
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.data?.message || 'Odoo 인증 실패');
            }
            
            if (data.result && data.result.uid) {
                localStorage.setItem('odoo_password', password);
                setOdooLinked(true);
                
                // 인증 성공시 웹뷰 자동 로그인 트리거
                window._odooPendingCreds = { login: username, password, db: ODOO_DB, url: odooApiUrl };
                window.dispatchEvent(new CustomEvent('odoo-auto-login', {
                    detail: { login: username, password, db: ODOO_DB, url: odooApiUrl }
                }));
            } else {
                throw new Error('비밀번호가 올바르지 않습니다.');
            }
        } catch (e) {
            setError('Odoo Link Error: ' + e.message);
            throw e;
        }
    }


    async function loginWithOdoo(username, password) {
        try {
            setError('');
            // 웹뷰가 직접 Odoo 로그인을 처리할 수 있도록 자격증명을 메모리에 임시 저장
            window._odooPendingCreds = { login: username, password, db: ODOO_DB, url: odooApiUrl };
            window.dispatchEvent(new CustomEvent('odoo-auto-login', {
                detail: { login: username, password, db: ODOO_DB, url: odooApiUrl }
            }));

            // 메인 렌더러에서도 인증 확인 (uid 체크용)
            const response = await fetch(`${odooApiUrl}/web/session/authenticate`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    params: { db: ODOO_DB, login: username, password }
                })
            });
            const data = await response.json();
            
            if (data.error) {
                window._odooPendingCreds = null;
                throw new Error(data.error.data?.message || 'Odoo 로그인 실패');
            }
            
            if (data.result && data.result.uid) {
                const odooUser = {
                    uid: `odoo_${data.result.uid}`,
                    email: data.result.username || username,
                    displayName: data.result.name || username,
                    isOdooOnly: true
                };
                const odooProfile = {
                    role: 'field_viewer',
                    department: '현장/조회',
                    displayName: data.result.name || username
                };
                localStorage.setItem('odoo_only_user', JSON.stringify(odooUser));
                setCurrentUser(odooUser);
                setUserProfile(odooProfile);
                setIsOdooOnlyAuth(true);
            } else {
                window._odooPendingCreds = null;
                throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
            }
        } catch (e) {
            setError('Odoo Login Error: ' + e.message);
            throw e;
        }
    }

    async function logout() {
        setUserProfile(null);
        setCurrentUser(null);
        setIsOdooOnlyAuth(false);
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_access_token_expires_at');
        localStorage.removeItem('odoo_only_user');
        
        // 메모리 자격증명 초기화 (다음 사람 로그인 시 이전 사람 세션 방지)
        window._odooPendingCreds = null;
        
        // I-Link 내 OdooWebView 세션 쿠키도 날려줌
        window.dispatchEvent(new CustomEvent('clear-odoo-session'));
        
        if (window.electronAPI?.clearGoogleCookies) {
            try {
                await window.electronAPI.clearGoogleCookies();
            } catch (err) {
                console.error('Failed to clear Google cookies:', err);
            }
        }
        return signOut(auth);
    }

    useEffect(() => {
        // 앱 초기 구동 시 Odoo 전용 사용자(로컬)인지 확인
        const storedOdooUser = localStorage.getItem('odoo_only_user');
        if (storedOdooUser) {
            try {
                const odooUser = JSON.parse(storedOdooUser);
                setCurrentUser(odooUser);
                setUserProfile({
                    role: 'field_viewer',
                    department: '현장/조회',
                    displayName: odooUser.displayName
                });
                setIsOdooOnlyAuth(true);
                setLoading(false);
                return; // Odoo 모드면 Firebase onAuthStateChanged 대기 안 함 (Firebase 토큰 없으므로)
            } catch(e) {
                localStorage.removeItem('odoo_only_user');
            }
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user && !isOdooOnlyAuth) {
                const userEmail = user.email || 'temp@irrobot.com';
                const domain = userEmail.split('@')[1]?.toLowerCase();
                // Add console log for debugging (remove in prod)
                console.log("Auth State Changed: ", userEmail);

                if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
                    console.warn("Unauthorized/Unknown domain logout:", domain);
                    signOut(auth);
                    setCurrentUser(null);
                    setUserProfile(null);
                } else {
                    setCurrentUser(user);
                    // Fetch profile quietly if not already valid
                    try {
                        const profile = await syncUserProfile(user);
                        setUserProfile(profile);
                    } catch (err) {
                        console.error("Profile sync failed", err);
                    }
                    
                    // Odoo 비밀번호가 저장되어 있다면 자동으로 웹뷰 로그인 진행
                    const savedOdooPwd = localStorage.getItem('odoo_password');
                    if (savedOdooPwd) {
                        window._odooPendingCreds = { login: user.email, password: savedOdooPwd, db: ODOO_DB, url: odooApiUrl };
                        window.dispatchEvent(new CustomEvent('odoo-auto-login', {
                            detail: { login: user.email, password: savedOdooPwd, db: ODOO_DB, url: odooApiUrl }
                        }));
                    } else {
                        // 저장된 비밀번호가 없으면 Odoo 로그인(연동) 창 띄우기 요청
                        window.dispatchEvent(new CustomEvent('require-odoo-login'));
                    }
                }
            } else if (!isOdooOnlyAuth) {
                setCurrentUser(null);
                setUserProfile(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, [isOdooOnlyAuth]);

    // devRoleOverride 적용된 실효 프로필 (컴포넌트들은 이것을 사용)
    const effectiveUserProfile = userProfile
        ? { ...userProfile, role: devRoleOverride || userProfile.role }
        : null;

    const value = {
        currentUser,
        userProfile: effectiveUserProfile,
        rawUserProfile: userProfile,
        devRoleOverride,
        setDevRoleOverride,
        login,
        loginWithOdoo,
        linkOdoo,
        isOdooOnlyAuth,
        odooLinked,
        odooApiUrl,
        logout,
        error
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
