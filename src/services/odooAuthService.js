/**
 * Odoo Authentication Service
 * 
 * Google Workspace OAuth 토큰을 사용하여 Odoo 서버에 인증하고,
 * 반환된 세션 쿠키를 Electron WebView에 주입하는 서비스입니다.
 */

const ODOO_BASE_URL = 'http://192.168.0.100:8069';

export const OdooAuthService = {
    /**
     * Odoo 서버에 로그인 요청을 보냅니다.
     * @param {string} googleIdToken 구글 로그인 후 발급받은 ID 토큰
     * @returns {Promise<string>} Odoo 세션 ID (session_id)
     */
    loginWithGoogle: async (googleIdToken) => {
        try {
            // Odoo의 JSON-RPC 엔드포인트로 커스텀 구글 로그인 요청
            // 실제 구현에서는 Odoo 측에 구글 토큰을 검증하고 세션을 발급하는 커스텀 컨트롤러(Controller)가 필요할 수 있습니다.
            // 또는 Odoo의 기본 auth_oauth 모듈의 라우팅을 모방하여 호출할 수 있습니다.
            
            /* 예시 코드
            const response = await fetch(`${ODOO_BASE_URL}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: googleIdToken })
            });
            const data = await response.json();
            
            // 응답 헤더의 'set-cookie'에서 session_id 추출
            return data.session_id; 
            */
           
            console.log("Odoo Google SSO 엑세스 토큰 전송 (더미 구현): ", googleIdToken);
            return "dummy_odoo_session_id_12345";

        } catch (error) {
            console.error("Odoo 로그인 실패:", error);
            throw error;
        }
    },

    /**
     * Electron의 session API를 사용하여 WebView에 Odoo 세션 쿠키를 강제 주입합니다.
     * 이 작업은 main.js(Node) 쪽으로 IPC 통신을 보내 처리해야 합니다.
     * @param {string} sessionId Odoo 세션 쿠키 값
     */
    injectSessionCookieToWebView: async (sessionId) => {
        const isElectron = window.electronAPI?.isElectron || 
                          (window && window.process && window.process.type === 'renderer');

        if (isElectron && window.electronAPI?.setOdooCookie) {
            // preload.js를 통해 노출된 IPC 메서드 호출
            await window.electronAPI.setOdooCookie({
                url: ODOO_BASE_URL,
                name: 'session_id',
                value: sessionId,
                domain: new URL(ODOO_BASE_URL).hostname
            });
            console.log("Odoo 세션 쿠키가 Electron 스토어에 주입되었습니다.");
        } else {
            console.warn("Electron 환경이 아니거나 IPC 메서드가 정의되지 않았습니다.");
            // 브라우저 환경인 경우 (개발/테스트 목적)
            document.cookie = `session_id=${sessionId}; path=/; domain=${new URL(ODOO_BASE_URL).hostname}`;
        }
    }
};
