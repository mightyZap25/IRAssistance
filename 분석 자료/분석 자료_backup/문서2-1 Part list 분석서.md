# [문서 2-1] Part List 및 부품 추가 기능 분석서

## 1. 개요
본 문서는 ERP 시스템 내 `Part List` 화면 및 **부품 추가(생성)** 프로세스를 분석하고, 일반적인 고도화된 ERP 시스템 기준에서 누락되었거나 보완이 필요한 추가 기능 및 수정 요청사항을 정리한 문서입니다.

---

## 2. ERP 내 부품 추가(Part Creation) 시 필수 고려사항
현재 시스템(`PartsPage.jsx`)의 부품 생성 기능에 더해, 실제 제조업 및 양산 환경에서 부품 마스터 데이터를 안전하고 정확하게 관리하기 위해 다음 요소들이 고려되어야 합니다.

### 2.1. 자동 채번 규칙 (Auto-ID Generation) 및 부품 ID 명명 규칙
현재 시스템(`PartsPage.jsx` 및 `PartFormModal.jsx`)에는 이미 고도화된 자동 채번 규칙이 내장되어 있습니다. 부품 생성 시 사용자가 선택한 속성에 따라 시스템이 자동으로 `MasterPartID`와 `PartID`를 조합합니다.

**[현재 구현된 부품 ID 명명 규칙]**
`IR` + `[카테고리 코드]` + `[클래스 코드]` + `[타입 코드]` + `[일련번호 4자리]` 포맷을 따릅니다.
- **카테고리 코드 (Category):** 기구부품 (`M`), 전자부품 (`E`), 구매품 (`O`)
- **클래스 코드 (Class):** Part (`I`), Assembly/Product (`A`)
- **타입 코드 (PartTypeCode):** 다음 15가지 세부 타입 중 첫 글자
  - `A` (Assembly Sub)
  - `P` (Plastic)
  - `S` (Sheet metal)
  - `T` (Turning cut)
  - `D` (Die casting/Sinter)
  - `E` (Extrusion)
  - `R` (Rubber/Silicon)
  - `B` (Board-PCB)
  - `X` (Bearing/Screw/Bond)
  - `C` (Motor/Sol/Switch)
  - `W` (Wire/Harness)
  - `Q` (Analog/Digital Dev)
  - `M` (Electric Module)
  - `L` (Oil/Grease)
  - `V` (Bag/Sticker)
- **일련번호 (Sequence):** 동일 조건의 기존 데이터 개수 + 1 (4자리 패딩, 예: `0001`)
- **예시:** `IREIP0001` (전자부품, Part, Plastic, 1번)
- **최종 PartID 및 리비전(Revision) 적용 대상:** 
  - 외부 기성품인 단순 구매품(Category: `O`)의 경우 스펙 변경이 적어 리비전 관리가 생략될 수 있으나, **자사에서 설계하는 제조/가공물품(기구부품 `M`, 전자부품 `E` 등)의 경우 도면 및 스펙 변경 이력을 완벽히 추적하기 위해 생성 시 반드시 리비전 번호(Revision No)가 결합**되어야 합니다.
  - **최종 부여 예시:** `IREIP0001-1.0` (제조 부품의 경우 마스터 ID 뒤에 `-1.0` 등의 리비전 부착)

**평가 및 보완점:** 
현재 훌륭한 자동화 로직이 구현되어 있으나, 다중 사용자가 동시에 부품을 생성할 경우 일련번호(`nextSeq`)가 충돌할 수 있는 **동시성(Concurrency) 이슈**가 존재합니다. 향후 Firebase Transaction 기능을 활용하여 채번 번호가 중복되지 않도록 락(Lock) 메커니즘을 보완하는 것이 좋습니다.

### 2.2. 결재 및 승인 워크플로우 (Approval Process)
아무나 부품을 등록하고 즉시 발주나 생산에 사용할 수 있으면 기준 정보(Master Data)가 오염됩니다.
- **개선안:** 부품 등록 시 최초 상태를 `임시(Draft)` 또는 `승인대기(Pending)`로 설정하고, 관리자(Manager/Admin)가 승인한 뒤에만 활성화(`Active`) 되도록 워크플로우 추가.

### 2.3. 대체품 (Substitute/Alternative Parts) 관리
부품 수급 지연(Shortage) 시 원활한 생산을 위해 설계 단계부터 대체 가능한 부품을 지정해 두어야 합니다.
- **개선안:** 부품 추가 폼에 '대체 가능 부품(Substitute Part ID)'을 연결할 수 있는 릴레이션(Relation) 필드 추가.

### 2.4. 단종 및 생애주기 관리 (Lifecycle Status)
부품은 단종(EOL: End of Life)되거나 더 이상 사용하지 않는 구형 부품(Obsolete)이 될 수 있습니다.
- **개선안:** 상태 필드 추가 (`Active`, `Prototype`, `Obsolete`, `EOL`).

### 2.5. 환경 및 품질 규제 (Compliance & RoHS)
전자 및 정밀 부품의 경우 유해물질 제한 지침(RoHS) 등의 준수 여부가 중요합니다.
- **개선안:** 체크박스를 통해 RoHS 인증 여부, 인증서 첨부 필수 기능 도입.

---

## 3. 부품 상세 페이지 (Part Details View) 분석

현재 구현된 부품 상세 뷰(`PartsPage.jsx`의 모달)는 고도화된 정보 밀집도를 보여주는 **좌우 분할(Compact Layout)** 방식으로 설계되어 있습니다.

### 3.1. 좌측 영역 (Compact Info)
- **리비전 퀵 스위칭 (Revision Dropdown):** 타이틀 우측에 드롭다운이 배치되어, 과거 버전(예: Rev 1.0)과 최신 버전을 즉각적으로 넘나들며 스펙 변화를 조회할 수 있습니다.
- **정보 그룹화:** `General Information`(분류, 스펙, 단위), `Manufacture & Cost`(제조사, 단가), `Details`(도면/Datasheet 및 Image 링크) 영역으로 카테고리화되어 있어 가독성이 뛰어납니다.

### 3.2. 우측 영역 (Tabs)
1. **Used In (사용처):** `bom` 컬렉션을 조회하여 현재 부품이 쓰이는 상위(Parent) 어셈블리를 목록으로 나열합니다.
2. **In/Out (수불 내역):** `transactions` 컬렉션에서 해당 부품의 입고/출고 내역을 추출하며, 거래 당시의 리비전(Rev)까지 표기합니다.
3. **History (이력):** ECN(설계 변경) 히스토리를 요약해서 보여주며, 클릭 시 아코디언 UI로 확장되어 구체적인 변경 필드(Old Value → New Value)를 보여줍니다.

---

## 4. 기능 추가 및 수정 요청사항 (Action Items)

> 위 분석을 바탕으로 향후 시스템 개발 및 리팩토링 시 반영해야 할 구체적 요청사항입니다.

1. **[기능 개선] 부품 번호 자동 채번 동시성 제어 (Transaction/Lock):**
   - 현재 구현된 부품 ID 자동 채번 로직(`snap.docs.length + 1`)은 다수의 사용자가 동시에 부품을 등록할 경우 일련번호가 중복될 위험이 있습니다. Firestore Transaction(트랜잭션)을 사용하거나 전용 카운터(Counter) 문서를 두어 동시성(Concurrency) 문제를 해결해야 합니다.
2. **[기능 추가] 상태(Status) 필드 및 승인 절차 도입:**
   - 부품 컬렉션에 `Lifecycle` (승인대기, 양산중, 단종) 필드를 추가하고, 승인대기 상태인 부품은 BOM 추가나 발주(PO) 생성이 불가능하도록 제약 조건(Validation) 추가.
3. **[수정 요청] 대체품 연결 UI 구현:**
   - 부품 상세 모달 내에 `Substitutes` 탭을 신설하고, 다른 활성 부품을 검색하여 대체품으로 맵핑할 수 있는 기능 제공.
4. **[기능 추가] 첨부파일 및 규제 정보 필드 강화:**
   - Datasheet 링크뿐만 아니라 RoHS 인증 여부를 체크할 수 있는 토글 버튼 추가.
5. **[수정 요청] 기본 보관 위치(Default Bin/Location) 지정:**
   - 자재를 입고/적재(`WarehousePlacement`)할 때마다 위치를 묻지 않도록, 부품 등록 시 **기본 적재 위치**를 사전 설정할 수 있는 필드 추가.
6. **[기능 추가] 부품 수정 시 파급 효과(Where-Used / Impact Analysis) 시각화:**
   - 부품 상세 페이지 및 정보 수정(특히 ECN이나 Revision Up) 요청 시, 해당 부품이 사용되는 **직접적인 상위 어셈블리(Parent) 뿐만 아니라 최종 완제품(Top-Level Product)까지 추적**하여 수정 시 영향을 받는 전체 제품군 목록을 경고/안내해 주는 기능 추가.
7. **[기능 추가] 항목 카테고리별 고급 필터 및 정렬(Sorting) 기능 구현:**
   - 현재 단순 텍스트 검색(Search)만 제공되는 부분을 개선하여, 대분류(Category), 속성(Class), 상태(Lifecycle) 등 **다양한 기준의 다중 필터(Multi-Filter)**를 적용할 수 있는 기능을 추가. 또한, 리스트 뷰에서 각 컬럼(예: Part ID, 단가, 제조사 등) 헤더 클릭 시 **오름차순/내림차순 정렬(Sorting)**이 가능하도록 UI 및 로직을 보완.
