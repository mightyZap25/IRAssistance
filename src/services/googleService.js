/**
 * Google Drive API 및 토큰 관리 - GIS(Google Identity Services) 기반
 * Client ID: 1045542341137-ldbn9l8sc1q3tt2r2nsfptritdon9qlm.apps.googleusercontent.com
 */

const CLIENT_ID = '602256994765-ntop38htqblvjced9ogfsrfr8kpvc3dc.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents';

export const MEETING_FOLDER_ID = '1ri7Wac0KxC5ze9mLinX01xUTfzRzkrWL';

let tokenClient = null;
let tokenResolve = null;
let tokenReject = null;

/**
 * GIS tokenClient 초기화 (최초 1회)
 */
const initTokenClient = () => {
    if (tokenClient) return;
    if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services 스크립트가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.');
    }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.error) {
                const errMsg = tokenResponse.error_description || tokenResponse.error;
                console.error('[GIS] Token error:', errMsg);
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_access_token_expires_at');
                if (tokenReject) tokenReject(new Error(`구글 인증 오류: ${errMsg}`));
            } else {
                console.log('[GIS] Token acquired successfully.');
                localStorage.setItem('google_access_token', tokenResponse.access_token);
                localStorage.setItem('google_access_token_expires_at', Date.now() + (tokenResponse.expires_in - 60) * 1000);
                if (tokenResolve) tokenResolve(tokenResponse.access_token);
            }
            tokenResolve = null;
            tokenReject = null;
        }
    });
};

/**
 * 유효한 Google OAuth 토큰을 반환. 만료 시 GIS 팝업으로 재발급.
 */
export const ensureValidToken = (forceRefresh = false) => {
    return new Promise((resolve, reject) => {
        const token = localStorage.getItem('google_access_token');
        const expiresAt = localStorage.getItem('google_access_token_expires_at');
        const isValid = !forceRefresh && token && expiresAt && Date.now() < Number(expiresAt);

        if (isValid) {
            console.log('[ensureValidToken] Using cached token.');
            return resolve(token);
        }

        console.log('[ensureValidToken] Requesting new token via GIS...');
        try {
            initTokenClient();
            tokenResolve = resolve;
            tokenReject = reject;
            // Request token silently without forcing consent unless required
            tokenClient.requestAccessToken({ prompt: '' });
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * 인증된 fetch wrapper
 */
export const fetchDrive = async (url, options = {}) => {
    console.log(`[fetchDrive] → ${url}`);
    const token = await ensureValidToken(!!options._retry);
    if (!token) throw new Error('구글 인증 토큰을 가져올 수 없습니다.');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 20000);

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
        console.log(`[fetchDrive] Status: ${res.status}`);

        if (!res.ok) {
            if (res.status === 401 && !options._retry) {
                console.warn('[fetchDrive] 401 - clearing token and retrying...');
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_access_token_expires_at');
                return fetchDrive(url, { ...options, _retry: true });
            }
            let errorMsg = 'Drive API Error';
            try { errorMsg = (await res.json()).error?.message || errorMsg; } catch { /* ignore */ }
            throw new Error(errorMsg);
        }

        return res.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.');
        throw err;
    }
};

/**
 * Google Sheets API: 스프레드시트 메타데이터 조회
 */
export const fetchSpreadsheetMetadata = async (spreadsheetId) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
    return fetchDrive(url);
};

/**
 * Google Sheets API: 특정 범위 값 조회
 */
export const fetchSpreadsheetValues = async (spreadsheetId, range) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    return fetchDrive(url);
};

/**
 * Google Drive: 폴더 탐색 또는 생성
 */
export const getOrCreateFolder = async (folderName) => {
    const q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const data = await fetchDrive(searchUrl);
    if (data.files?.length > 0) return data.files[0].id;

    const folder = await fetchDrive('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
    });
    return folder.id;
};

/**
 * Google Drive: 회의록 폴더의 파일 목록 조회
 */
export const getDriveMeetings = async () => {
    const q = `'${MEETING_FOLDER_ID}' in parents and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,webViewLink)&orderBy=createdTime desc`;
    const data = await fetchDrive(searchUrl);
    return data.files || [];
};

/**
 * Google Sheets API: 새로운 스프레드시트 생성
 */
export const createSpreadsheet = async (title) => {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets';
    return fetchDrive(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { title } })
    });
};

/**
 * Google Sheets API: 스프레드시트 특정 범위 값 업데이트
 */
export const updateSpreadsheetValues = async (spreadsheetId, range, values) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    return fetchDrive(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
    });
};
