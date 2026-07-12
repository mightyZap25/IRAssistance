qa 설치하기
  - quality_control 설치하기
이벤트 구글쳇에 연동하기
 - 💡 작동 원리 (구글 챗 웹훅 + Odoo 자동화)
구글 챗(Google Chat)에서 수신용 주소(Webhook) 발급

사내 직원들이 모여있는 구글 챗 스페이스(방) 설정에 가시면 **'앱 및 웹훅(Apps & Webhooks)'**이라는 메뉴가 있습니다.
여기서 웹훅을 하나 생성하면 전용 URL 주소가 하나 발급됩니다. 이 주소로 텍스트를 쏘면 봇(Bot)이 채팅방에 말을 해줍니다.
Odoo에서 '자동화 작업(Automated Actions)' 설정

Odoo 서버에 기본 제공되는 무료 모듈인 **base_automation (자동화 작업)**을 설치합니다.
Odoo 설정에서 이벤트를 지정합니다. (예: "휴가(Time Off) 테이블의 상태(state)가 '승인됨(Approved)'으로 변경될 때마다 이 동작을 실행해라!")
Odoo 내부에서 파이썬 코드로 알림 쏘기

Odoo의 자동화 작업 란에 아래와 같이 단 5줄짜리 간단한 파이썬 스크립트를 입력해 둡니다.



https://www.odoo.com/documentation/19.0/ko/index.html


Viewed .env:1-14

아, 맞습니다! 확인해보니 `.env` 파일에 이미 발급받아 두신 클라이언트 ID가 있네요!

```env
# Google OAuth Credentials
GOOGLE_CLIENT_ID=602256994765-80qpm40ss239veet67n8f0o2mn8vkh4v.apps.googleusercontent.com
```

대표님 말씀이 정확합니다. 새로 만드실 필요 없이 **이 클라이언트 ID를 그대로 Odoo 설정(2단계)에 복사해서 붙여넣으시면 됩니다.**

다만, 기존에 만들어둔 이 클라이언트 ID가 "Odoo 로그인"도 허용해주도록, 구글 클라우드 콘솔에 들어가서 **설정 한 줄만 추가**해주셔야 합니다. (이걸 안 하면 구글 로그인 창에서 `redirect_uri_mismatch` 에러가 납니다.)

### 기존 클라이언트 ID에 Odoo 주소만 추가하기 (Google Cloud Console)
1. 구글 클라우드 콘솔에서 해당 클라이언트 ID 설정 화면으로 들어갑니다.
2. 스크롤을 내려서 **'승인된 리디렉션 URI (Authorized redirect URIs)'** 항목을 찾습니다.
3. `+ URI 추가` 버튼을 누르고 아래 Odoo 주소를 입력한 뒤 저장합니다.
   - `http://100.67.238.32:8069/auth_oauth/signin`

여기까지만 세팅해 주시고, Odoo 설정 화면에 `602256994765-80qpm40ss239veet67n8f0o2mn8vkh4v.apps.googleusercontent.com` 를 넣어주시면 모든 작업이 끝납니다!