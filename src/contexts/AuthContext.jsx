import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from '../firebase';
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

    // Domain restriction configuration
    const ALLOWED_DOMAINS = ['mightyzap.com'];
    
    // Odoo API 기본 설정
    const ODOO_API_URL = 'http://100.67.238.32:8069';
    const ODOO_DB = 'irrocot';

    async function login() {
        try {
            setError('');
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Google OAuth Access Token 획득 및 저장
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential && credential.accessToken) {
                localStorage.setItem('google_access_token', credential.accessToken);
                const expiresIn = credential.expiresIn || 3500;
                localStorage.setItem('google_access_token_expires_at', Date.now() + (expiresIn - 60) * 1000);
            }

            // Domain Check
            const userEmail = user?.email || 'temp@irrocot.com';
            const domain = userEmail.split('@')[1]?.toLowerCase();
            if (!ALLOWED_DOMAINS.includes(domain)) {
                await logout();
                setError(`Unauthorized domain: ${domain}. Only @mightyzap.com accounts are allowed.`);
                return;
            }

            // Sync Profile
            const profile = await syncUserProfile(user);
            setUserProfile(profile);

        } catch (e) {
            setError('Failed to log in: ' + e.message);
        }
    }

    async function loginWithOdoo(username, password) {
        try {
            setError('');
            const response = await fetch(`${ODOO_API_URL}/web/session/authenticate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    params: {
                        db: ODOO_DB,
                        login: username,
                        password: password
                    }
                })
            });
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.data?.message || 'Odoo 로그인 실패');
            }
            
            if (data.result && data.result.uid) {
                // 성공: Odoo-Only 가상 유저 세팅
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
                const userEmail = user.email || 'temp@irrocot.com';
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
        isOdooOnlyAuth,
        logout,
        error
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
