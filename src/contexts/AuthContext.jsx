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

    // Domain restriction configuration
    const ALLOWED_DOMAINS = ['irrobot.com'];

    async function login() {
        try {
            setError('');
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Google OAuth Access Token 획득 및 저장
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential && credential.accessToken) {
                localStorage.setItem('google_access_token', credential.accessToken);
            }

            // Domain Check
            // const domain = user.email.split('@')[1]?.toLowerCase();
            // if (!ALLOWED_DOMAINS.includes(domain)) {
            //     await logout();
            //     setError(`Unauthorized domain: ${domain}. Only @irrobot.com accounts are allowed.`);
            //     return;
            // }

            // Sync Profile
            const profile = await syncUserProfile(user);
            setUserProfile(profile);

        } catch (e) {
            setError('Failed to log in: ' + e.message);
        }
    }

    function logout() {
        setUserProfile(null);
        localStorage.removeItem('google_access_token');
        return signOut(auth);
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // const domain = user.email.split('@')[1]?.toLowerCase();
                // Add console log for debugging (remove in prod)
                console.log("Auth State Changed: ", user.email);

                // if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
                //     console.warn("Unauthorized/Unknown domain logout:", domain);
                //     signOut(auth);
                //     setCurrentUser(null);
                //     setUserProfile(null);
                // } else {
                    setCurrentUser(user);
                    // Fetch profile quietly if not already valid
                    try {
                        const profile = await syncUserProfile(user);
                        setUserProfile(profile);
                    } catch (err) {
                        console.error("Profile sync failed", err);
                    }
                // }
            } else {
                setCurrentUser(null);
                setUserProfile(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

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
        logout,
        error
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
