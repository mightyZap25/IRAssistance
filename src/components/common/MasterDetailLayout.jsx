import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * MasterDetailLayout
 * 좌측 리스트와 우측 상세 정보를 보여주는 2단 레이아웃 컴포넌트
 */
export default function MasterDetailLayout({ 
    list, 
    detail, 
    showDetail, 
    onCloseDetail,
    initialListWidth = "40%" // 이 값은 이제 오버레이가 아닐 때의 참고용이거나 리스트 밀림 정도에 사용될 수 있습니다.
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex h-full w-full overflow-hidden bg-slate-50/30 dark:bg-slate-950/20 rounded-[2rem] border border-slate-200/50 dark:border-slate-800/80 shadow-inner relative">
            
            {/* Master List Section - Pushes left when detail is shown */}
            <div 
                className={`transition-all duration-500 ease-in-out flex flex-col min-w-0 h-full w-full ${
                    showDetail ? (isCollapsed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100') : 'opacity-100 scale-100'
                }`}
                style={{ 
                    transform: showDetail && !isCollapsed ? 'translateX(-80px)' : 'translateX(0)',
                    filter: showDetail && !isCollapsed ? 'blur(2px) brightness(0.9)' : 'none'
                }}
            >
                <div className="flex-1 overflow-hidden">
                    {list}
                </div>
            </div>

            {/* Detail Section - Absolute Overlay from the right (Narrower) */}
            <div 
                className={`absolute top-0 right-0 h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl transition-all duration-500 ease-in-out z-30 flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-[-30px_0_60px_rgba(0,0,0,0.15)] dark:shadow-[-30px_0_60px_rgba(0,0,0,0.4)] ${
                    showDetail ? 'translate-x-0' : 'translate-x-full'
                }`}
                style={{ width: showDetail ? (isCollapsed ? '100%' : '520px') : '520px' }}
            >
                {showDetail && (
                    <>
                        {/* Detail Header / Control Bar */}
                        <div className="flex-none h-14 border-b border-slate-150/40 dark:border-slate-800/80 flex items-center justify-between px-6 bg-slate-50/50 dark:bg-slate-950/40">
                            <button 
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-400 transition-all hover:scale-110 active:scale-90 shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                                title={isCollapsed ? "목록 보기" : "목록 숨기기"}
                            >
                                {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                            </button>
                            
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Detail View</span>
                                <button 
                                    onClick={onCloseDetail}
                                    className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl text-slate-400 hover:text-red-500 transition-all hover:scale-110 active:scale-90 shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                                    title="상세 닫기"
                                >
                                    <X size={22} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative">
                            {detail}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
