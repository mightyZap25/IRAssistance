# 품질 공정 및 모니터링 매뉴얼 (QAProcessPage.md)

## 1. 메뉴 개요 및 경로
* **메뉴 경로**: 품질 관리 > 품질 공정 및 모니터링
* **화면 역할**: 입고되는 원자재의 '수입 검사', 생산 진행 과정의 '중간 검사', 완제품 출고 직전의 '출하 검사'를 종합적으로 처리하고 판정 결과(Pass/Fail)를 기록하여 검사성적서를 발행합니다.

---

## 2. 화면 구성 및 UI 레이블 설명

### 2.1 상단 대분류 탭 (Active Tab)
* **수입 검사 (In)**: 발주를 통해 입고된 원자재 및 부품의 불량 유무를 검사합니다. (`receiving` 컬렉션 사용)
* **출하 검사 (Out)**: 생산 공정이 끝난 완제품을 고객사에 납품하기 전 최종 검사합니다. (`qa_shipping_inspections` 컬렉션 사용)
* **중간 검사 (Process)**: 생산 도중 반제품이나 특정 공정 단계에서 검사를 수행합니다. (`qa_middle_inspections` 컬렉션 사용)

### 2.2 대시보드 통계 영역
* **월간 검사 총량**: 선택된 검사 유형의 누적 합격/불량 수량 합산 값.
* **불량률 (PPM)**: 
  $$\text{불량률} = \left( \frac{\text{불량(Failed)} \text{ 수량}}{\text{총 검사(Total)} \text{ 수량}} \right) \times 100$$
  PPM 지표 관리를 위해 실시간 백분율 계산으로 표현됩니다.
* **이력 차트**: 월별 검사 수량(녹색) 및 불량 수량(빨간색) 추이 그래프.
* **비율 차트 (Pie Chart)**: 최종 판정 결과의 Pass(녹색) / Fail(적색) 비율 원그래프.

### 2.3 서브 탭 (List Tab)
* **검사 대기 (PENDING)**: 판정이 완료되지 않아 검사를 진행해야 하는 목록.
* **검사 완료 (COMPLETED)**: 판정이 종결되어 성적서 출력이 가능한 목록.

### 2.4 메인 검사 그리드 (MasterDataGrid)
* 행을 클릭하면 대기 상태의 경우 실제 규격을 측정하여 통과/불합격을 입력할 수 있는 **[품질 판정 모달(QAProcessModal)]**이 표시됩니다.

#### A. 수입 검사(In) 탭 그리드 컬럼
| 컬럼 레이블 | 데이터 필드 | 설명 |
| :--- | :--- | :--- |
| **문서번호** | `PONumber` | 발주(PO) 생성 시 발급된 발주 번호. |
| **요청일** | `ReceivedAt` | 입고 요청일(날짜 자동 포맷팅 적용). |
| **품목 ID** | `PartID` | 부품 고유 ID. |
| **품명** | `PartName` | 부품의 공식 명칭. |
| **거래처** | `VendorName` | 부품을 공급한 공급업체명. |
| **수량** | `Qty` | 검사 대상 입고 수량. |
| **상태** | `Status` | `WAITING_INSPECTION`인 경우 노란색 배지로 **[검사 대기]** 표시. 완료 시 초록색 배지로 **[검사 완료]**가 표시되며, 우측에 **[성적서 출력] (문서 아이콘)** 버튼이 생성됩니다. |

#### B. 출하 및 중간 검사 탭 그리드 컬럼
| 컬럼 레이블 | 데이터 필드 | 설명 |
| :--- | :--- | :--- |
| **문서번호** | `PRNumber` | 생산의뢰(PR) 고유 번호. |
| **거래처** | `CustomerName` | 생산 의뢰를 수행한 고객사 명칭. |
| **요청일** | `createdAt` | 생산 완료 또는 공정 이관에 따른 검사 요청일. |
| **품목 ID** | `PartID` | 생산 대상 부품/제품 고유 ID. |
| **품명** | `PartName` | 생산 제품 명칭. |
| **수량** | `Qty` | 검사 수량. |
| **상태/결과** | `result` | 최종 품질 합격 시 초록색 **[Pass]**, 불합격 시 빨간색 **[Fail]**, 대기 중일 시 **[대기 중]**으로 표시됩니다. 완료 건 우측에는 동일하게 **[성적서 출력] (문서 아이콘)** 버튼이 생성됩니다. |

---

## 3. 핵심 비즈니스 로직 및 제약 사항

### 3.1 수입검사 데이터 자동 복구 트랜잭션 (Self-Healing Logic)
* **로직 목적**: 과거 시스템 설계 혼선 또는 오동작으로 인해 생산 완료 품목(SourceType: 'PRODUCTION')이 발주 원자재용 '수입 검사(`receiving`)'에 잘못 삽입된 경우를 자동으로 감지합니다.
* **처리 방식**: 페이지 접속 시, 백그라운드에서 `receiving`에 쌓인 데이터 중 생산 타입의 건을 전수 식별한 후, 출하 검사(`qa_shipping_inspections`) 컬렉션으로 복사하고 기존 잘못된 수입검사 레코드는 삭제 처리(`writeBatch` 원자적 반영)합니다.

### 3.2 타 페이지 데이터 동적 크로스 레퍼런스
* 검사 목록에 `CustomerName`, `PartName`, `Qty` 등이 일부 유실되거나 누락된 오래된 데이터가 존재할 경우, 화면 로딩 단계에서 `production_requests` 및 `parts` 마스터 데이터를 캐시 매핑하여 실시간으로 부족한 필드를 보완한 뒤 그리드에 표시합니다.

---

## 4. 데이터베이스(DB) 매핑 정보

| UI 요소 / 상태 | 연동 컬렉션 (Firestore Mock) | PostgreSQL 대응 테이블 | 주요 연동 필드 |
| :--- | :--- | :--- | :--- |
| 수입 검사 데이터 | `receiving` | `receiving` | `PONumber`, `ReceivedAt`, `PartID`, `PartName`, `VendorName`, `Qty`, `Status`, `PassedQty`, `FailedQty` |
| 출하 검사 데이터 | `qa_shipping_inspections` | `qa_shipping_inspections` | `PRNumber`, `PartID`, `PartName`, `CustomerName`, `Qty`, `Status`, `result`, `createdAt` |
| 중간 검사 데이터 | `qa_middle_inspections` | `qa_middle_inspections` | `PRNumber`, `PartID`, `PartName`, `Qty`, `Status`, `result`, `createdAt` |
| 참조 생산 데이터 | `production_requests` | `production_requests` | `PRNumber`, `CustomerName`, `PartID`, `TargetQty` |
| 참조 부품 정보 | `parts` | `parts` | `PartID`, `Name` |
