# 전사 재고 현황 매뉴얼 (InventoryPage.md)

## 1. 메뉴 개요 및 경로
* **메뉴 경로**: 재고 관리 > 전사 재고 현황
* **화면 역할**: 회사 내 모든 부품 및 제품의 실시간 재고 수준을 모니터링하고, 생산 의뢰에 따른 예약 재고 및 발주에 따른 입고 예정 재고를 연계 분석하여 동적인 위험(안전) 재고 미달 여부를 진단합니다.

---

## 2. 화면 구성 및 UI 레이블 설명

### 2.1 상단 헤더 영역
* **타이틀**: 전사 재고 현황 (Inventory) / `Dynamic Safety Stock & Reservation Tracking`
* **[위험재고 기준 설정] 버튼 (붉은색 테두리)**: 
  * 역할: 완제품(FG) 및 개별 부품(PART)의 위험 재고 판정 임계값을 설정하는 모달을 엽니다.
  * 연동 컴포넌트: `RiskInventorySettingModal`

### 2.2 퀵 통계 카드 (필터링 카드)
* 각 카드는 클릭 시 메인 리스트를 해당 조건으로 필터링하는 기능을 수행합니다.
1. **전체 품목**: 등록된 전체 부품의 종류 수. (예: `ALL` 필터)
2. **위험 재고 (미달)**: 가용 재고가 안전 재고보다 미달된 품목 수. (예: `RISK` 필터)
3. **예약된 재고 (부족 포함)**: 현재 생산을 위해 잠겨 있거나 재고가 부족해 생산 대기 중인 품목 수. 부족 수량 총량이 배지로 함께 표시됩니다. (예: `RESERVED` 필터)
4. **입고 예정 품목**: 발주가 진행되어 납품을 대기 중인 품목 수. (예: `INCOMING` 필터)

### 2.3 메인 재고 그리드 (MasterDataGrid)
행 클릭 시 개별 부품의 입출고 상세 이력 및 저장 위치를 보여주는 `InventoryDetail` 모달이 표시됩니다.

| 컬럼 레이블 | 데이터 필드 | 표시 형식 및 특수 로직 |
| :--- | :--- | :--- |
| **Part ID** | `PartID` | 고유 부품 번호. `IsRisk`가 true(위험재고)인 경우 우측에 **빨간색 펄스 점**이 표시됩니다. |
| **품목명** | `Name` | 부품 또는 제품의 명칭. |
| **현재고** | `OnHand` | 물리적으로 창고에 존재하는 총재고량 (천 단위 콤마). |
| **예약재고** | `Reserved` | 생산의뢰 진행을 위해 확보(선점)된 재고량. 마이너스 기호(`-`)로 표시되며, 재고 부족으로 확보하지 못한 수량이 있을 시 빨간색 배지로 **"부족: {수량}"**이 실시간 애니메이션과 함께 표시됩니다. |
| **가용재고** | `Available` | 즉시 출고/사용 가능한 재고 (`OnHand` - `Reserved`). 위험재고 상태인 경우 **빨간색 밑줄**과 함께 붉은 글씨로 강조되며, 안전한 경우 **초록색**으로 표시됩니다. |
| **입고예정** | `Incoming` | 공급사 발주를 통해 입고될 예정 수량. 플러스 기호(`+`)와 파란색 글씨로 표시됩니다. |
| **안전재고** | `Safety` | 품목별 안전재고 설정 임계값. 회색 배지 형태로 표시됩니다. |
| **창고 위치** | `Location` | 부품이 보관된 창고의 물리적 주소 또는 명칭 (기본값: '기본 창고'). 위치 아이콘이 함께 렌더링됩니다. |

---

## 3. 핵심 비즈니스 로직 및 제약 사항

### 3.1 예약 및 부족 재고 실시간 계산 (Reservation Logics)
화면이 로드되면 `production_requests` 중 'WAITING_FOR_PARTS', 'PROD_WAITING', 'IN_PRODUCTION' 상태인 건들을 추적하여 BOM 구조에 따라 필요한 부품 수량을 재귀적으로 계산합니다.
* **가용 현재고 분배**: 각 부품의 실제 현재고(`OnHand`) 내에서 요구량이 순차적으로 선점(`Reserved` 누적)됩니다.
* **하위 BOM 전개**: 상위 품목의 재고가 요구량에 미달하여 생산을 해야 할 경우, 그 차이만큼의 생산량에 대응하는 하위 부품들의 소요량을 BOM 기준으로 자동 연산(`processRequirement` 재귀)하여 하위 부품들의 `shortage` 및 `Reserved`를 실시간 누적 산출합니다.

### 3.2 입고 예정 수량 계산 (Incoming Logics)
발주(`purchasing`) 컬렉션에서 상태가 'ORDERING', 'WAITING_DELIVERY', 'WAITING_INSPECTION'인 미완료 발주 건의 품목 리스트를 읽어와, 아직 입고되지 않은 품목별 총합 수량을 실시간 계산(`incomingMap`)하여 그리드에 반영합니다.

### 3.3 동적 안전 재고 추적 (Dynamic Safety Stock)
안전 재고 기준 설정(`inventory_settings`)을 기반으로 안전 재고 임계값을 수립합니다.
* **완제품(FG) 기반 전개**: 완제품의 최소 안전재고 기준치(Threshold)가 설정된 경우, 그 완제품을 구성하는 모든 하위 부품(PART)에 대해서도 BOM 수량을 고려하여 필요한 최소 안전재고량을 재귀적으로 산출(`calculateRecursive`)합니다.
* **최종 안전재고 판정**: 개별 부품 고유의 안전재고 설정치와 완제품 전개로 인해 요구되는 안전재고 수량 중 **최댓값(Math.max)**을 최종 안전재고(`Safety`)로 지정합니다.
* **위험 재고 판단 기준 (`IsRisk`)**:
  $$\text{가용재고(Available)} < \text{최종 안전재고(Safety)}$$
  위 조건 충족 시 위험재고로 즉시 마킹됩니다.

---

## 4. 데이터베이스(DB) 매핑 정보
* **물리 저장 매커니즘**: 본 시스템은 Firestore API를 PostgreSQL JSONB 기반으로 모킹하여 동작합니다.

| UI 요소 / 상태 | 연동 컬렉션 (Firestore Mock) | PostgreSQL 대응 테이블 | 주요 연동 필드 |
| :--- | :--- | :--- | :--- |
| 현재고 및 위치 | `inventory` | `inventory` | `PartID`, `OnHand`, `Location` |
| 기준 부품 정보 | `parts` | `parts` | `PartID`, `Name`, `SafetyStock`, `Lifecycle` |
| 생산의뢰 기반 소요 | `production_requests` | `production_requests` | `Status`, `Items` (또는 `PartID` + `TargetQty`) |
| 자재 전개 기준 | `bom` | `bom` | `ParentID`, `ChildID`, `Quantity` |
| 위험 재고 기준 | `inventory_settings` | `inventory_settings` | `PartID`, `Type` ('FG'/'PART'), `Threshold` |
| 발주 기반 입고예정 | `purchasing` | `purchasing` | `Status`, `Items` (`PartID`, `Qty`) |
