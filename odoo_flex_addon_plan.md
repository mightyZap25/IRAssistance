# Odoo 유연근무(Flexible Working) 커스텀 애드온 개발 및 연동 계획

Odoo의 휴가(Time Off) 모듈을 억지로 엮어 쓰는 것은 임시방편일 뿐, 장기적인 근태 관리를 위해서는 **'유연근무 / 출퇴근 시간 변경'만을 전문적으로 다루는 Odoo 커스텀 애드온(모듈)**을 직접 만들어서 설치하는 것이 정석입니다.

## 진행 시 필수 요구사항 (Odoo 관리자)
Odoo 서버(100.67.238.32)가 외부/원격에 설치되어 있기 때문에, 개발된 모듈 코드를 압축 파일(ZIP)로 전달받아 **직접 Odoo 서버의 `addons` 폴더에 업로드하고 모듈을 설치(앱 업데이트)**해 주셔야 합니다.

## 제안하는 시스템 변경 사항

이 작업은 세 가지 계층(Odoo, Node 서버, React 앱) 모두를 수정해야 하는 대규모 작업입니다.

### 1. Odoo 커스텀 애드온 개발 (`ir_flex_working`)
Odoo 서버에 설치할 새로운 모듈의 코드 구조입니다.
- `__init__.py`
- `__manifest__.py`
- `models/hr_flex_request.py`: 새로운 Odoo 데이터베이스 테이블(`hr.flex.request`)을 생성합니다. (신청자, 변경할 날짜, 출퇴근 시간, 결재 상태 등 포함)
- `views/hr_flex_request_views.xml`: Odoo 웹 화면에서도 유연근무 결재 내역을 볼 수 있도록 UI(트리/폼 뷰)를 구성합니다.
- `security/ir.model.access.csv`: 권한 설정 (모든 직원은 신청 가능, 관리자는 승인 가능).

---

### 2. Node.js 백엔드 라우터 분리
더 이상 Odoo의 휴가(Leave) API를 호출하지 않고, 새로 만든 애드온 API를 호출하도록 분리합니다.
**수정 파일**: `odoo_routes.js`
- `POST /flex/request`: `hr.flex.request` 테이블로 데이터 전송
- `GET /flex/list`: 매니저가 승인해야 할 유연근무 리스트 조회 기능 추가
- `POST /flex/approve`: 유연근무 승인 기능 추가

---

### 3. React 프론트엔드 연동
앱 내에서 휴가와 유연근무를 분리하여 서버와 통신하도록 수정합니다.
**수정 파일**: `src/pages/LeaveManagementPage.jsx`
- '근무시간 조정(Flex)' 폼 제출 시 `/leave/request` 대신 `/flex/request` API로 쏘도록 변경.
- 내 결재 내역을 불러올 때 휴가 내역과 유연근무 내역을 합쳐서 보여주도록 변경.

**수정 파일**: `src/components/ApprovalModal.jsx` (결재 모달)
- 관리자가 결재할 때 대상이 휴가인지 유연근무인지 구분하여 각각의 승인 API 호출.

## 검증 계획
1. 완성된 Odoo 모듈 코드(폴더)를 서버 관리자에게 전달.
2. 서버 관리자가 Odoo 서버에 해당 폴더를 넣고 앱 업데이트(설치) 진행.
3. React 앱에서 근무시간 조정을 신청하고, Odoo 화면에 새로운 메뉴(유연근무)에 데이터가 제대로 들어가는지, 앱 결재함에서도 정상 승인이 되는지 테스트.
