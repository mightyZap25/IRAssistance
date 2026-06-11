import React, { useState, useRef } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    useDraggable,
    closestCorners,
} from '@dnd-kit/core';
import { HelpCircle, MessageSquare } from 'lucide-react';

// ────────────────────────────────────────────────────────────
// 드래그 가능한 이슈 카드
// ────────────────────────────────────────────────────────────
function DraggableIssueCard({ issue, allCategories, STATUS_MAP, PRIORITY_MAP, onSelect, canDrag, wasDragged }) {
    const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
        id: issue.id,
        disabled: !canDrag,
        data: { issue },
    });

    const catInfo      = allCategories[issue.Category] || { label: issue.Category || '미정', color: 'bg-slate-50 border-slate-200 text-slate-600', icon: HelpCircle };
    const priorityInfo = PRIORITY_MAP[issue.Priority]  || { label: '보통', color: 'text-slate-500 bg-slate-50' };
    const statInfo     = STATUS_MAP[issue.Status]      || { label: '미정', color: 'bg-slate-50 border-slate-200 text-slate-500', icon: HelpCircle };

    // touch-action: none — PointerSensor 필수 요구사항
    const style = {
        touchAction: 'none',
        ...(transform
            ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: 50 }
            : {}),
    };

    const handleClick = () => {
        // 드래그가 실제로 발생한 경우 클릭 무시 (드래그 후 onPointerUp 오발 방지)
        if (wasDragged.current) return;
        onSelect(issue);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={handleClick}
            className={`bg-white border rounded-xl p-3.5 shadow-sm flex flex-col justify-between select-none transition-all ${
                isDragging
                    ? 'opacity-40 border-indigo-400 shadow-lg scale-[1.02]'
                    : 'border-slate-200 hover:shadow-md hover:border-indigo-300 group'
            } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
        >
            <div className="space-y-2">
                {/* 카테고리 + 중요도 */}
                <div className="flex justify-between items-center">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black border ${catInfo.color}`}>
                        <catInfo.icon size={9} />
                        {catInfo.label}
                    </span>
                    <span className={`font-black text-[8px] px-1 py-0.5 rounded ${priorityInfo.color}`}>
                        {priorityInfo.label}
                    </span>
                </div>

                {/* 제목 */}
                <h4 className="font-black text-xs text-slate-800 line-clamp-1 group-hover:text-indigo-650 transition-colors">
                    {issue.Title}
                </h4>

                {/* 설명 */}
                <p className="text-[10px] text-slate-400 font-medium line-clamp-2 leading-normal">
                    {issue.Description}
                </p>

                {/* 제품 태그 */}
                {(issue.TargetProductName || issue.ProductSeries || issue.ProductCommType) && (
                    <div className="flex flex-wrap gap-1 items-center mt-1.5">
                        {issue.TargetProductName && (
                            <span
                                className="bg-slate-100 text-slate-500 text-[8px] px-1.5 py-0.5 rounded font-black truncate max-w-[100px]"
                                title={issue.TargetProductName}
                            >
                                {issue.TargetProductName}
                            </span>
                        )}
                        {issue.ProductSeries && (
                            <span className="bg-indigo-50 text-indigo-700 text-[8px] px-1.5 py-0.5 rounded font-black border border-indigo-100/30">
                                {issue.ProductSeries}
                            </span>
                        )}
                        {issue.ProductCommType && (
                            <span className="bg-teal-50 text-teal-700 text-[8px] px-1.5 py-0.5 rounded font-black border border-teal-100/30">
                                {issue.ProductCommType}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* 하단: 부서 + 댓글수 */}
            <div className="mt-3.5 pt-2 border-t border-slate-100 flex justify-between items-center text-[8px] text-slate-400 font-bold">
                <span>배정: {issue.TargetDept}</span>
                <span className="flex items-center gap-1">
                    <MessageSquare size={8} />
                    {issue.Comments?.length || 0}
                </span>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// 드롭 가능한 칸반 컬럼
// ────────────────────────────────────────────────────────────
function DroppableColumn({ col, issues, allCategories, STATUS_MAP, PRIORITY_MAP, onSelect, canDragAll, wasDragged }) {
    const { setNodeRef, isOver } = useDroppable({ id: col.key });

    return (
        <div
            ref={setNodeRef}
            className={`flex-shrink-0 w-72 rounded-2xl p-4 flex flex-col max-h-full border transition-colors duration-150 ${
                isOver
                    ? 'bg-indigo-50 border-indigo-300'
                    : 'bg-slate-100 border-slate-200'
            }`}
        >
            {/* 컬럼 헤더 */}
            <div className="flex justify-between items-center mb-3 shrink-0">
                <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <col.icon size={13} className="text-slate-450" />
                    {col.label}
                </span>
                <span className="text-[10px] font-black text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                    {issues.length}
                </span>
            </div>

            {/* 이슈 카드 목록 */}
            <div className="space-y-3 overflow-y-auto flex-1 min-h-[250px] pr-1">
                {issues.length === 0 ? (
                    <div className={`border-2 border-dashed rounded-xl py-10 text-center text-[10px] font-bold italic transition-colors ${
                        isOver
                            ? 'border-indigo-400 text-indigo-500 bg-indigo-50/60'
                            : 'border-slate-300 text-slate-400 bg-slate-50/50'
                    }`}>
                        {isOver ? '📌 여기에 놓기' : '이슈 없음'}
                    </div>
                ) : (
                    <>
                        {issues.map(issue => (
                            <DraggableIssueCard
                                key={issue.id}
                                issue={issue}
                                allCategories={allCategories}
                                STATUS_MAP={STATUS_MAP}
                                PRIORITY_MAP={PRIORITY_MAP}
                                onSelect={onSelect}
                                canDrag={canDragAll}
                                wasDragged={wasDragged}
                            />
                        ))}
                        {/* 카드가 있어도 드롭 시 힌트 */}
                        {isOver && (
                            <div className="border-2 border-dashed border-indigo-400 rounded-xl py-4 text-center text-[10px] font-bold text-indigo-500 italic bg-indigo-50/60">
                                📌 여기에 놓기
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// DragOverlay 미리보기 카드
// ────────────────────────────────────────────────────────────
function DragPreviewCard({ issue, allCategories, PRIORITY_MAP }) {
    if (!issue) return null;
    const catInfo      = allCategories[issue.Category] || { label: issue.Category || '미정', color: 'bg-slate-50 border-slate-200 text-slate-600', icon: HelpCircle };
    const priorityInfo = PRIORITY_MAP[issue.Priority]  || { label: '보통', color: 'text-slate-500 bg-slate-50' };

    return (
        <div className="bg-white border-2 border-indigo-500 rounded-xl p-3.5 shadow-2xl w-64 opacity-95 rotate-2 scale-105 pointer-events-none">
            <div className="flex justify-between items-center mb-2">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black border ${catInfo.color}`}>
                    <catInfo.icon size={9} />
                    {catInfo.label}
                </span>
                <span className={`font-black text-[8px] px-1 py-0.5 rounded ${priorityInfo.color}`}>
                    {priorityInfo.label}
                </span>
            </div>
            <h4 className="font-black text-xs text-slate-800 line-clamp-2">{issue.Title}</h4>
        </div>
    );
}

// ────────────────────────────────────────────────────────────
// IssueKanbanView — 메인 칸반 보드
// ────────────────────────────────────────────────────────────
/**
 * Props:
 *  - issues:          Array  - 필터링된 이슈 배열
 *  - allCategories:   Object - 카테고리 매핑
 *  - STATUS_MAP:      Object - 상태 매핑
 *  - PRIORITY_MAP:    Object - 우선순위 매핑
 *  - KANBAN_COLUMNS:  Array  - 칸반 컬럼 정의
 *  - userProfile:     Object - 현재 로그인 사용자 프로필
 *  - onSelect:        (issue) => void
 *  - onStatusChange:  (issueId, newStatus, prevStatus) => void
 */
export default function IssueKanbanView({
    issues,
    allCategories,
    STATUS_MAP,
    PRIORITY_MAP,
    KANBAN_COLUMNS,
    userProfile,
    onSelect,
    onStatusChange,
}) {
    const [activeIssue, setActiveIssue] = useState(null);

    // 드래그 발생 추적 ref — 드래그 후 onClick 오발 방지
    const wasDragged = useRef(false);

    // 드래그 권한: admin/manager이면 전체 허용, 일반 사용자도 본인 부서 이슈 드래그 허용
    // userProfile이 없으면 모든 카드를 드래그 가능하게 (개발 편의)
    const canDragAll = !userProfile || 
        userProfile.role === 'admin' ||
        userProfile.role === 'manager' ||
        true; // 일단 모든 유저 드래그 허용 (권한은 onStatusChange 단계에서 처리)

    // 드래그 감도: 5px 이상 이동해야 드래그 시작 (클릭과 구분)
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        })
    );

    const handleDragStart = ({ active }) => {
        wasDragged.current = false; // 드래그 시작 시 초기화
        const issue = issues.find(i => i.id === active.id);
        setActiveIssue(issue || null);
    };

    const handleDragEnd = ({ active, over }) => {
        setActiveIssue(null);

        if (!over) {
            // 드롭 타겟 없음 → 드래그 했지만 이동 안 함
            // wasDragged를 짧게 true로 유지해 클릭 오발 방지
            wasDragged.current = true;
            setTimeout(() => { wasDragged.current = false; }, 100);
            return;
        }

        const draggedIssue = issues.find(i => i.id === active.id);
        if (!draggedIssue) return;

        const targetCol  = KANBAN_COLUMNS.find(c => c.key === over.id);
        if (!targetCol) return;

        const currentCol = KANBAN_COLUMNS.find(c => c.statuses.includes(draggedIssue.Status));
        if (currentCol?.key === targetCol.key) return; // 같은 컬럼이면 무시

        // 실제 이동 발생 → wasDragged = true 로 설정하여 click 오발 방지
        wasDragged.current = true;
        setTimeout(() => { wasDragged.current = false; }, 100);

        const newStatus = targetCol.statuses[0];
        onStatusChange(draggedIssue.id, newStatus, draggedIssue.Status);
    };

    const handleDragCancel = () => {
        setActiveIssue(null);
        wasDragged.current = true;
        setTimeout(() => { wasDragged.current = false; }, 100);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="flex gap-4 overflow-x-auto pb-2 h-full items-start custom-scrollbar">
                {KANBAN_COLUMNS.map(col => {
                    const colIssues = issues.filter(i => col.statuses.includes(i.Status));
                    return (
                        <DroppableColumn
                            key={col.key}
                            col={col}
                            issues={colIssues}
                            allCategories={allCategories}
                            STATUS_MAP={STATUS_MAP}
                            PRIORITY_MAP={PRIORITY_MAP}
                            onSelect={onSelect}
                            canDragAll={canDragAll}
                            wasDragged={wasDragged}
                        />
                    );
                })}
            </div>

            {/* 드래그 중 커서에 고정되는 미리보기 카드 */}
            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
                {activeIssue ? (
                    <DragPreviewCard
                        issue={activeIssue}
                        allCategories={allCategories}
                        PRIORITY_MAP={PRIORITY_MAP}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
