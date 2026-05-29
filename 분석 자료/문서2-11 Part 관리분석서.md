# [문서 2-11] Part 관리 (부품 마스터) 심층 분석서

## 1. 개요 및 목적 (이전 분석 보완)
앞서 `[문서 2-1]`에서 기초적인 Part List 화면을 분석한 바 있습니다. 본 `[문서 2-11]`은 최신 업데이트된 `src/pages/PartsPage.jsx` 코드를 기반으로, **향상된 상세 모달(Compact Layout)**, **데이터 페칭 최적화**, **권한 제어(RoleGuard)**, **일괄 등록(Bulk Import)** 등 심층적인 기능과 아키텍처를 세부적으로 분석한 자료입니다.

---

## 2. 권한 제어 (Role-Based Access Control)
화면 내 주요 조작계는 `RoleGuard` 컴포넌트를 통해 로그인한 사용자의 권한(`USER_ROLES`)에 따라 렌더링이 제한됩니다.

- **부품 생성 (Create Part):** `ENGINEER` 권한 이상
- **부품 수정 (Edit Part):** `ENGINEER` 권한 이상
- **부품 일괄 등록 (Bulk Import):** `ENGINEER` 권한 이상
- **부품 삭제 (Delete Part):** `MANAGER` 권한 이상 (삭제는 복구가 불가능하므로 엄격한 권한 부여)

---

## 3. 보기 방식 및 데이터 로딩 최적화
- **View Toggle:** `viewMode` 상태를 통해 사용자는 직관적인 '카드 뷰(Card)'와 밀도 높은 '리스트 뷰(List/Table)'를 자유롭게 전환할 수 있습니다.
- **최신 리비전 필터링:** 메인 리스트(`filteredParts`)에는 무수히 많은 과거 리비전 데이터가 섞이는 것을 방지하기 위해 `p.IsLatestRevision === false`인 데이터는 렌더링에서 제외시킵니다.
- **지연 로딩 (Lazy Fetching):** 페이지 초기 로딩 시에는 전체 목록(최대 200건 제한)만 가져오고, 사용자가 특정 부품을 클릭했을 때만 해당 부품의 `Used In`, `Transactions`, `ECN History`, `Revisions` 데이터를 비동기로 불러와 성능을 최적화합니다. (`fetchPartDetails` 함수)

---

## 4. 심층 상세 뷰 (Refactored Compact Layout)
특정 부품 클릭 시 열리는 상세 모달은 화면을 좌(60%) 우(40%)로 나누어 고도의 정보 밀집도를 보여줍니다.

### 4.1. 좌측 영역 (Compact Info)
- **리비전 퀵 스위칭 (Revision Dropdown):** 타이틀 영역 우측에 드롭다운 메뉴가 배치되어, `detailData.revisions` 목록을 바탕으로 과거 버전(예: Rev 1.0)과 최신 버전을 즉각적으로 넘나들며 스펙의 변화를 확인할 수 있습니다.
- **정보 그룹화:** General Information, Manufacture & Cost, Details(Datasheet 및 Image 링크) 영역으로 카테고리화되어 있어 빠르게 스펙을 확인할 수 있습니다.

### 4.2. 우측 영역 (Tabs)
1. **Used In (사용처 탭):** `bom` 컬렉션에서 `ChildID`를 조회하여 현재 부품이 쓰이는 상위(Parent) 어셈블리를 목록으로 나열합니다.
2. **In/Out (입출고 탭):** `transactions` 컬렉션에서 입/출고 내역을 추출하며, 각 거래 당시의 부품 리비전(Rev)까지 추적하여 표시합니다.
3. **History (이력 탭 - 고도화):**
   - ECN(설계 변경) 히스토리를 불러올 때, 시스템은 먼저 `MasterPartID`로 조회하고 데이터가 없으면 `PartID`로 2차 조회를 수행하는 Fallback 로직을 가지고 있습니다.
   - 아코디언(Accordion) UI가 적용되어, ECN 내역(요약) 클릭 시 `expandedEcnId` 상태를 변경해 구체적인 변경 필드(Old Value → New Value)와 상세 설명창을 펼쳐 보여줍니다.

---

## 5. 부품 데이터 입력 및 관리 확장
- **일괄 등록 (Bulk Import):** `BulkPartImportModal` 컴포넌트가 연동되어 있어, 엑셀/CSV 등으로 작성된 대량의 부품 데이터를 한 번에 시스템에 업로드할 수 있는 편의 기능을 제공합니다.

---

## 6. UI 화면 (스크린샷 자리표시자)

> **Part 관리 메인 화면 (카드 / 리스트 뷰 및 일괄등록 버튼)**
> ![Part_메인화면_뷰]()

> **Part 상세 모달 (좌우 분할 Compact 레이아웃 및 Revision 스위칭)**
> ![Part_상세모달_Compact]()

> **ECN History 아코디언 확장 뷰 (상세 변경점 확인)**
> ![Part_History_확장뷰]()
