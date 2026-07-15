import time
import json
import base64
import logging
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes

_logger = logging.getLogger(__name__)

def get_google_chat_token(service_account_json):
    """ service_account_json 문자열을 파싱해 Google JWT 토큰을 발행하고 access_token을 받습니다. """
    try:
        sa = json.loads(service_account_json)
        private_key_pem = sa['private_key'].encode('utf-8')
        private_key = serialization.load_pem_private_key(private_key_pem, password=None)
        
        iat = int(time.time())
        exp = iat + 3600
        
        header = {"alg": "RS256", "typ": "JWT"}
        payload = {
            "iss": sa["client_email"],
            "sub": sa["client_email"],
            "scope": "https://www.googleapis.com/auth/chat.spaces https://www.googleapis.com/auth/chat.messages https://www.googleapis.com/auth/chat.bot",
            "aud": "https://oauth2.googleapis.com/token",
            "exp": exp,
            "iat": iat
        }
        
        def base64url_encode(data):
            return base64.urlsafe_b64encode(json.dumps(data).encode('utf-8')).decode('utf-8').rstrip('=')
            
        signing_input = f"{base64url_encode(header)}.{base64url_encode(payload)}"
        
        signature = private_key.sign(
            signing_input.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        
        signature_b64 = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')
        jwt_token = f"{signing_input}.{signature_b64}"
        
        res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_token
            },
            timeout=10
        )
        res_data = res.json()
        if 'error' in res_data:
            _logger.error("Google Chat OAuth failed: %s", res_data.get('error_description', res_data['error']))
            return False
        return res_data.get('access_token')
    except Exception as e:
        _logger.error("Failed to generate Google Chat token: %s", str(e))
        return False

def send_chat_dm(env, recipient_email, text_message):
    """ Odoo 시스템 파라미터에서 서비스 계정 키를 읽어 특정 이메일 대상자에게 1:1 DM을 발송합니다. """
    if not recipient_email:
        return False
        
    # 1. Odoo 시스템 파라미터에서 google_chat_service_account_key 조회
    sa_json = env['ir.config_parameter'].sudo().get_param('google_chat_service_account_key')
    if not sa_json:
        _logger.warning("Google Chat Service Account Key is not configured in System Parameters (google_chat_service_account_key).")
        return False
        
    # 2. 토큰 획득
    token = get_google_chat_token(sa_json)
    if not token:
        return False
        
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8"
        }
        
        # 3. 1:1 DM Space Setup
        setup_url = "https://chat.googleapis.com/v1/spaces:setup"
        setup_data = {
            "space": {
                "spaceType": "DIRECT_MESSAGE",
                "singleUserLookupRequest": {
                    "userName": f"users/{recipient_email}"
                }
            }
        }
        
        setup_res = requests.post(setup_url, json=setup_data, headers=headers, timeout=10)
        setup_res_data = setup_res.json()
        
        if 'error' in setup_res_data:
            _logger.error("Google Chat Space setup failed for %s: %s", recipient_email, setup_res_data['error']['message'])
            return False
            
        space_name = setup_res_data.get('name')
        if not space_name:
            return False
            
        # 4. Message 전송
        msg_url = f"https://chat.googleapis.com/v1/{space_name}/messages"
        msg_data = {"text": text_message}
        
        msg_res = requests.post(msg_url, json=msg_data, headers=headers, timeout=10)
        msg_res_data = msg_res.json()
        
        if 'error' in msg_res_data:
            _logger.error("Google Chat Message send failed for %s: %s", recipient_email, msg_res_data['error']['message'])
            return False
            
        _logger.info("Successfully sent Google Chat DM to %s", recipient_email)
        return True
    except Exception as e:
        _logger.error("Error occurred while sending Google Chat DM: %s", str(e))
        return False
