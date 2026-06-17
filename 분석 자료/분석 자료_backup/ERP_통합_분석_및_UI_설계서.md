# ERP 시스템 통합 분석 및 UI 설계 보고서

본 문서는 ERP 시스템의 세부 분석 자료(문서 2-1 ~ 2-17)와 프론트엔드 공통 컴포넌트 정의서를 통합하여, 부서별 사용 범위, 전체 UI 아키텍처, 그리고 각 페이지별 상세 기능 및 컴포넌트 매핑 현황을 정리한 최종 보고서입니다.

---

## 1. 부서별 사용 페이지 및 컴포넌트 정의 (Task 1)

각 부서의 업무 영역에 따른 주요 페이지와 활용되는 핵심 컴포넌트를 정의합니다.

| 부서 (Department) | 주요 사용 페이지 (Pages) | 핵심 활용 컴포넌트 (Core Components) |
| :--- | :--- | :--- |
| **개발 부서 (Engineering)** | Part List(2-1), BOM 관리(2-2), ECN 관리(2-6), Part 관리(2-11) | `<PartDetailPanel />`, `<BOMDetailPanel />`, `<BOMTreeView />`, `<ApprovalLineSelector />` |
| **QA 부서 (Quality)** | QA 검사 관리(2-14), ECN 관리(2-6) | `<QADefectInputForm />`, `<StatusBadge />`, `<QAInspectionCorrectionModal />`, `<AuditTrailViewer />` |
| **생산 부서 (Production)** | 생산 계획/실행(2-12-Exec), 재고 현황(2-7), 칸반 보드(2-8), 수불 내역(2-17), 창고 적재(2-19) | `<KanbanBoardEngine />`, `<TransactionHistoryTable />`, `<LocationSelectorModal />`, `<UrgentIndicator />` |
| **영업 부서 (Sales)** | 고객사 관리(2-3), 생산의뢰(2-12-Sales) | `<MasterDataGrid />`, `<EntityFormModal />`, `<StatusBadge />` |
| **관리 부서 (Management)** | 대시보드(2-14), 정산 관리(2-16), 제조사 관리(2-9), 공급사 관리(2-10), Part 발주 관리(2-13) | `<MasterDataGrid />`, `<AuditTrailViewer />`, `<TransactionCorrectionModal />`, `<VendorDetailPanel />` |

---

## 2. 전체 시스템 UI 아키텍처 및 레이아웃 (Task 2)

전체 시스템은 **'Component-Driven Architecture'**를 기반으로 하며, 통일된 UI 패턴을 공유합니다.

### 2.1. 기본 레이아웃 구조
- **Sidebar:** 모듈별 네비게이션 및 부서별 권한에 따른 메뉴 필터링.
- **Header:** 글로벌 검색, 사용자 프로필, 긴급 알림(Urgent Alert) 아이콘 배치.
- **Main Content:** 독립된 캡슐화 컴포넌트(Page)가 렌더링되는 영역.

### 2.2. 주요 UI 패턴
1. **마스터 데이터 관리형 (CRUD Pattern):** 
   - 상단 필터바 + 중앙 그리드 카드/리스트 + 우측/중앙 등록 모달.
   - 적용: 고객사, 공급사, 제조사, Part List.
2. **프로세스 추적형 (Pipeline Pattern):** 
   - 상단 요약 지표(Stats) + 중앙 상태별 리스트/칸반 + 상세 진행 모달.
   - 적용: 발주 관리, 생산 의뢰, QA 검사.
3. **상세 분석 및 이력형 (Detail & History Pattern):** 
   - 좌측 정보 패널 + 우측 탭(History, Used-in, BOM 등).
   - 적용: Part 상세, 재고 상세, ECN 상세.

### 2.3. 개발 및 데이터 관리 원칙
- **모듈형 개발 및 개별 동작:** 모든 기능은 모듈 단위로 개발되며, 각 기능은 개별적으로 독립적인 동작이 가능합니다. 코드 또한 모듈별로 분리되어 별도로 관리됩니다.
- **독립적 기능 업데이트:** 전체 시스템에 영향을 주지 않고, 각 개별 기능(모듈) 단위로 독립적인 업데이트가 가능합니다.
- **권한 설정 및 가시성 제어:** 각 기능별로 사용자 권한에 따른 정밀한 설정이 가능하며, 권한 상태에 따라 UI 상에서 특정 기능을 보이거나 보이지 않게 처리할 수 있습니다.
- **데이터 공유 기준:** 모든 데이터 공유 및 연동은 구글 드라이브(Google Drive)와 파이어베이스 DB(Firebase DB)를 기준으로 동작합니다.

---

## 3. 페이지별 상세 기능 및 사용 컴포넌트 맵핑 (Task 3)

| 문서 번호 | 페이지명 | 주요 기능 | 사용되는 UI 컴포넌트 |
| :--- | :--- | :--- | :--- |
| **2-1 / 2-11** | **Part 관리** | 부품 자동 채번, 리비전 관리, 대체품 연결, 일괄 등록 | `<PartDetailPanel />`, `<MasterDataGrid />`, `<EntityFormModal />` |
| **2-2** | **BOM 관리** | 계층 구조 시각화, ECN 연동 수정, PDF/Excel 내보내기 | `<BOMDetailPanel />`, `<BOMTreeView />`, `<EntityFormModal />` |
| **2-3** | **고객사 관리** | B2B 고객사 마스터 관리, 납품 이력 추적(고도화 예정) | `<MasterDataGrid />`, `<EntityFormModal />` |
| **2-14 (2-4)** | **대시보드** | KPI 모니터링, 생산 추적 차트, 위험 재고 알림 | `<StatusBadge />`, `<UrgentIndicator />` |
| **2-6 (2-5)** | **ECN 관리** | 설계 변경 승인, 리비전 자동 업데이트, 변경 Diff 분석 | `<ApprovalLineSelector />`, `<AuditTrailViewer />`, `<StatusBadge />` |
| **2-7** | **재고 현황** | 실시간 재고 병합 조회, 안전재고 경고, 수불 이력 연동 | `<PartDetailPanel />`, `<TransactionHistoryTable />`, `<BOMTreeView />` |
| **2-8** | **칸반 페이지** | 프로젝트별 이슈 트래킹, 드래그 앤 드롭 상태 변경 | `<KanbanBoardEngine />`, `<StatusBadge />` |
| **2-9** | **제조사 관리** | 원천 제조사 마스터 관리, 웹사이트 연동 | `<MasterDataGrid />`, `<EntityFormModal />` |
| **2-10** | **공급사 관리** | 협력사 및 외주업체 마스터 관리, 수정 이력 관리 | `<VendorDetailPanel />`, `<MasterDataGrid />`, `<AuditTrailViewer />` |
| **2-12** | **생산 의뢰** | 영업/생산 이중 모드, BOM 기반 재고 차감, 가용성 체크 | `<KanbanBoardEngine />`, `<StatusBadge />`, `<UrgentIndicator />`, `<BOMTreeView />` |
| **2-13** | **발주 관리** | 구매 발주 파이프라인, QA 연동 입고, 결제 상태 관리 | `<StatusBadge />`, `<SearchAndFilterBar />`, `<UrgentIndicator />` |
| **2-14** | **QA 검사** | 입고/출하 검수, 불량 사유 입력, 검사 성적서 발행 | `<QADefectInputForm />`, `<StatusBadge />`, `<AuditTrailViewer />`, `<QAInspectionCorrectionModal />` |
| **2-16** | **정산 관리** | 이카운트 연동, 매입/매출 전표 관리, 세금계산서 발행 | `<MasterDataGrid />`, `<AuditTrailViewer />`, `<StatusBadge />` |
| **2-17** | **수불 내역** | 전사 자재 이동 로그, 기간별/업체별 필터링 | `<TransactionHistoryTable />`, `<SearchAndFilterBar />`, `<TransactionCorrectionModal />` |
| **2-19** | **창고 적재** | QA 합격품 최종 위치 지정, 재고 확정 처리 | `<LocationSelectorModal />`, `<StatusBadge />`, `<UrgentIndicator />` |

---

## 4. 종합 결론 및 향후 과제

1. **데이터 무결성 보장:** 수불 기록과 재고 증감, ECN 승인과 리비전 업 등 복합 트랜잭션이 발생하는 구간에 Firebase Transaction을 적용하여 데이터 정합성을 확보해야 합니다.
2. **UX 일관성 유지:** `MasterDataGrid`와 `StatusBadge` 등 공통 컴포넌트를 적극 활용하여 사용자에게 일관된 조작 경험을 제공해야 합니다.
3. **외부 연동 고도화:** 이카운트 ERP API 연동을 통해 시스템 내 데이터가 재무 데이터로 끊김 없이 흐르도록 하는 것이 최종 완성도를 결정짓는 핵심 요소입니다.
