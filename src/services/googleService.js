import { auth as firebaseAuth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

/**
 * Google Drive API 및 토큰 관리를 위한 공통 서비스
 */

export const ensureValidToken = async () => {
    const token = localStorage.getItem('google_access_token');
    const expiresAt = localStorage.getItem('google_access_token_expires_at');
    const isExpired = !token || !expiresAt || Date.now() > Number(expiresAt);
    
    if (!isExpired) {
        return token;
    }
    
    try {
        const result = await signInWithPopup(firebaseAuth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) {
            localStorage.setItem('google_access_token', credential.accessToken);
            localStorage.setItem('google_access_token_expires_at', Date.now() + 3500 * 1000);
            return credential.accessToken;
        }
    } catch (error) {
        console.error('Google Token Error:', error);
    }
    return null;
};

export const fetchDrive = async (url, options = {}) => {
    const token = await ensureValidToken();
    if (!token) throw new Error('구글 인증이 필요합니다.');

    const res = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Drive API Error');
    }

    return res.json();
};

export const getOrCreateFolder = async (folderName) => {
    // 1. Search for folder
    const q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const data = await fetchDrive(searchUrl);

    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }

    // 2. Create folder if not exists
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const folder = await fetchDrive(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });

    return folder.id;
};
