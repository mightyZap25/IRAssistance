import time
import json
import logging
import requests
import base64
import jwt
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

def get_google_access_token(service_account_json):
    """ service_account_json (dict) 기반으로 Google Chat API용 Access Token (User Auth) 발급 """
    try:
        iat = int(time.time())
        exp = iat + 3600
        
        # 관리자 계정 이메일 (임시 하드코딩, 필요시 파라미터화)
        admin_email = "jogak@mightyzap.com"
        
        payload = {
            "iss": service_account_json["client_email"],
            "sub": admin_email, # DWD를 이용한 관리자 계정 임퍼소네이션 (중요!)
            "scope": "https://www.googleapis.com/auth/chat.spaces https://www.googleapis.com/auth/chat.messages",
            "aud": "https://oauth2.googleapis.com/token",
            "exp": exp,
            "iat": iat
        }
        
        # PyJWT를 사용하여 RS256 서명
        encoded_jwt = jwt.encode(
            payload,
            service_account_json["private_key"],
            algorithm="RS256"
        )
        
        # JWT Token Exchange
        token_res = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion': encoded_jwt
            },
            timeout=10
        )
        token_data = token_res.json()
        
        if 'error' in token_data:
            _logger.error("Google OAuth Error: %s", token_data)
            return None
            
        return token_data.get('access_token')
    except Exception as e:
        _logger.error("Failed to generate Google Access Token: %s", str(e))
        return None

def send_chat_dm(env, recipient_email, message_text):
    """ 구글 챗 API를 직접 호출하여 DM 발송 (User Auth 방식) """
    try:
        # 1. 시스템 파라미터에서 JSON 키 읽기
        json_str = env['ir.config_parameter'].sudo().get_param('google_chat.service_account_json')
        if not json_str:
            _logger.error("google_chat.service_account_json 파라미터가 설정되지 않았습니다.")
            return False
            
        sa_json = json.loads(json_str)
        
        # 2. Access Token 발급 (관리자 권한)
        token = get_google_access_token(sa_json)
        if not token:
            return False
            
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        # 3. Space Setup (관리자 계정과 수신자 간의 1:1 DM 스페이스 생성/조회)
        setup_res = requests.post(
            'https://chat.googleapis.com/v1/spaces:setup',
            headers=headers,
            json={
                "space": {
                    "spaceType": "DIRECT_MESSAGE"
                },
                "memberships": [
                    {
                        "member": {
                            "name": f"users/{recipient_email}",
                            "type": "HUMAN"
                        }
                    }
                ]
            },
            timeout=10
        )
        
        setup_data = setup_res.json()
        if 'error' in setup_data:
            _logger.error("Google Chat Space Setup Error: %s", setup_data)
            return False
            
        space_name = setup_data.get('name')
        if not space_name:
            _logger.error("Google Chat API did not return a space name.")
            return False
            
        # 4. Message 발송 (해당 DM 방에 메시지 쏘기)
        msg_res = requests.post(
            f'https://chat.googleapis.com/v1/{space_name}/messages',
            headers=headers,
            json={
                "text": message_text
            },
            timeout=10
        )
        
        msg_data = msg_res.json()
        if 'error' in msg_data:
            _logger.error("Google Chat Message Send Error: %s", msg_data)
            return False
            
        _logger.info("Successfully sent Google Chat DM to %s", recipient_email)
        return True
        
    except Exception as e:
        _logger.error("Exception in send_chat_dm: %s", str(e))
        return False
