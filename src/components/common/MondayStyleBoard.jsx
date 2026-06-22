import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, MessageSquare, MoreHorizontal, User, Flag, Clock, Paperclip, Plus, X, Check } from 'lucide-react';

const STATUS_CONFIG = {
    todo:    { label: '작업 전', bg: 'bg-[#c4c4c4]', text: 'text-white' },
    working: { label: '진행 중', bg: 'bg-[#fdab3d]', text: 'text-white' },
    done:    { label: '완료',   bg: 'bg-[#00c875]', text: 'text-white' },
    discard: { label: '폐기',   bg: 'bg-[#333333]', text: 'text-white' },
};

const GROUP_COLORS = ['bg-[#579bfc]', 'bg-[#a25ddc]', 'bg-[#00c875]', 'bg-[#e2445c]', 'bg-[#fdab3d]', 'bg-[#0086c0]'];

const PRIORITY_CONFIG = {
    High:   { label: '높음', bg: 'bg-[#e2445c]', text: 'text-white' },
    Medium: { label: '보통', bg: 'bg-[#7888f4]', text: 'text-white' },
    Low:    { label: '낮음', bg: 'bg-[#c4c4c4]', text: 'text-white' },
};

function getTimeAgo(val) {
    if (!val) return '방금 전';
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d)) return '방금 전';
    const diff = Math.floor((new Date() - d) / 86400000);
    if (diff === 0) return '오늘';
    return `${diff}일 전`;
}

export default function MondayStyleBoard({ tasks = [], explicitGroups, users = [], onSelect, onUpdateTask, onDeleteTask, onAddTask, onEditGroupSchedule }) {
    
    // 그룹핑: { [parentName]: [task1, task2, ...] }
    const groups = useMemo(() => {
        if (explicitGroups) {
            return explicitGroups.map((g, idx) => ({
                ...g,
                color: g.color || GROUP_COLORS[idx % GROUP_COLORS.length]
            }));
        }
        
        const map = new Map();
        tasks.forEach(t => {
            const g = t.parent || '미분류';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(t);
        });
        return Array.from(map.entries()).map(([name, items], idx) => ({ 
            id: name,
            name, 
            items, 
            color: GROUP_COLORS[idx % GROUP_COLORS.length] 
        }));
    }, [tasks, explicitGroups]);

    if (groups.length === 0) {
        return (
            <div className="text-center py-20 text-slate-400 border border-slate-200 border-dashed rounded-2xl mx-4">
                <div className="text-4xl mb-3">🗂️</div>
                <p className="text-sm font-black text-slate-500">추가된 그룹 및 태스크가 없습니다</p>
                <p className="text-xs mt-1">상단의 '+ 그룹 추가' 버튼을 눌러 작업을 시작하세요.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-full">
            {groups.map(group => (
                <MondayGroup 
                    key={group.name} 
                    group={group} 
                    users={users} 
                    onSelect={onSelect} 
                    onUpdateTask={onUpdateTask} 
                    onAddTask={onAddTask} 
                    onEditGroupSchedule={onEditGroupSchedule}
                />
            ))}
        </div>
    );
}

function MondayGroup({ group, users, onSelect, onUpdateTask, onAddTask, onEditGroupSchedule }) {
    const [expanded, setExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [draftTask, setDraftTask] = useState({
        title: '',
        type: '버그',
        product: '',
        assigneeUid: '',
        status: 'todo',
        priority: 'Medium',
        startDate: '',
        endDate: ''
    });

    const doneCount = group.items.filter(t => t.status === 'done' || t.completed === true).length;
    const pct = group.items.length > 0 ? (doneCount / group.items.length) * 100 : 0;
    
    const handleAdd = () => {
        if (!draftTask.title.trim()) {
            setIsAdding(false);
            return;
        }
        onAddTask?.(group.id || group.name, draftTask);
        setDraftTask({ title: '', type: '버그', product: '', assigneeUid: '', status: 'todo', priority: 'Medium', startDate: '', endDate: '' });
        setIsAdding(false);
    };

    return (
        <div className="w-full">
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-2 mb-2 select-none group/header cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <button className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${group.color} text-white`}>
                    {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                </button>
                <h3 className={`text-[15px] font-black transition-colors ${group.color.replace('bg-', 'text-')}`}>
                    {group.name}
                </h3>
                <span className="text-[11px] font-bold text-slate-400 ml-2">
                    {group.items.length} Tasks
                </span>
                
                {/* 그룹 (단계) 별 총 기간 표시 & 수정 */}
                <div 
                    className="ml-4 flex items-center gap-2"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditGroupSchedule?.(group);
                    }}
                >
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200 cursor-pointer transition-colors" title="일정 수정하기">
                        <Clock size={11} className="text-slate-400" />
                        <span>
                            {group.schedule?.start ? new Date(group.schedule.start).toLocaleDateString('ko-KR') : '미정'}
                            {' ~ '}
                            {group.schedule?.end ? new Date(group.schedule.end).toLocaleDateString('ko-KR') : '미정'}
                        </span>
                        <span className="ml-1 text-indigo-500">✏️</span>
                    </div>
                </div>
            </div>

            {/* 테이블 아코디언 본문 */}
            {expanded && (
                <div className="ml-[10px] pl-[10px] border-l-[2px] transition-all" style={{ borderColor: group.color.replace('bg-', '').replace(']', '').replace('[', '') }}>
                    <div className="border border-slate-200 rounded-lg overflow-x-auto overflow-y-hidden bg-white shadow-sm">
                        <div className="min-w-max">
                        {/* 테이블 헤더 */}
                        {/* 테이블 헤더 */}
                        <div className="flex items-stretch border-b border-slate-200 bg-white text-[11px] font-black text-slate-400 h-10 select-none">
                            <div className="w-[40px] flex items-center justify-center border-r border-slate-200 shrink-0">
                                <MoreHorizontal size={14} className="text-slate-300 opacity-50"/>
                            </div>
                            <div className="flex-1 px-4 flex items-center border-r border-slate-200 min-w-[200px]">항목 명칭</div>
                            <div className="w-[80px] flex items-center justify-center border-r border-slate-200 shrink-0">유형</div>
                            <div className="w-[100px] flex items-center justify-center border-r border-slate-200 shrink-0">제품명</div>
                            <div className="w-[80px] flex items-center justify-center border-r border-slate-200 shrink-0">담당자</div>
                            <div className="w-[130px] flex items-center justify-center border-r border-slate-200 shrink-0">상태</div>
                            <div className="w-[90px] flex items-center justify-center border-r border-slate-200 shrink-0">시작일</div>
                            <div className="w-[90px] flex items-center justify-center border-r border-slate-200 shrink-0">마감일</div>
                            <div className="w-[110px] flex items-center justify-center border-r border-slate-200 shrink-0">우선순위</div>
                            <div className="w-[150px] flex items-center justify-center border-r border-slate-200 shrink-0">설명 / 메모</div>
                            <div className="w-[50px] flex items-center justify-center border-r border-slate-200 shrink-0"><Paperclip size={12}/></div>
                            <div className="w-[90px] flex items-center justify-center border-r border-slate-200 shrink-0">업데이트</div>
                            <div className="w-[40px] flex items-center justify-center shrink-0"><Plus size={14} className="text-slate-300"/></div>
                        </div>

                        {/* 태스크 행 목록 */}
                        <div className="divide-y divide-slate-100 bg-white">
                            {group.items.map(task => (
                                <MondayRow 
                                    key={task.id} 
                                    task={task} 
                                    users={users} 
                                    onSelect={onSelect} 
                                    onUpdateTask={onUpdateTask} 
                                    groupColor={group.color}
                                />
                            ))}

                            {/* + 항목 추가 행 */}
                            {!isAdding ? (
                                <div 
                                    className="flex items-center h-10 bg-white hover:bg-slate-50 transition-colors cursor-pointer group/add border-b border-slate-200"
                                    onClick={() => {
                                        setDraftTask({ title: '', type: '버그', product: '', assigneeUid: '', status: 'todo', priority: 'Medium', startDate: '', endDate: '' });
                                        setIsAdding(true);
                                    }}
                                >
                                    <div className="w-[40px] h-full flex items-center justify-center border-r border-slate-200 shrink-0 relative bg-slate-50/50">
                                        <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${group.color}`} />
                                        <div className="w-3.5 h-3.5 rounded border border-slate-300 opacity-50 flex items-center justify-center">
                                            <span className="text-[10px] font-black text-slate-400 group-hover/add:text-indigo-500 transition-colors">+</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 px-4 text-[12px] font-bold text-slate-400 group-hover/add:text-indigo-500 transition-colors">
                                        이 항목의 빈 행을 클릭하여 새 태스크 추가
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-stretch h-10 bg-indigo-50/10 transition-colors border-b border-indigo-200">
                                    <div className="w-[40px] flex items-center justify-center border-r border-slate-200 shrink-0 relative bg-slate-50/50">
                                        <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${group.color}`} />
                                    </div>
                                    
                                    {/* 2. 항목 명칭 */}
                                    <div className="flex-1 px-2 flex items-center border-r border-slate-200 border-l-4 border-indigo-400 min-w-[200px]">
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={draftTask.title}
                                            onChange={e => setDraftTask(p => ({ ...p, title: e.target.value }))}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
                                                if (e.key === 'Escape') setIsAdding(false);
                                            }}
                                            placeholder="태스크 명칭..."
                                            className="w-full bg-white px-2 py-1 text-[12px] font-bold outline-none border border-slate-200 focus:border-indigo-400 rounded"
                                        />
                                    </div>

                                    {/* 3. 유형 */}
                                    <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.type}
                                            onChange={e => setDraftTask(p => ({ ...p, type: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            <option value="버그">버그</option>
                                            <option value="기능">기능</option>
                                        </select>
                                    </div>

                                    {/* 4. 제품명 */}
                                    <div className="w-[100px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <input 
                                            type="text"
                                            value={draftTask.product}
                                            onChange={e => setDraftTask(p => ({ ...p, product: e.target.value }))}
                                            placeholder="제품명"
                                            className="w-full h-7 bg-white px-2 border border-slate-200 rounded text-[11px] font-bold outline-none focus:border-indigo-400"
                                        />
                                    </div>

                                    {/* 5. 담당자 */}
                                    <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.assigneeUid}
                                            onChange={e => setDraftTask(p => ({ ...p, assigneeUid: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            <option value="">미지정</option>
                                            {users.map(u => (
                                                <option key={u.uid} value={u.uid}>{u.displayName}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 6. 상태 */}
                                    <div className="w-[130px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.status}
                                            onChange={e => setDraftTask(p => ({ ...p, status: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 7. 시작일 */}
                                    <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <input 
                                            type="date"
                                            value={draftTask.startDate}
                                            onChange={e => setDraftTask(p => ({ ...p, startDate: e.target.value }))}
                                            className="w-full h-7 bg-white px-1 border border-slate-200 rounded text-[10px] font-bold outline-none focus:border-indigo-400"
                                        />
                                    </div>

                                    {/* 8. 마감일 */}
                                    <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <input 
                                            type="date"
                                            value={draftTask.endDate}
                                            onChange={e => setDraftTask(p => ({ ...p, endDate: e.target.value }))}
                                            className="w-full h-7 bg-white px-1 border border-slate-200 rounded text-[10px] font-bold outline-none focus:border-indigo-400"
                                        />
                                    </div>

                                    {/* 9. 우선순위 */}
                                    <div className="w-[110px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.priority}
                                            onChange={e => setDraftTask(p => ({ ...p, priority: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 빈 공간들 */}
                                    <div className="w-[150px] border-r border-slate-200 shrink-0 bg-white/50"></div>
                                    <div className="w-[50px] border-r border-slate-200 shrink-0 bg-white/50"></div>
                                    <div className="w-[90px] border-r border-slate-200 shrink-0 bg-white/50"></div>

                                    {/* 저장 버튼 */}
                                    <div className="w-[40px] shrink-0 flex items-center justify-center bg-white border-l border-slate-200 sticky right-0 z-10 shadow-[-4px_0_10px_rgba(0,0,0,0.02)]">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleAdd(); }} 
                                            disabled={!draftTask.title.trim()}
                                            className={`px-2 py-1 text-[10px] font-black rounded shadow-sm transition-colors ${draftTask.title.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                            title="저장"
                                        >
                                            <Check size={12}/>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 하단 요약 (진행률) */}
                        <div className="flex items-stretch border-t border-slate-200 bg-slate-50 h-8">
                            {/* 진행률 컬러 바 */}
                            <div className="w-[140px] flex items-center justify-center border-r border-slate-200 p-1">
                                {group.items.length > 0 ? (
                                    <div className="w-full h-full flex rounded-sm overflow-hidden border border-black/5">
                                        {Object.entries(STATUS_CONFIG).map(([sKey, cfg]) => {
                                            const count = group.items.filter(t => (t.status || (t.completed ? 'done' : 'todo')) === sKey).length;
                                            const ratio = (count / group.items.length) * 100;
                                            if (ratio === 0) return null;
                                            return (
                                                <div key={sKey} className={`h-full ${cfg.bg}`} style={{ width: `${ratio}%` }} title={`${cfg.label} ${count}건`}/>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="w-full h-full bg-[#c4c4c4] rounded-sm opacity-30" />
                                )}
                            </div>
                            <div className="flex-1 px-4 flex items-center justify-end border-r border-slate-200">
                                <span className="text-[10px] font-black text-slate-400">{Math.round(pct)}% 완료</span>
                            </div>
                            <div className="w-[100px] border-r border-slate-200" />
                            <div className="w-[120px] border-r border-slate-200" />
                            <div className="w-[60px]" />
                        </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}

function MondayRow({ task, users, onSelect, onUpdateTask, groupColor }) {
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const curStatus = task.status || (task.completed ? 'done' : 'todo');
    const statusCfg = STATUS_CONFIG[curStatus] || STATUS_CONFIG.todo;
    const isDone = curStatus === 'done';
    
    // Fallback UI values
    const taskType = task.type || '버그'; // Example default
    const priority = task.priority || 'Medium';
    const pCfg = PRIORITY_CONFIG[priority];

    return (
        <div className={`flex items-stretch bg-white border-b border-slate-200 hover:bg-slate-50 transition-colors group/row h-10 ${isDone ? 'opacity-70' : ''}`}>
            
            {/* 1. 체크박스 & 세로 컬러바 */}
            <div className="w-[40px] flex items-center justify-center border-r border-slate-200 shrink-0 relative bg-slate-50/50 group-hover/row:bg-slate-100/50 transition-colors">
                <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${groupColor}`} />
                <input type="checkbox" checked={isDone} onChange={(e) => onUpdateTask?.(task.id, { completed: e.target.checked, status: e.target.checked ? 'done' : 'working' })} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
            </div>

            {/* 2. 항목 명칭 */}
            <div 
                className="flex-1 px-4 flex items-center min-w-[200px] border-r border-slate-200 border-l-4 border-transparent hover:border-slate-300 cursor-pointer"
                onClick={() => onSelect?.(task)}
            >
                <span className={`text-[13px] font-black truncate transition-colors hover:text-indigo-600 ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {task.title || task.child}
                </span>
            </div>

            {/* 3. 유형 */}
            <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 p-1.5">
                <div className={`w-full h-full flex items-center justify-center rounded-md text-[11px] font-black ${taskType === '버그' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {taskType}
                </div>
            </div>

            {/* 4. 제품명 */}
            <div className="w-[100px] border-r border-slate-200 flex items-center justify-center shrink-0 px-2">
                <span className="text-[12px] font-bold text-slate-800 truncate">{task.product || task.parent}</span>
            </div>

            {/* 5. 담당자 아바타 */}
            <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0">
                {(() => {
                    const assignee = users.find(u => u.uid === (task.assigneeUid || task.AssigneeUid));
                    if (!assignee) return <div className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center bg-slate-50"><User size={10} className="text-slate-300"/></div>;
                    return (
                        <div className="w-6 h-6 rounded-full bg-indigo-500 border border-indigo-600 flex items-center justify-center overflow-hidden" title={assignee.displayName}>
                            {assignee.photoURL 
                                ? <img src={assignee.photoURL} alt="" className="w-full h-full object-cover" />
                                : <span className="text-[10px] font-black text-white">{assignee.displayName?.[0]}</span>
                            }
                        </div>
                    );
                })()}
            </div>

            {/* 6. 상태 (Dog-ear 포함) */}
            <div className="w-[130px] border-r border-slate-200 shrink-0 relative border-b border-b-white">
                <div 
                    onClick={() => setIsStatusOpen(!isStatusOpen)}
                    className={`w-full h-full flex items-center justify-center cursor-pointer transition-all hover:opacity-90 ${statusCfg.bg} ${statusCfg.text} relative overflow-hidden`}
                >
                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-l-[8px] border-t-white border-l-transparent opacity-0 group-hover/row:opacity-40 transition-opacity" />
                    <span className="text-[12px] font-black">{statusCfg.label}</span>
                </div>

                {isStatusOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)} />
                        <div className="absolute top-[105%] left-0 w-[130px] bg-white shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden ring-1 ring-black/5">
                            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                <button 
                                    key={key} 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onUpdateTask?.(task.id, { status: key, completed: key === 'done' }); 
                                        setIsStatusOpen(false); 
                                    }}
                                    className={`w-full py-2.5 text-[12px] font-black transition-all hover:brightness-90 active:brightness-75 ${cfg.bg} ${cfg.text} border-b border-black/10 last:border-0`}
                                >
                                    {cfg.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* 7. 시작일 */}
            <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0">
                <span className="text-[12px] font-black text-slate-500">
                    {task.startDate ? new Date(task.startDate).toLocaleDateString('ko-KR', {month:'short', day:'numeric'}) : '-'}
                </span>
            </div>

            {/* 8. 마감일 */}
            <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0">
                <span className="text-[12px] font-black text-rose-500">
                    {task.dueDate || task.endDate ? new Date(task.dueDate || task.endDate).toLocaleDateString('ko-KR', {month:'short', day:'numeric'}) : '-'}
                </span>
            </div>

            {/* 9. 우선순위 (컬러 블록) */}
            <div className="w-[110px] border-r border-slate-200 shrink-0 p-1.5 border-b border-b-white">
                <div className={`w-full h-full flex items-center justify-center text-[12px] font-black ${pCfg.bg} ${pCfg.text}`}>
                    {pCfg.label}
                </div>
            </div>

            {/* 10. 설명 / 메모 */}
            <div className="w-[150px] border-r border-slate-200 flex items-center px-3 shrink-0">
                <span className="text-[11px] font-bold text-slate-500 truncate">{task.notes || '내용 없음'}</span>
            </div>

            {/* 11. 첨부파일 */}
            <div className="w-[50px] border-r border-slate-200 flex items-center justify-center shrink-0">
                {(task.links && task.links.length > 0) ? <Paperclip size={13} className="text-slate-400"/> : <span className="text-slate-200">-</span>}
            </div>

            {/* 12. 업데이트 (Time Ago) */}
            <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0 gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-100 flex items-center justify-center"><User size={8} className="text-slate-400" /></div>
                <span className="text-[10px] font-black text-slate-400">
                    {getTimeAgo(task.updatedAt)}
                </span>
            </div>

            {/* 13. 오른쪽 끝 삭제(X) */}
            <div className="w-[40px] flex items-center justify-center shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors">
                    <X size={12}/>
                </button>
            </div>
        </div>
    );
}
