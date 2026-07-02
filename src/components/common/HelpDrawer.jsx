import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, HelpCircle, Compass, FileText, ChevronRight, ZoomIn, ZoomOut, MapPin } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { manualData } from './manualData';

// Router path to manual filename map
const PATH_MANUAL_MAP = {
    '/': '26 Dashboard',
    '/dashboard': '26 Dashboard',
    '/parts': '1 부품 관리',
    '/bom': '2 BOM 관리',
    '/customers': '4 고객사 관리',
    '/eco': '3 ECO 승인',
    '/inventory': '12 재고 현황',
    '/manufacturers': '6 제조사 관리',
    '/vendors': '5 공급사 관리',
    '/prod-requests': '7 생산 의뢰',
    '/prod-execution': '8 생산 계획',
    '/purchasing': '9 발주 관리',
    '/qa/config': '15 품질 기준 설정',
    '/qa/process': '16 품질 공정 관리',
    '/qa/dashboard': '18 품질 대시보드',
    '/qa/dev-testing': "19 프로젝트 현황판'",
    '/receiving/placement': '13 WarehousePlacementPage',
    '/receiving/returns': '14 반품 처리 매뉴얼',
    '/transactions': '11 입출고 내역',
    '/outsourcing': '10 외주 관리',
    '/workspace/drive': '31 Google Drive',
    '/workspace/calendar': '28 통합일정',
    '/workspace/mail': '27 통합 메일',
    '/workspace/memo': '33 메모장',
    '/workspace/chat': '29 Google Chat',
    '/workspace/meetings': '30 회의 및 미팅',
    '/hr/attendance': '32 근태 관리',
    '/project/dashboard': "19 프로젝트 현황판'",
    '/project/issues': '21 이슈 트랙커',
    '/project/tasks': '22 Task',
    '/project/task-calendar': '23 업무 캘린더',
    '/project/management': '20 프로젝트 관리',
    '/sales/dashboard': '24 매출 대시보드',
    '/sales/billing': '25 수금 및 영수증',
    '/settings': 'SettingsPage'
};

// Check if a path supports Guided Tour
const TOUR_SUPPORTED_PATHS = {
    '/': 'dashboard',
    '/dashboard': 'dashboard',
    '/prod-requests': 'production-requests',
    '/project/management': 'project-management',
    '/parts': 'parts',
    '/bom': 'bom',
    '/eco': 'eco',
    '/customers': 'customers',
    '/vendors': 'vendors',
    '/manufacturers': 'manufacturers',
    '/purchasing': 'purchasing',
    '/qa/config': 'qa-config',
    '/qa/process': 'qa-process',
    '/transactions': 'transactions',
    '/inventory': 'inventory'
};

// 🧭 텍스트 헤더와 실제 화면 UI 위치 매핑 테이블
const HEADER_LOCATE_MAP = {
    // 생산 의뢰 관련
    '신규 생산 의뢰 등록': { path: '/prod-requests', target: 'pr-register-btn' },
    '의뢰 단계별 탭': { path: '/prod-requests', target: 'pr-tabs' },
    '의뢰 정보 및 뱃지': { path: '/prod-requests', target: 'pr-list-row' },
    '목록 그리드': { path: '/prod-requests', target: 'pr-list-row' },
    
    // 입출고 내역 (수불 원장) 관련
    '수동 입출고': { path: '/transactions', target: 'grid-search' },
    '실시간 수불 집계': { path: '/transactions', target: 'grid-table' },
    '입출고 검색': { path: '/transactions', target: 'grid-search' },
    '입출고 내역 목록': { path: '/transactions', target: 'grid-table' },
    
    // 프로젝트 관리 관련
    '뷰 모드': { path: '/project/management', target: 'pm-view-toggle' },
    '프로젝트 요약': { path: '/project/management', target: 'pm-project-card' },
    '프로젝트 폴더': { path: '/project/management', target: 'pm-folder-item' },

    // 부품 관리 관련
    '부품 등록': { path: '/parts', target: 'parts-register-btn' },
    '일괄 추가': { path: '/parts', target: 'parts-import-btn' },
    '검색 및 필터': { path: '/parts', target: 'grid-search' },
    '필터링 기능': { path: '/parts', target: 'grid-search' },
    '뷰 모드 전환': { path: '/parts', target: 'grid-view-toggle' },
    '표시 열': { path: '/parts', target: 'grid-col-settings' },
    '고급 필터': { path: '/parts', target: 'grid-advanced-filter' },
    '리스트 컬럼': { path: '/parts', target: 'grid-table' },

    // BOM 관리 관련
    '카테고리 관리': { path: '/bom', target: 'bom-category-manager-btn' },
    'BOM 가져오기': { path: '/bom', target: 'bom-import-btn' },
    '완제품 및 조립품 등록': { path: '/bom', target: 'bom-register-btn' },
    '파생 BOM 발의': { path: '/bom', target: 'bom-derive-btn' },
    '이전 버전 비교': { path: '/bom', target: 'bom-compare-btn' },
    'BOM 편집': { path: '/bom', target: 'bom-edit-btn' },
    'BOM 내보내기': { path: '/bom', target: 'bom-export-btn' },
    'BOM 구조 트리': { path: '/bom', target: 'bom-structure' },
    'BOM 구조 패널': { path: '/bom', target: 'bom-structure' },

    // ECO 승인 관련
    'ECO 작성': { path: '/eco', target: 'eco-register-btn' },
    'ECO 등록': { path: '/eco', target: 'eco-register-btn' },
    'ECO 검색': { path: '/eco', target: 'grid-search' },
    'ECO 목록': { path: '/eco', target: 'grid-table' },

    // 고객사 관리 관련
    '고객사 등록': { path: '/customers', target: 'customers-register-btn' },
    '신규 고객사': { path: '/customers', target: 'customers-register-btn' },
    '고객사 검색': { path: '/customers', target: 'grid-search' },
    '고객사 목록': { path: '/customers', target: 'grid-table' },

    // 공급사 관리 관련
    '공급사 등록': { path: '/vendors', target: 'vendors-register-btn' },
    '신규 공급사': { path: '/vendors', target: 'vendors-register-btn' },
    '공급사 검색': { path: '/vendors', target: 'grid-search' },
    '공급사 목록': { path: '/vendors', target: 'grid-table' },

    // 제조사 관리 관련
    '제조사 등록': { path: '/manufacturers', target: 'manufacturers-register-btn' },
    '신규 제조사': { path: '/manufacturers', target: 'manufacturers-register-btn' },
    '제조사 검색': { path: '/manufacturers', target: 'grid-search' },
    '제조사 목록': { path: '/manufacturers', target: 'grid-table' },

    // 발주 관리 관련
    '발주서 작성': { path: '/purchasing', target: 'purchasing-register-btn' },
    '신규 발주': { path: '/purchasing', target: 'purchasing-register-btn' },
    '발주 검색': { path: '/purchasing', target: 'grid-search' },
    '발주 목록': { path: '/purchasing', target: 'grid-table' },

    // 외주 관리 관련
    '외주 검색': { path: '/outsourcing', target: 'grid-search' },
    '외주 목록': { path: '/outsourcing', target: 'grid-table' },

    // 재고 현황 관련
    '위험 재고 기준 설정': { path: '/inventory', target: 'inventory-risk-settings-btn' },
    '안전 재고 기준 설정': { path: '/inventory', target: 'inventory-risk-settings-btn' },
    '재고 검색': { path: '/inventory', target: 'grid-search' },
    '재고 목록': { path: '/inventory', target: 'grid-table' },

    // 품질 기준 설정 관련
    'AI 자동 등록': { path: '/qa/config', target: 'qa-config-auto-btn' },
    '품질 기준 탭': { path: '/qa/config', target: 'qa-config-tabs' },
    '품질 기준 설정 탭': { path: '/qa/config', target: 'qa-config-tabs' },

    // 품질 공정 관리 관련
    '검사 공정 탭': { path: '/qa/process', target: 'qa-process-tabs' },
    '공정 단계별 탭': { path: '/qa/process', target: 'qa-process-tabs' }
};

// React element에서 텍스트만 추출하는 헬퍼 함수
const extractText = (children) => {
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.map(extractText).join('');
    if (children && children.props && children.props.children) return extractText(children.props.children);
    return '';
};

// 헤더 텍스트 매칭을 기반으로 위치 타겟 검색
const getLocateTarget = (headerText) => {
    const cleanText = headerText.replace(/^\d+(\.\d+)*\s+/, '').trim(); // '2.1 상단 액션 툴바' -> '상단 액션 툴바'
    for (const [key, config] of Object.entries(HEADER_LOCATE_MAP)) {
        if (cleanText.includes(key) || key.includes(cleanText)) {
            return config;
        }
    }
    return null;
};

export default function HelpDrawer({ isOpen, onClose, pathname, onStartTour, onTriggerSingleTour, showScreenHints, onToggleScreenHints, onHintNumbersChange }) {
    const [manualTitle, setManualTitle] = useState('');
    const [markdownContent, setMarkdownContent] = useState('');
    const [fontScale, setFontScale] = useState(1.0); // 0.8 ~ 1.4 배율 지원
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const manualFileKey = PATH_MANUAL_MAP[pathname] || '26 Dashboard';
        const rawContent = manualData[manualFileKey] || '';
        
        setManualTitle(manualFileKey.replace(/^\d+\s+/, '')); // Remove prefix digits
        setMarkdownContent(rawContent);

        // 헤더에서 번호를 추출하여 target(data-tour 키) 별 번호 맵을 생성
        const calculatedNumbers = {};
        const lines = rawContent.split('\n');
        lines.forEach(line => {
            const headerMatch = line.match(/^#+\s+(.*)$/);
            if (headerMatch) {
                const headerText = headerMatch[1].trim();
                const targetInfo = getLocateTarget(headerText);
                if (targetInfo) {
                    const numberMatch = headerText.match(/^(\d+(\.\d+)*)/);
                    if (numberMatch) {
                        calculatedNumbers[targetInfo.target] = numberMatch[0];
                    }
                }
            }
        });
        onHintNumbersChange?.(calculatedNumbers);
    }, [pathname]); // pathname 변경 시 재계산

    if (!isOpen) return null;

    const tourKey = TOUR_SUPPORTED_PATHS[pathname];

    // 위치이동 및 하이라이트 동기화 핸들러
    const handleLocateTarget = (targetInfo) => {
        const currentPath = location.pathname;
        if (targetInfo.path && currentPath !== targetInfo.path) {
            navigate(targetInfo.path);
        }

        // 대상 엘리먼트가 화면에 나타날 때까지 대기했다가 클릭 및 하이라이트 시작 (최대 5초)
        let attempts = 0;
        const maxAttempts = 25; // 25 * 200ms = 5초
        const checkInterval = setInterval(() => {
            const element = document.querySelector(`[data-tour="${targetInfo.target}"]`);
            attempts++;
            
            if (element || attempts >= maxAttempts) {
                clearInterval(checkInterval);
                if (element && (element.tagName === 'BUTTON' || element.tagName === 'A' || element.role === 'tab' || element.classList.contains('cursor-pointer'))) {
                    element.click();
                }
                onTriggerSingleTour?.(targetInfo.target);
            }
        }, 200);
    };

    // 위치확인 버튼 컴포넌트
    const LocateButton = ({ text }) => {
        const targetInfo = getLocateTarget(text);
        if (!targetInfo) return null;
        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleLocateTarget(targetInfo);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 ml-2 text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/50 hover:bg-emerald-100 rounded-md cursor-pointer transition-all hover:scale-[1.05] shrink-0"
            >
                <MapPin size={9} /> 위치확인
            </button>
        );
    };

    // Markdown custom components styling with fontScale integration
    const markdownComponents = {
        h1: ({ node, children, ...props }) => {
            const rawText = extractText(children);
            return (
                <h1 
                    style={{ fontSize: `${14 * fontScale}px` }} 
                    className="text-[14px] font-black text-slate-800 border-b-2 border-slate-100 pb-2 mb-4 mt-6 first:mt-0 flex items-center flex-wrap gap-1.5" 
                    {...props}
                >
                    {children}
                    <LocateButton text={rawText} />
                </h1>
            );
        },
        h2: ({ node, children, ...props }) => {
            const rawText = extractText(children);
            return (
                <h2 
                    style={{ fontSize: `${10 * fontScale}px` }} 
                    className="text-[10px] font-black text-indigo-600 bg-indigo-50/80 ring-1 ring-indigo-100/60 px-2.5 py-1 rounded-lg w-fit mb-3 mt-5 flex items-center" 
                    {...props}
                >
                    {children}
                    <LocateButton text={rawText} />
                </h2>
            );
        },
        h3: ({ node, children, ...props }) => {
            const rawText = extractText(children);
            return (
                <h3 
                    style={{ fontSize: `${11 * fontScale}px` }} 
                    className="text-[11px] font-bold text-slate-700 mb-2 mt-4 flex items-center flex-wrap gap-1" 
                    {...props}
                >
                    {children}
                    <LocateButton text={rawText} />
                </h3>
            );
        },
        p: ({ node, ...props }) => <p style={{ fontSize: `${11 * fontScale}px` }} className="text-[11px] text-slate-650 font-bold leading-relaxed mb-3 text-left" {...props} />,
        ul: ({ node, ...props }) => <ul style={{ fontSize: `${11 * fontScale}px` }} className="list-disc list-inside text-slate-650 font-bold space-y-1 mb-3 pl-1 text-left" {...props} />,
        ol: ({ node, ...props }) => <ol style={{ fontSize: `${11 * fontScale}px` }} className="list-decimal list-inside text-slate-650 font-bold space-y-1 mb-3 pl-1 text-left" {...props} />,
        li: ({ node, ...props }) => <li style={{ fontSize: `${11 * fontScale}px` }} className="mb-0.5" {...props} />,
        a: ({ node, href, children, ...props }) => {
            if (href && href.startsWith('tour://')) {
                const tourTarget = href.replace('tour://', '');
                return (
                    <button
                        onClick={() => {
                            onTriggerSingleTour?.(tourTarget);
                        }}
                        style={{ fontSize: `${11 * fontScale}px` }}
                        className="inline text-indigo-600 hover:text-indigo-850 font-bold underline decoration-indigo-300/60 hover:decoration-indigo-600 decoration-1 cursor-pointer transition-colors duration-150"
                    >
                        🧭&nbsp;{children}
                    </button>
                );
            }
            return <a style={{ fontSize: `${11 * fontScale}px` }} className="text-indigo-500 hover:underline font-bold" target="_blank" rel="noreferrer" href={href} {...props}>{children}</a>;
        },
        table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 border border-slate-200/80 rounded-2xl shadow-sm text-left">
                <table className="min-w-full divide-y divide-slate-100 text-[10px]" {...props} />
            </div>
        ),
        thead: ({ node, ...props }) => <thead className="bg-slate-50/70" {...props} />,
        tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-100 bg-white" {...props} />,
        tr: ({ node, ...props }) => <tr className="hover:bg-slate-50/45 transition-colors duration-150" {...props} />,
        th: ({ node, ...props }) => <th style={{ fontSize: `${9 * fontScale}px` }} className="px-3 py-2.5 text-left font-black text-slate-400 uppercase tracking-wider" {...props} />,
        td: ({ node, ...props }) => <td style={{ fontSize: `${10 * fontScale}px` }} className="px-3 py-2.5 font-bold text-slate-650 leading-normal" {...props} />,
        blockquote: ({ node, ...props }) => (
            <blockquote style={{ fontSize: `${11 * fontScale}px` }} className="border-l-4 border-indigo-600 bg-gradient-to-r from-indigo-50/30 to-indigo-50/5 px-4 py-3 rounded-r-2xl font-bold text-indigo-850 my-4 text-left leading-relaxed shadow-sm border-dashed" {...props} />
        ),
        code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isMermaid = match && match[1] === 'mermaid';

            if (isMermaid) {
                return (
                    <div className="my-4 bg-slate-50/80 border border-slate-200 rounded-2xl p-4 text-left font-sans shadow-inner">
                        <div className="flex items-center gap-1.5 mb-2.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 ring-1 ring-indigo-100/50 px-2 py-0.5 rounded-md w-fit">
                            <Compass size={10} className="animate-spin duration-3000" /> 업무 프로세스 흐름도
                        </div>
                        <pre className="text-[10px] font-bold text-slate-550 whitespace-pre-wrap leading-relaxed">
                            {String(children).replace(/flowchart TD|flowchart LR/g, '').trim()}
                        </pre>
                    </div>
                );
            }

            const isInline = !match;

            return isInline ? (
                <span style={{ fontSize: `${10 * fontScale}px` }} className="inline-block bg-indigo-50/70 text-indigo-650 px-1.5 py-0.5 rounded font-mono font-black border border-indigo-100/50 mx-0.5">
                    {children}
                </span>
            ) : (
                <pre className="bg-indigo-50/30 text-indigo-950 border border-indigo-100/50 p-2 rounded-xl overflow-x-auto text-[9.5px] font-mono font-bold leading-normal my-1.5 shadow-inner w-fit max-w-full">
                    <code style={{ fontSize: `${9.5 * fontScale}px` }} {...props}>{children}</code>
                </pre>
            );
        }
    };

    return (
        <div className="fixed top-12 right-0 w-[380px] h-[calc(100vh-48px)] bg-white/95 backdrop-blur-md shadow-[-10px_0_30px_rgba(0,0,0,0.06)] z-[995] flex flex-col border-l border-slate-200/80 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-150 bg-gradient-to-r from-slate-50 to-indigo-50/20 shrink-0 shadow-sm">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-55/80 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm relative overflow-hidden group/icon">
                        <div className="absolute inset-0 bg-indigo-100 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-300" />
                        <HelpCircle size={16} className="relative z-10 transition-transform group-hover/icon:scale-110 duration-200" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">사용자 가이드</span>
                        <h3 className="text-xs font-black text-slate-800 leading-none">{manualTitle}</h3>
                    </div>
                </div>
                <button 
                    onClick={onClose} 
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Font Size & Screen Hint Toolbar (Premium UI) */}
            <div className="mx-4 mt-4 p-3 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col gap-3 shadow-sm text-left">
                {/* Font Size Control */}
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-800 flex items-center gap-1">
                            🔎 설명서 글자 크기
                        </span>
                        <span className="text-[8.5px] text-slate-400 font-bold mt-0.5">글자를 크게 보거나 축소해 볼 수 있습니다.</span>
                    </div>
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl px-1 py-0.5 shadow-sm">
                        <button 
                            disabled={fontScale <= 0.8}
                            onClick={() => setFontScale(prev => Math.max(0.8, prev - 0.2))}
                            className={`p-1.5 rounded-lg transition-all ${fontScale <= 0.8 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-550 hover:bg-slate-100 hover:text-slate-800'}`}
                        >
                            <ZoomOut size={13} />
                        </button>
                        <span className="text-[9.5px] font-black text-indigo-650 px-2 select-none w-10 text-center">
                            {Math.round(fontScale * 100)}%
                        </span>
                        <button 
                            disabled={fontScale >= 1.4}
                            onClick={() => setFontScale(prev => Math.min(1.4, prev + 0.2))}
                            className={`p-1.5 rounded-lg transition-all ${fontScale >= 1.4 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-550 hover:bg-slate-100 hover:text-slate-800'}`}
                        >
                            <ZoomIn size={13} />
                        </button>
                    </div>
                </div>
                
                <div className="border-t border-slate-200/50" />

                {/* Screen Hint Switch */}
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-800 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                            💡 화면에 가이드 전구 표시
                        </span>
                        <span className="text-[8.5px] text-slate-400 font-bold mt-0.5">화면의 주요 버튼 옆에 설명 뱃지를 띄웁니다.</span>
                    </div>
                    <button 
                        onClick={onToggleScreenHints}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none ${showScreenHints ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${showScreenHints ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            {/* Interactive Guided Tour Banner */}
            {tourKey && (
                <div className="mx-4 mt-3.5 p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-100/30 text-left relative overflow-hidden group">
                    <div className="absolute right-[-10px] bottom-[-15px] opacity-10 group-hover:scale-110 transition-transform duration-500">
                        <Compass size={100} />
                    </div>
                    <h4 className="text-xs font-black mb-1.5 flex items-center gap-1.5">
                        <Compass size={14} className="animate-spin duration-3000" />
                        인터랙티브 튜토리얼 가능
                    </h4>
                    <p className="text-[10px] text-indigo-100 font-bold leading-normal mb-3">
                        화면 요소들을 직접 순서대로 콕 찝어 가며 기능을 쉽게 익힐 수 있는 툴팁 가이드 투어를 시작하세요.
                    </p>
                    <button
                        onClick={() => onStartTour(tourKey)}
                        className="px-3.5 py-1.5 bg-white text-indigo-600 hover:bg-indigo-50 hover:scale-[1.03] transition-all text-[10px] font-black rounded-lg shadow-md flex items-center gap-1 active:scale-95 duration-200"
                    >
                        가이드 투어 시작 <ChevronRight size={10} />
                    </button>
                </div>
            )}

            {/* Scrollable Markdown Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 bg-slate-50/20 custom-scrollbar">
                {markdownContent ? (
                    <div className="prose prose-slate max-w-none text-left pb-10">
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                        >
                            {markdownContent}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-3 py-20 text-slate-350">
                        <FileText size={32} className="stroke-[1.5]" />
                        <p className="text-xs font-bold">해당 화면의 매뉴얼이 준비되지 않았습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
