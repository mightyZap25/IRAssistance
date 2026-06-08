import { auth as firebaseAuth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from '../firebase';

/**
 * Google Drive API 및 토큰 관리를 위한 공통 서비스
 */

export const ensureValidToken = async (forceRefresh = false) => {
    console.log("[ensureValidToken] Checking token in localStorage...");
    const token = localStorage.getItem('google_access_token');
    const expiresAt = localStorage.getItem('google_access_token_expires_at');
    const isExpired = forceRefresh || !token || !expiresAt || Date.now() > Number(expiresAt);
    
    console.log("[ensureValidToken] isExpired:", isExpired, "ExpiresAt:", expiresAt ? new Date(Number(expiresAt)).toISOString() : 'N/A');

    if (!isExpired) {
        console.log("[ensureValidToken] Valid token found in localStorage.");
        return token;
    }
    
    try {
        console.log("[ensureValidToken] Token expired or missing. Launching Firebase Google Sign-In Popup...");
        const result = await signInWithPopup(firebaseAuth, googleProvider);
        console.log("[ensureValidToken] Popup result received:", result);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) {
            console.log("[ensureValidToken] New access token stored.");
            localStorage.setItem('google_access_token', credential.accessToken);
            localStorage.setItem('google_access_token_expires_at', Date.now() + 3500 * 1000);
            return credential.accessToken;
        } else {
            console.warn("[ensureValidToken] No access token in credentials.");
        }
    } catch (error) {
        console.error('[ensureValidToken] Google Token Error:', error);
    }
    return null;
};

export const fetchDrive = async (url, options = {}) => {
    console.log(`[fetchDrive] Starting request to: ${url}`);
    const token = await ensureValidToken(!!options._retry);
    if (!token) {
        console.error("[fetchDrive] Failed to obtain valid Google Token.");
        throw new Error('구글 인증이 필요합니다. 팝업 차단이 되어 있는지 확인해 주세요.');
    }

    console.log("[fetchDrive] Google token acquired. Dispatching fetch request...");
    const controller = new AbortController();
    const timeoutVal = options.timeout || 15000;
    const timeoutId = setTimeout(() => {
        console.warn(`[fetchDrive] Timeout of ${timeoutVal}ms reached. Aborting...`);
        controller.abort();
    }, timeoutVal);

    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        clearTimeout(timeoutId);
        console.log(`[fetchDrive] Response status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            if (res.status === 401 && !options._retry) {
                console.warn("[fetchDrive] 401 Unauthorized detected. Clearing token and retrying with fresh token...");
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_access_token_expires_at');
                return fetchDrive(url, { ...options, _retry: true });
            }

            let errorMsg = 'Drive API Error';
            try {
                const error = await res.json();
                errorMsg = error.error?.message || errorMsg;
            } catch (jsonErr) {
                const textErr = await res.text();
                errorMsg = textErr || errorMsg;
            }
            console.error(`[fetchDrive] Request failed: ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const data = await res.json();
        console.log("[fetchDrive] Fetch completed successfully.");
        return data;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("[fetchDrive] Error encountered during fetch:", err);
        if (err.name === 'AbortError') {
            throw new Error('요청 시간이 초과되었습니다 (15초). 네트워크 상태나 시트 권한을 확인해 주세요.');
        }
        throw err;
    }
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

/**
 * Google Sheets API: 지정된 Spreadsheet의 메타데이터(시트 목록 등)를 가져옵니다.
 */
export const fetchSpreadsheetMetadata = async (spreadsheetId) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    return fetchDrive(url);
};

/**
 * Google Sheets API: 지정된 Spreadsheet의 특정 시트 범위의 데이터를 가져옵니다.
 */
export const fetchSpreadsheetValues = async (spreadsheetId, range) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    return fetchDrive(url);
};
