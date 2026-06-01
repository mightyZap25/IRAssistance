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
    initialListWidth = "40%"
}) {
    const [listWidth, setListWidth] = useState(initialListWidth);
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex h-full w-full overflow-hidden bg-slate-50/30 dark:bg-slate-950/20 rounded-[2rem] border border-slate-200/50 dark:border-slate-800/80 shadow-inner relative">
            
            {/* Master List Section */}
            <div 
                className={`transition-all duration-300 ease-in-out border-r border-slate-200/50 dark:border-slate-800/80 flex flex-col min-w-0 h-full ${
                    showDetail ? (isCollapsed ? 'w-0 opacity-0 overflow-hidden' : `w-[${listWidth}]`) : 'w-full'
                }`}
                style={{ width: showDetail && !isCollapsed ? listWidth : (showDetail ? '0px' : '100%') }}
            >
                <div className="flex-1 overflow-hidden">
                    {list}
                </div>
            </div>

            {/* Detail Section */}
            {showDetail && (
                <div className="flex-1 flex flex-col min-w-0 h-full bg-white/40 dark:bg-slate-900/40 backdrop-blur-md animate-in slide-in-from-right duration-300 relative">
                    
                    {/* Detail Header / Control Bar */}
                    <div className="flex-none h-12 border-b border-slate-150/40 dark:border-slate-800/80 flex items-center justify-between px-4 bg-white/60 dark:bg-slate-950/40">
                        <button 
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                            title={isCollapsed ? "목록 보기" : "목록 숨기기"}
                        >
                            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                        
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={onCloseDetail}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-slate-400 hover:text-red-500 transition-all"
                                title="상세 닫기"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        {detail}
                    </div>
                </div>
            )}
        </div>
    );
}
