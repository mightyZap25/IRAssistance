import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Compass } from 'lucide-react';

const TOUR_SCENARIOS = {
    'dashboard': [
        {
            selector: '[data-tour="attendance-widget"]',
            title: '근태 현황 위젯',
            content: '전사 임직원의 금일 실시간 출퇴근 상태 및 연차 등의 근태 상황을 대시보드에서 신속하게 모니터링합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="pending-approvals-widget"]',
            title: '결재 대기 위젯',
            content: '내부 결재선에 등록된 ECO 승인 품의 및 구매 발주서 등 본인 확인이 요구되는 검토 문서를 즉각 승인 처리할 수 있는 영역입니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="project-progress-widget"]',
            title: '프로젝트 진척 현황',
            content: '등록된 주요 개발 및 생산 프로젝트의 진척률 마일리지를 실시간으로 모니터링하여 공정 지연 리스크를 사전에 파악합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="low-inventory-widget"]',
            title: '위험 재고 위젯',
            content: '인벤토리 내 자재 수량이 지정한 안전재고 임계치 미만으로 내려간 품목 리스트를 추출하여 빠른 재입고를 유도합니다.',
            placement: 'left'
        }
    ],
    'parts': [
        {
            selector: '[data-tour="parts-register-btn"]',
            title: '단일 부품 신규 등록',
            content: '신규 설계 도면이 발의되었거나 원자재가 신규 확보되었을 때, 고유 Part ID와 규격, 보관창고 등을 기재하여 부품 마스터에 수동 등록합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="parts-import-btn"]',
            title: '엑셀 벌크 일괄 추가',
            content: '신규 프로젝트 등으로 수십 개의 파트 리스트를 대량 등록해야 할 때, 표준 엑셀 폼을 매핑하여 한 번에 일괄 가져오기(Import)를 수행합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '실시간 부품 검색',
            content: '부품명 또는 고유 Part ID의 일부 텍스트만 쳐서 화면 내 수천 개의 자재 마스터 데이터를 즉시 필터링합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-view-toggle"]',
            title: '목록 뷰 모드 전환',
            content: '표 형식으로 수십 개 부품을 상세 대조하는 [리스트 뷰]와, 생애주기 뱃지 및 단가를 블록형으로 한눈에 시각화하는 [카드 뷰]를 변경합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '부품 상세 조회 및 탭 정보',
            content: '부품 그리드의 특정 행을 클릭하면 우측 슬라이딩 패널이 동작하며 해당 부품의 수불 이력, 대체품 링크, 품질 검사 기준 및 상위 조립 BOM 트리(Used In) 등 연관 정보를 즉시 대조합니다.',
            placement: 'top'
        }
    ],
    'bom': [
        {
            selector: '[data-tour="bom-register-btn"]',
            title: '최상위 BOM 등록',
            content: '신규 설계 개발된 최종 완제품(FG) 또는 중간 어셈블리(Assy)의 최상위 부품을 등록하고 BOM 구조 구성을 기획합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="bom-import-btn"]',
            title: 'BOM 일괄 업로드',
            content: 'CAD 프로그램 등에서 출력한 상위 자재와 하위 부품 간의 구성 링크 계층 정보를 엑셀 형식으로 일괄 임포트합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="bom-category-manager-btn"]',
            title: 'BOM 카테고리 관리',
            content: '완제품, 조립품, 반제품, 소모 자재 등 시리즈 체번 규칙과 계통 카테고리를 체계적으로 정비하고 통제합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="bom-structure"]',
            title: 'BOM 다단 계층 트리 패널',
            content: '선택된 제품의 모듈형 하위 계층 구조 트리와 소요 수량을 직관적인 계층적 뷰로 모니터링합니다.',
            placement: 'top'
        }
    ],
    'production-requests': [
        {
            selector: '[data-tour="pr-register-btn"]',
            title: '신규 생산 의뢰 등록',
            content: '새로운 생산 의뢰(PR)를 발의하고 자재 가용성을 시뮬레이션할 수 있는 모달 폼을 실행합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="pr-tabs"]',
            title: '의뢰 단계별 탭 필터',
            content: '의뢰의 현재 진행 상태에 따라 검토함(Active), 생산함(Production), 종결함(History)의 3가지 탭으로 분류하여 관리합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="pr-tab-current"]',
            title: '진행 현황 탭',
            content: '현재 진행 중인 활성 생산 의뢰 목록을 조회하고 자재 현황을 확인합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="pr-tab-history"]',
            title: '전체 이력 탭',
            content: '출하가 완료되었거나 취소/종결된 생산 의뢰의 모든 히스토리 데이터를 추적합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="pr-list-row"]',
            title: '생산 의뢰 정보 및 뱃지',
            content: '등록된 생산 의뢰의 코드, 완제품명, 납기일, 수주 금액 및 실시간 부족 자재 현황 등의 핵심 요약 데이터를 확인하는 행(Row)입니다.',
            placement: 'bottom'
        }
    ],
    'project-management': [
        {
            selector: '[data-tour="pm-view-toggle"]',
            title: '뷰 모드 실시간 전환',
            content: '개발 공정을 직관적으로 파이프라인 형태로 배치하는 [칸반 뷰]와 타임라인 시계열 일정을 모니터링하는 [간트 차트 뷰]를 자유롭게 변경합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="pm-project-card"]',
            title: '프로젝트 요약 카드',
            content: '프로젝트 코드, 실시간 개발 진척률(%), PM 담당자 정보를 한눈에 요약 확인하고 하단 화살표로 드래그 없이 단계를 즉시 변경할 수 있는 카드입니다.',
            placement: 'right'
        },
        {
            selector: '[data-tour="pm-folder-item"]',
            title: '프로젝트 폴더 편집 & 삭제',
            content: '방금 생성/수정하신 폴더 영역입니다! 더블 클릭하여 이름을 인라인으로 바로 변경하거나, 우측 더보기 메뉴를 통해 폴더를 안전하게 삭제할 수 있습니다.',
            placement: 'right'
        }
    ],
    'eco': [
        {
            selector: '[data-tour="eco-register-btn"]',
            title: '설계변경 제안 (ECO 작성)',
            content: '도면 수정, 재질 사양 정정, 단종 예고에 대응하기 위해 신규 설계변경통보(ECO) 요청서를 작성하고 관련 자재를 맵핑합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '설계변경 문서 검색',
            content: '결재가 진행 중이거나 완료된 ECO 번호 또는 부품 코드로 전사 설계변경 이력 아카이브를 신속히 탐색합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: 'ECO 이력 및 결재 승인',
            content: '목록의 행을 클릭하면 우측 검토창에서 설계변경 전후 도면 링크를 확인하고, 승인 권한자는 즉각 최종 승인 결재를 기안합니다.',
            placement: 'top'
        }
    ],
    'customers': [
        {
            selector: '[data-tour="customers-register-btn"]',
            title: '고객사 프로필 신규 개설',
            content: '프로젝트 수주 및 매출 계약을 맺을 신규 바이어 및 고객사의 기본 주소, 세무 정보, 주거래 화폐 기준을 신규 개설합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '고객사 검색',
            content: '고객사 상호명, 사업자 번호, 대표자명으로 등록된 업체 정보를 실시간으로 빠르게 필터링합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '고객사 정보 상세 보기',
            content: '등록된 업체 정보를 조회하고 개별 행을 눌러 상세 연락처 정보와 해당 고객사가 발의한 수주 목록을 연동 분석합니다.',
            placement: 'top'
        }
    ],
    'vendors': [
        {
            selector: '[data-tour="vendors-register-btn"]',
            title: '구매 공급사 신규 개설',
            content: '원자재 자재 발주(PO)를 수행하고 납품을 거래할 신규 공급 협력업체(Vendor) 프로필을 개설합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '공급사 검색',
            content: '공급사 상호명, 대표 품목, 대표자명으로 등록된 업체 정보를 실시간으로 필터링합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '공급사 상세 및 품목 매핑',
            content: '업체별 기본 세금 계산서 정보, 공급 단가 합의 내역 및 과거 발주 실적을 디테일하게 추적합니다.',
            placement: 'top'
        }
    ],
    'manufacturers': [
        {
            selector: '[data-tour="manufacturers-register-btn"]',
            title: '제조사 프로필 등록',
            content: '부품 마스터 작성 시 정식 원제조사명(Manufacturer)을 매핑하여 글로벌 부품 호환성을 유지하기 위한 오리지널 제조사 데이터를 등록합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '제조사 검색',
            content: '제조사명 또는 국가 코드로 정식 등재된 원제조 업체를 조회합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '제조사 리스트',
            content: '전사 부품 승인원 작성 시 참조 가능한 모든 원제조사 마스터를 제공합니다.',
            placement: 'top'
        }
    ],
    'purchasing': [
        {
            selector: '[data-tour="purchasing-register-btn"]',
            title: '신규 자재 발주서 작성',
            content: '안전재고 미달 품목 또는 생산의뢰에 필요한 부족 자재를 수급하기 위해 협력업체별 신규 발주서(PO)를 작성하고 결재를 상신합니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '발주 계약서 검색',
            content: '발주 일련번호(PO-XXX), 공급사 상호명, 발주 담당 엔지니어 이름으로 과거 발주 이력을 신속 검색합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '발주 상세 품목 및 납기 모니터링',
            content: '발주 내역 행을 누르면 납품 예정일자, 부분 입고 수량 및 품질 검사 대기 상황을 정밀 관제합니다.',
            placement: 'top'
        }
    ],
    'qa-config': [
        {
            selector: '[data-tour="qa-config-tabs"]',
            title: '품질 설정 탭 제어',
            content: '발주 입고 시 필수 검사가 요구되는 대상 부품을 매핑하는 [수입검사 품목 설정] 탭과, 판정 시 사용할 [불량 코드 마스터] 탭을 오갑니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="qa-config-auto-btn"]',
            title: '표준 불량 세트 자동 등록',
            content: '수입/중간/출하 검사 시 빈번하게 쓰이는 치수 불량, 스크래치, 크랙 등 표준 10종 불량 코드 마스터를 원클릭으로 일괄 자동 생성합니다.',
            placement: 'left'
        }
    ],
    'qa-process': [
        {
            selector: '[data-tour="qa-process-tabs"]',
            title: '품질 검사 공정 단계 필터',
            content: '입고 자재의 합격을 판단하는 [수입 검사(In)], 제품 생산 도중의 검증을 맡는 [중간 검사(Process)], 최종 출고 전 완제품을 타겟하는 [출하 검사(Out)]로 검사 목록을 나눕니다.',
            placement: 'bottom'
        }
    ],
    'transactions': [
        {
            selector: '[data-tour="grid-search"]',
            title: '수동 입출고 및 바코드 PDA 툴바',
            content: '창고 실사 결과 전산 오차가 났을 때 정정하는 [수동 입출고 등록] 버튼과 PDA 스캔 PDA 시뮬레이터 모드로 전환하는 버튼이 포함된 제어부입니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '수불 내역 원장 그리드',
            content: '회사 창고로 오가는 모든 자재와 완제품의 트랜잭션 타임스탬프, LOT 번호, 보관 랙 위치 및 처리자 이력을 밀착 관제하는 통합 수불 대장입니다.',
            placement: 'top'
        }
    ],
    'inventory': [
        {
            selector: '[data-tour="inventory-risk-settings-btn"]',
            title: '안전/위험 재고 기준 설정',
            content: '완제품(FG) 및 개별 부품의 안전 재고 기준치(Safety Threshold)를 지정하여, 가용 재고가 기준치 미만으로 떨어졌을 때 시스템 자동 위험 경보를 발생시킵니다.',
            placement: 'left'
        },
        {
            selector: '[data-tour="grid-search"]',
            title: '재고 부품 탐색',
            content: '창고 내 특정 자재의 인벤토리 수준을 점검하기 위해 Part ID 또는 부품명으로 실시간 탐색합니다.',
            placement: 'bottom'
        },
        {
            selector: '[data-tour="grid-table"]',
            title: '인벤토리 상태 대조 그리드',
            content: '창고 물리 현재고(OnHand)에서 생산 선점 분(Reserved)을 뺀 실질적 [가용 재고(Available)]와 입고 예정 물량을 실시간 자동 대조 진단합니다.',
            placement: 'top'
        }
    ]
};

export default function GuidedTour({ tourKey, singleTargetKey, onClose }) {
    const steps = React.useMemo(() => {
        if (singleTargetKey) {
            const matched = Object.values(TOUR_SCENARIOS)
                .flat()
                .find(s => s.selector.includes(singleTargetKey));
            if (matched) return [matched];

            // 미등록 data-tour 키인 경우, 하이라이팅을 위한 가상 가이드 스텝 동적 생성
            const title = singleTargetKey.replace(/-btn|-item/g, '').replace(/-/g, ' ').toUpperCase();
            return [{
                selector: `[data-tour="${singleTargetKey}"]`,
                title: `${title} 위치`,
                content: '사용자 가이드가 가리키는 화면 요소의 위치입니다.',
                placement: 'bottom'
            }];
        }
        return TOUR_SCENARIOS[tourKey] || [];
    }, [tourKey, singleTargetKey]);

    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const tooltipRef = useRef(null);
    const [tooltipStyle, setTooltipStyle] = useState({ opacity: 0 });
    // Ref to cancel stale async callbacks when tour changes or component key changes
    const isCancelledRef = useRef(false);

    useEffect(() => {
        // Reset state cleanly whenever the tour target changes
        isCancelledRef.current = true; // cancel any in-flight async operations from previous tour
        setCurrentStep(0);
        setTargetRect(null);
        setTooltipStyle({ opacity: 0 });
        // Re-enable async ops for the new tour after a tick
        const t = setTimeout(() => { isCancelledRef.current = false; }, 0);
        return () => clearTimeout(t);
    }, [tourKey, singleTargetKey]);

    const stepData = steps[currentStep];

    const applyPosition = (element) => {
        // Scroll to element gently if it's out of view
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        
        // Allow time for smooth scroll to finish before calculating rect
        setTimeout(() => {
            if (isCancelledRef.current) return; // tour was reset; discard stale result
            const rect = element.getBoundingClientRect();
            setTargetRect({
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX
            });
        }, 150);
    };

    const updateTargetPosition = () => {
        if (!stepData) return;
        
        // Find element by selector
        let element = document.querySelector(stepData.selector);

        // [자동 탭 활성화 지원]
        if (!element) {
            // 1. 전체 이력 탭의 엘리먼트를 찾을 때
            if (stepData.selector.includes('history') || singleTargetKey?.includes('history')) {
                const historyTab = document.querySelector('[data-tour="pr-tab-history"]');
                if (historyTab) {
                    historyTab.click();
                    setTimeout(updateTargetPosition, 150);
                    return;
                }
            }
            
            // 2. 진행 현황 탭의 엘리먼트를 찾을 때
            if (stepData.selector.includes('current') || singleTargetKey?.includes('current') || singleTargetKey?.includes('register')) {
                const currentTab = document.querySelector('[data-tour="pr-tab-current"]');
                if (currentTab) {
                    currentTab.click();
                    setTimeout(updateTargetPosition, 150);
                    return;
                }
            }
        }

        // 만약 엘리먼트가 없으면, 최대 5초 동안 200ms 간격으로 재탐색 시도 (Firebase 로딩 대기)
        if (!element) {
            let attempts = 0;
            const maxAttempts = 25; // 25 * 200ms = 5초
            const interval = setInterval(() => {
                if (isCancelledRef.current) { // tour was reset; abort polling
                    clearInterval(interval);
                    return;
                }
                element = document.querySelector(stepData.selector);
                attempts++;
                if (element || attempts >= maxAttempts) {
                    clearInterval(interval);
                    if (element) {
                        applyPosition(element);
                    } else {
                        if (!isCancelledRef.current) setTargetRect(null);
                    }
                }
            }, 200);
            return;
        }

        applyPosition(element);
    };

    // Recalculate target position on step change or resize/scroll
    useEffect(() => {
        if (steps.length === 0) {
            setTargetRect(null); // ensure clean state when tour is inactive
            return;
        }
        isCancelledRef.current = false; // allow position updates for new step
        updateTargetPosition();

        window.addEventListener('resize', updateTargetPosition);
        window.addEventListener('scroll', updateTargetPosition);

        return () => {
            window.removeEventListener('resize', updateTargetPosition);
            window.removeEventListener('scroll', updateTargetPosition);
        };
    }, [steps, currentStep]);

    // Listen for actual user clicks on target element to auto-advance
    useEffect(() => {
        if (!stepData) return;
        
        let targetEl = null;
        const handleTargetClick = () => {
            setTimeout(() => {
                handleNext();
            }, 300);
        };

        const timer = setTimeout(() => {
            targetEl = document.querySelector(stepData.selector);
            if (targetEl) {
                targetEl.addEventListener('click', handleTargetClick);
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            if (targetEl) {
                targetEl.removeEventListener('click', handleTargetClick);
            }
        };
    }, [currentStep, stepData]);

    // Position tooltip card based on target rect and placement
    // - Auto-Flip: If not enough space in the specified direction, flip to opposite side
    // - Overlap Prevention: After clamping, if tooltip still overlaps highlight box, push it out
    useEffect(() => {
        if (!targetRect || !stepData || !tooltipRef.current) return;

        const tooltip = tooltipRef.current.getBoundingClientRect();
        const W = window.innerWidth;
        const H = window.innerHeight;
        const padding = 15;
        // Gap must be larger than the glow border offset (10px) to guarantee no overlap
        const gap = 24;

        // Highlight box bounds (including the glow frame offset)
        const hlTop    = targetRect.y - 10;
        const hlBottom = targetRect.y + targetRect.height + 10;
        const hlLeft   = targetRect.x - 10;
        const hlRight  = targetRect.x + targetRect.width + 10;

        // ── Step 1: Choose best placement direction (Auto-Flip) ──────────────
        let placement = stepData.placement || 'bottom';

        // For horizontal directions, flip if not enough room
        if (placement === 'left' && targetRect.x - tooltip.width - gap < padding) {
            placement = 'right'; // not enough space on left → flip to right
        }
        if (placement === 'right' && targetRect.x + targetRect.width + gap + tooltip.width > W - padding) {
            placement = 'left'; // not enough space on right → flip to left
        }
        // For vertical directions, flip if not enough room
        if (placement === 'top' && targetRect.y - tooltip.height - gap < padding) {
            placement = 'bottom';
        }
        if (placement === 'bottom' && targetRect.y + targetRect.height + gap + tooltip.height > H - padding) {
            placement = 'top';
        }

        // ── Step 2: Calculate initial position from chosen direction ─────────
        let top = 0;
        let left = 0;

        switch (placement) {
            case 'top':
                top  = targetRect.y - tooltip.height - gap;
                left = targetRect.x + (targetRect.width / 2) - (tooltip.width / 2);
                break;
            case 'bottom':
                top  = targetRect.y + targetRect.height + gap;
                left = targetRect.x + (targetRect.width / 2) - (tooltip.width / 2);
                break;
            case 'left':
                top  = targetRect.y + (targetRect.height / 2) - (tooltip.height / 2);
                left = targetRect.x - tooltip.width - gap;
                break;
            case 'right':
                top  = targetRect.y + (targetRect.height / 2) - (tooltip.height / 2);
                left = targetRect.x + targetRect.width + gap;
                break;
            default:
                top  = targetRect.y + targetRect.height + gap;
                left = targetRect.x + (targetRect.width / 2) - (tooltip.width / 2);
        }

        // ── Step 3: Viewport boundary clamping ──────────────────────────────
        if (left < padding) left = padding;
        if (left + tooltip.width > W - padding) left = W - tooltip.width - padding;
        if (top < padding) top = padding;
        if (top + tooltip.height > H - padding) top = H - tooltip.height - padding;

        // ── Step 4: Overlap Prevention ───────────────────────────────────────
        // After clamping, check if the tooltip still overlaps the highlight box
        const ttRight  = left + tooltip.width;
        const ttBottom = top + tooltip.height;

        const overlaps =
            left   < hlRight  &&
            ttRight > hlLeft  &&
            top    < hlBottom &&
            ttBottom > hlTop;

        if (overlaps) {
            // Determine which axis has more room to push out, then move accordingly
            const pushRight  = hlRight  + gap;
            const pushLeft   = hlLeft   - tooltip.width - gap;
            const pushBottom = hlBottom + gap;
            const pushTop    = hlTop    - tooltip.height - gap;

            const canRight  = pushRight  + tooltip.width  <= W - padding;
            const canLeft   = pushLeft                    >= padding;
            const canBottom = pushBottom + tooltip.height <= H - padding;
            const canTop    = pushTop                     >= padding;

            // Prefer the direction that the original placement was pointing
            if ((placement === 'right' || placement === 'bottom') && canRight) {
                left = pushRight;
            } else if ((placement === 'left' || placement === 'top') && canLeft) {
                left = pushLeft;
            } else if (canBottom) {
                top  = pushBottom;
                left = targetRect.x + (targetRect.width / 2) - (tooltip.width / 2);
                // re-clamp after adjustment
                if (left < padding) left = padding;
                if (left + tooltip.width > W - padding) left = W - tooltip.width - padding;
            } else if (canTop) {
                top  = pushTop;
                left = targetRect.x + (targetRect.width / 2) - (tooltip.width / 2);
                if (left < padding) left = padding;
                if (left + tooltip.width > W - padding) left = W - tooltip.width - padding;
            } else if (canRight) {
                left = pushRight;
            } else if (canLeft) {
                left = pushLeft;
            }
        }

        setTooltipStyle({
            top: `${top}px`,
            left: `${left}px`,
            opacity: 1
        });
    }, [targetRect, stepData]);

    if (steps.length === 0 || !stepData || !targetRect) return null;

    const isLastStep = currentStep === steps.length - 1;

    const handleNext = () => {
        if (isLastStep) {
            onClose();
            setCurrentStep(0);
        } else {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    return (
        <>
            {/* Glowing target border frame (Micro-interaction) */}
            {targetRect && (
                <div 
                    style={{
                        position: 'fixed',
                        top: `${targetRect.y - 10}px`,
                        left: `${targetRect.x - 10}px`,
                        width: `${targetRect.width + 20}px`,
                        height: `${targetRect.height + 20}px`,
                        pointerEvents: 'none',
                        zIndex: 991,
                        transition: 'all 0.25s ease-out'
                    }}
                    className="rounded-2xl border-[3px] border-indigo-650 animate-pulse shadow-[0_0_25px_rgba(99,102,241,0.8),inset_0_0_12px_rgba(99,102,241,0.45)]"
                />
            )}

            {/* SVG Mask Backdrop Overlay (High quality custom highlight) */}
            {targetRect && (
                <svg className="fixed inset-0 pointer-events-none z-[990] w-full h-full">
                    <defs>
                        <mask id="tour-mask">
                            {/* Mask backdrop is white (fully visible) */}
                            <rect width="100%" height="100%" fill="white" />
                            {/* Target hole is black (cutout/transparent) */}
                            <rect 
                                x={targetRect.x - 6} 
                                y={targetRect.y - 6} 
                                width={targetRect.width + 12} 
                                height={targetRect.height + 12} 
                                rx="10" 
                                fill="black" 
                            />
                        </mask>
                    </defs>
                    {/* Dim layer utilizing mask cutout */}
                    <rect 
                        width="100%" 
                        height="100%" 
                        fill={singleTargetKey ? "rgba(15, 23, 42, 0.05)" : "rgba(15, 23, 42, 0.4)"} 
                        mask="url(#tour-mask)" 
                        className="pointer-events-auto transition-all duration-300"
                    />
                </svg>
            )}

            {/* Guided Tour Tooltip Card */}
            <div 
                ref={tooltipRef}
                style={{
                    position: 'fixed',
                    ...tooltipStyle,
                    transition: 'top 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease'
                }}
                className="w-[320px] bg-white border border-slate-150 rounded-2xl shadow-2xl z-[1000] p-4 flex flex-col gap-3.5 animate-in zoom-in-95 fade-in duration-300 shadow-indigo-100/30"
            >
                {/* Tooltip Header */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 shrink-0">
                        <Compass size={12} className="animate-spin duration-3000" />
                        {singleTargetKey ? '화면 위치 가이드' : `튜토리얼 (${currentStep + 1}/${steps.length})`}
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1 text-slate-355 hover:text-slate-500 hover:bg-slate-50 rounded transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Tooltip Body */}
                <div className="flex flex-col gap-1.5 text-left">
                    <h4 className="text-[14px] font-black text-slate-800 leading-tight">{stepData.title}</h4>
                    <p className="text-[12px] text-slate-550 font-bold leading-relaxed">{stepData.content}</p>
                </div>

                {/* Tooltip Footer Actions */}
                <div className="flex justify-between items-center border-t border-slate-100 pt-3 shrink-0">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 0 || !!singleTargetKey}
                        className={`flex items-center gap-1 text-[11px] font-black py-1 px-2.5 rounded transition-all ${
                            (currentStep === 0 || singleTargetKey) 
                                ? 'text-slate-350 cursor-not-allowed opacity-40' 
                                : 'text-slate-550 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                    >
                        <ChevronLeft size={12} /> 이전
                    </button>

                    <button
                        onClick={handleNext}
                        className="flex items-center gap-1 text-[11px] font-black py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-md shadow-indigo-100/50"
                    >
                        {isLastStep || singleTargetKey ? '확인' : '다음'} <ChevronRight size={12} />
                    </button>
                </div>
            </div>
        </>
    );
}
