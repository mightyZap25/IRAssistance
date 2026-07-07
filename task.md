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
