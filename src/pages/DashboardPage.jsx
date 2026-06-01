import React, { useState, useEffect, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import { useAuth } from '../contexts/AuthContext';
import { getUserDashboardLayout, saveUserDashboardLayout } from '../services/userService';
import { 
    Settings, LayoutGrid, Plus, RefreshCw, Save, X, Edit3, 
    Trash2, ChevronRight, Grid3X3, Monitor, Smartphone,
    Palette, Type, Bold, AlignLeft, AlignCenter, AlignRight, Check
} from 'lucide-react';

// RGL 필수 스타일 임포트
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Components & Widgets
import WidgetContainer from '../components/dashboard/WidgetContainer';
import MyTasksWidget from '../components/dashboard/widgets/MyTasksWidget';
import PendingApprovalsWidget from '../components/dashboard/widgets/PendingApprovalsWidget';
import ProjectProgressWidget from '../components/dashboard/widgets/ProjectProgressWidget';
import LowInventoryWidget from '../components/dashboard/widgets/LowInventoryWidget';
import PendingPOWidget from '../components/dashboard/widgets/PendingPOWidget';
import AttendanceWidget from '../components/dashboard/widgets/AttendanceWidget';
import TextWidget from '../components/dashboard/widgets/TextWidget';

// Responsive Width Provider 생성
const ResponsiveGridLayout = WidthProvider(Responsive);

const WIDGET_MAP = {
    'task': { component: MyTasksWidget, title: '나의 할 일', defaultSize: { w: 4, h: 8 } },
    'approval': { component: PendingApprovalsWidget, title: '결재 대기 문서', defaultSize: { w: 4, h: 8 } },
    'project': { component: ProjectProgressWidget, title: '프로젝트 공정 현황', defaultSize: { w: 8, h: 10 } },
    'inventory': { component: LowInventoryWidget, title: '재고 부족 알림', defaultSize: { w: 4, h: 10 } },
    'purchase': { component: PendingPOWidget, title: '발주/입고 대기 현황', defaultSize: { w: 4, h: 10 } },
    'attendance': { component: AttendanceWidget, title: '오늘의 근태 현황', defaultSize: { w: 4, h: 8 } },
    'text': { component: TextWidget, title: '텍스트 메모', defaultSize: { w: 4, h: 4 } }
};

const DEFAULT_LAYOUT = [
    { i: 'proj-1', x: 0, y: 0, w: 12, h: 10, type: 'project', viewType: 'list' },
    { i: 'task-1', x: 12, y: 0, w: 4, h: 10, type: 'task', viewType: 'list' },
    { i: 'appr-1', x: 16, y: 0, w: 4, h: 10, type: 'approval', viewType: 'list' }
];

export default function DashboardPage() {
    const { currentUser } = useAuth();
    const [layout, setLayout] = useState([]);
    const [dashboardStyle, setDashboardStyle] = useState({ backgroundColor: '#f8fafc' });
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showCatalog, setShowCatalog] = useState(false);
    const [selectedWidgetId, setSelectedWidgetId] = useState(null);

    const selectedWidget = useMemo(() => layout.find(l => l.i === selectedWidgetId), [layout, selectedWidgetId]);

    useEffect(() => {
        if (currentUser) {
            loadConfig();
        }
    }, [currentUser]);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const config = await getUserDashboardLayout(currentUser.uid);
            if (config && Array.isArray(config.layout)) {
                setLayout(config.layout);
                setDashboardStyle(config.style || { backgroundColor: '#f8fafc' });
            } else if (Array.isArray(config)) {
                setLayout(config);
            } else {
                setLayout(DEFAULT_LAYOUT);
            }
        } catch (error) {
            console.error("Failed to load dashboard config:", error);
            setLayout(DEFAULT_LAYOUT);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLayout = async () => {
        try {
            const config = {
                layout: layout,
                style: dashboardStyle
            };
            await saveUserDashboardLayout(currentUser.uid, config);
            setIsEditMode(false);
            setSelectedWidgetId(null);
            alert("대시보드 디자인이 저장되었습니다.");
        } catch (error) {
            console.error("Failed to save dashboard config:", error);
            alert("설정 저장에 실패했습니다.");
        }
    };

    const updateLayoutState = (newLayout) => {
        setLayout(prev => newLayout.map(newItem => {
            const oldItem = prev.find(o => o.i === newItem.i);
            return {
                i: newItem.i,
                x: newItem.x,
                y: newItem.y,
                w: newItem.w,
                h: newItem.h,
                type: oldItem?.type || 'task',
                viewType: oldItem?.viewType || 'list',
                customStyle: oldItem?.customStyle || { opacity: 100, backgroundColor: '#ffffff' },
                customSettings: oldItem?.customSettings || {}
            };
        }));
    };

    const handleAddWidget = (type) => {
        const info = WIDGET_MAP[type];
        const newId = `${type}-${Date.now()}`;
        const newWidget = {
            i: newId,
            x: 0,
            y: Infinity,
            w: info.defaultSize.w,
            h: info.defaultSize.h,
            type,
            viewType: 'list',
            customStyle: { opacity: 100, backgroundColor: '#ffffff' },
            customSettings: type === 'text' ? { 
                text: '텍스트를 입력하세요', 
                fontSize: 16, 
                textColor: '#334155',
                fontFamily: 'sans-serif',
                fontWeight: 'normal',
                textAlign: 'left'
            } : {}
        };
        setLayout([...layout, newWidget]);
        setSelectedWidgetId(newId);
    };

    const updateWidgetData = (id, updates) => {
        setLayout(prev => prev.map(l => l.i === id ? { ...l, ...updates } : l));
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse bg-slate-50 dark:bg-slate-900"><RefreshCw className="animate-spin text-indigo-600" size={32} /></div>;

    return (
        <div 
            className="w-full h-full flex flex-col relative overflow-hidden transition-colors duration-500"
            style={{ backgroundColor: dashboardStyle.backgroundColor }}
            onClick={() => isEditMode && setSelectedWidgetId(null)}
        >
            <style>{`
                .react-grid-placeholder { background: rgba(79, 70, 229, 0.1) !important; border-radius: 0.5rem !important; opacity: 0.5 !important; z-index: 1 !important; }
                /* 20열 시스템 + 10px 마진에 최적화된 배경 도트 배치 */
                .edit-grid-bg { 
                    background-image: radial-gradient(#cbd5e1 1.5px, transparent 1px); 
                    background-size: 5% 30px; /* 가로 1/20(5%), 세로 높이20+마진10(30px) */
                    background-position: 5px 5px;
                }
                .dark .edit-grid-bg { background-image: radial-gradient(#334155 1.5px, transparent 1px); }
                .react-resizable-handle { z-index: 20 !important; }
                .layout .react-grid-item.resizing,
                .layout .react-grid-item.react-draggable-dragging {
                    transition: none !important;
                }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; }
            `}</style>

            {/* Top Toolbar */}
            <div 
                className="flex justify-between items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 z-20 shadow-sm"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200"><LayoutGrid className="text-white" size={20} /></div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Enterprise Canvas</h1>
                        {isEditMode && <span className="text-[9px] font-black text-rose-500 uppercase animate-pulse ml-2">Design System Active</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isEditMode ? (
                        <>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                <Palette size={14} className="text-slate-400" />
                                <input 
                                    type="color" 
                                    value={dashboardStyle.backgroundColor} 
                                    onChange={(e) => setDashboardStyle({ ...dashboardStyle, backgroundColor: e.target.value })}
                                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-none p-0 shadow-sm"
                                />
                            </div>
                            <button onClick={() => { setShowCatalog(!showCatalog); setSelectedWidgetId(null); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${showCatalog ? 'bg-slate-800 text-white shadow-xl' : 'bg-slate-100 text-slate-600'}`}><Plus size={16} /> 위젯</button>
                            <button onClick={handleSaveLayout} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"><Check size={16} /> 저장 완료</button>
                            <button onClick={() => { setIsEditMode(false); loadConfig(); setSelectedWidgetId(null); }} className="p-2 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-600 text-slate-600 rounded-xl text-xs font-black shadow-sm transition-all"><Edit3 size={16} /> 대시보드 꾸미기</button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 relative overflow-hidden flex ${isEditMode ? 'edit-grid-bg' : ''}`}>
                <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                    <div className="min-h-[1500px] relative p-0">
                        <ResponsiveGridLayout
                            className="layout"
                            layouts={{ lg: layout }}
                            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                            cols={{ lg: 20, md: 20, sm: 12, xs: 8, xxs: 4 }}
                            rowHeight={20}
                            draggableHandle=".drag-handle"
                            isDraggable={isEditMode}
                            isResizable={isEditMode}
                            onDragStop={updateLayoutState}
                            onResizeStop={updateLayoutState}
                            onLayoutChange={(newLayout) => isEditMode && updateLayoutState(newLayout)}
                            margin={[10, 10]}
                            compactType={null}
                            preventCollision={false}
                            useCSSTransforms={true}
                        >
                            {layout.map((item) => {
                                const widgetInfo = WIDGET_MAP[item.type];
                                if (!widgetInfo) return <div key={item.i}>Error</div>;
                                const WidgetComponent = widgetInfo.component;
                                const isText = item.type === 'text';

                                return (
                                    <div key={item.i}>
                                        <WidgetContainer
                                            title={widgetInfo.title}
                                            isEditMode={isEditMode}
                                            onRemove={() => setLayout(layout.filter(l => l.i !== item.i))}
                                            viewType={item.viewType}
                                            onViewTypeChange={(type) => updateWidgetData(item.i, { viewType: type })}
                                            hideTitle={isText}
                                            hideViewTypes={isText}
                                            borderless={isText}
                                            isSelected={selectedWidgetId === item.i}
                                            onSelect={() => isEditMode && setSelectedWidgetId(item.i)}
                                            customStyle={item.customStyle}
                                            onStyleChange={(style) => updateWidgetData(item.i, { customStyle: style })}
                                            className="h-full w-full"
                                        >
                                            <WidgetComponent 
                                                user={currentUser} 
                                                viewType={item.viewType} 
                                                isEditMode={isEditMode}
                                                customSettings={item.customSettings}
                                                onSettingsChange={(settings) => updateWidgetData(item.i, { customSettings: settings })}
                                            />
                                        </WidgetContainer>
                                    </div>
                                );
                            })}
                        </ResponsiveGridLayout>
                    </div>
                </div>

                {/* Overlays Sidebar */}
                {isEditMode && showCatalog && !selectedWidgetId && (
                    <div className="absolute top-0 right-0 bottom-0 w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-30 flex flex-col animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">위젯 카탈로그</h3>
                            <button onClick={() => setShowCatalog(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {Object.entries(WIDGET_MAP).map(([type, info]) => (
                                <button key={type} onClick={() => handleAddWidget(type)} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-850 hover:bg-indigo-50 border border-slate-200 dark:border-slate-800 rounded-2xl transition-all group active:scale-95 text-left">
                                    <div>
                                        <div className="text-xs font-black text-slate-700 dark:text-slate-200 group-hover:text-indigo-600">{info.title}</div>
                                        <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase">기본: {info.defaultSize.w}x{info.defaultSize.h}</div>
                                    </div>
                                    {type === 'text' ? <Type size={18} className="text-slate-300" /> : <Plus size={18} className="text-slate-300" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isEditMode && selectedWidget && (
                    <div className="absolute top-0 right-0 bottom-0 w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-l border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2"><Settings size={14} className="text-indigo-600" /> 스타일 속성</h3>
                            <button onClick={() => setSelectedWidgetId(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Palette size={12}/> 위젯 스타일</label>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-[11px] font-bold text-slate-600">배경색</span>
                                        <input type="color" value={selectedWidget.customStyle?.backgroundColor || '#ffffff'} onChange={(e) => updateWidgetData(selectedWidget.i, { customStyle: { ...selectedWidget.customStyle, backgroundColor: e.target.value } })} className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-none p-0 shadow-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-slate-600">배경 투명도</span>
                                            <span className="text-[10px] font-black text-indigo-600">{selectedWidget.customStyle?.opacity ?? 100}%</span>
                                        </div>
                                        <input 
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={selectedWidget.customStyle?.opacity ?? 100}
                                            onChange={(e) => updateWidgetData(selectedWidget.i, { 
                                                customStyle: { ...selectedWidget.customStyle, opacity: parseInt(e.target.value) } 
                                            })}
                                            className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>

                                    <div className="pt-4 border-t border-slate-50 dark:border-slate-800 space-y-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-[11px] font-bold text-slate-600">테두리 색상</span>
                                            <input 
                                                type="color" 
                                                value={selectedWidget.customStyle?.borderColor || '#e2e8f0'}
                                                onChange={(e) => updateWidgetData(selectedWidget.i, { 
                                                    customStyle: { ...selectedWidget.customStyle, borderColor: e.target.value } 
                                                })}
                                                className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-none p-0 shadow-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-bold text-slate-600">테두리 투명도</span>
                                                <span className="text-[10px] font-black text-indigo-600">{selectedWidget.customStyle?.borderOpacity ?? 100}%</span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="5"
                                                value={selectedWidget.customStyle?.borderOpacity ?? 100}
                                                onChange={(e) => updateWidgetData(selectedWidget.i, { 
                                                    customStyle: { ...selectedWidget.customStyle, borderOpacity: parseInt(e.target.value) } 
                                                })}
                                                className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                            />
                                        </div>
                                    </div>
                                    </div>
                                    </div>

                            {selectedWidget.type === 'text' && (
                                <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Type size={12}/> 타이포그래피</label>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-[11px] font-bold text-slate-600">글꼴</span>
                                                <select value={selectedWidget.customSettings.fontFamily || 'sans-serif'} onChange={(e) => updateWidgetData(selectedWidget.i, { customSettings: { ...selectedWidget.customSettings, fontFamily: e.target.value } })} className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold px-2 py-1.5 rounded-lg outline-none border border-slate-100 dark:border-slate-700">
                                                    <option value="sans-serif">Sans Serif</option>
                                                    <option value="serif">Serif</option>
                                                    <option value="mono">Monospace</option>
                                                    <option value="'GmarketSans', sans-serif">Gmarket Sans</option>
                                                    <option value="'Pretendard', sans-serif">Pretendard</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-[11px] font-bold text-slate-600">크기</span>
                                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                                                    <input type="number" value={selectedWidget.customSettings.fontSize || 16} onChange={(e) => updateWidgetData(selectedWidget.i, { customSettings: { ...selectedWidget.customSettings, fontSize: parseInt(e.target.value) || 12 } })} className="w-10 bg-transparent text-[11px] font-black text-indigo-600 outline-none" />
                                                    <span className="text-[9px] text-slate-400 font-bold">PX</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-[11px] font-bold text-slate-600">서식</span>
                                                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700">
                                                    <button onClick={() => updateWidgetData(selectedWidget.i, { customSettings: { ...selectedWidget.customSettings, fontWeight: selectedWidget.customSettings.fontWeight === 'bold' ? 'normal' : 'bold' } })} className={`p-1.5 rounded-lg transition-all ${selectedWidget.customSettings.fontWeight === 'bold' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`}><Bold size={14} /></button>
                                                    <div className="w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />
                                                    {['left', 'center', 'right'].map(align => (
                                                        <button key={align} onClick={() => updateWidgetData(selectedWidget.i, { customSettings: { ...selectedWidget.customSettings, textAlign: align } })} className={`p-1.5 rounded-lg transition-all ${selectedWidget.customSettings.textAlign === align ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                                                            {align === 'left' ? <AlignLeft size={14}/> : align === 'center' ? <AlignCenter size={14}/> : <AlignRight size={14}/>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-[11px] font-bold text-slate-600">글자색</span>
                                                <input type="color" value={selectedWidget.customSettings.textColor || '#334155'} onChange={(e) => updateWidgetData(selectedWidget.i, { customSettings: { ...selectedWidget.customSettings, textColor: e.target.value } })} className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-none p-0 shadow-sm" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
