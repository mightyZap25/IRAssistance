import React from 'react';
import { X } from 'lucide-react';

export default function WorkspaceEventDetailModal({ selectedEvent, onClose }) {
    if (!selectedEvent) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                        📅 일정 상세 정보
                    </h3>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-[10px] font-black text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                    >
                        닫기
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">일정 제목</label>
                        <div className="text-sm font-bold text-slate-800 mt-0.5">{selectedEvent.title}</div>
                    </div>

                    {selectedEvent.type === 'attendance' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">신청 카테고리</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.category === 'Leave' ? '휴가' : '유연근로/근태'}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">부서 / 성명</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">[{selectedEvent.raw.department}] {selectedEvent.raw.userName}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">시작일</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.startDate}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">종료일</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.endDate}</div>
                                </div>
                            </div>
                            {selectedEvent.raw.reason && (
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">신청 사유</label>
                                    <div className="text-xs font-medium text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-0.5 whitespace-pre-wrap">{selectedEvent.raw.reason}</div>
                                </div>
                            )}
                        </>
                    )}

                    {selectedEvent.type === 'project' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">프로젝트명</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.projectName}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">공정 단계</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.stageId}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">마감 예정일</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.end}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">현재 상태</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5 uppercase">{selectedEvent.raw.status}</div>
                                </div>
                            </div>
                        </>
                    )}

                    {selectedEvent.type === 'task_summary' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                                <span className="text-xs font-bold text-slate-600">진행도 요약</span>
                                <span className="text-xs font-black text-indigo-600">{selectedEvent.raw.completed} / {selectedEvent.raw.total} 완료</span>
                            </div>
                            <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                                {selectedEvent.raw.tasks.map((task, tIdx) => (
                                    <div key={tIdx} className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm space-y-1 hover:border-indigo-100 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs font-bold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                                {task.title}
                                            </span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                                                {task.status === 'completed' ? '완료' : '진행중'}
                                            </span>
                                        </div>
                                        {task.description && (
                                            <p className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg mt-1 border border-slate-100/50">{task.description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedEvent.type === 'issue' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">이슈 해결 기한</label>
                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.dueDate}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400">우선순위</label>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded mt-0.5 inline-block ${selectedEvent.raw.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>{selectedEvent.raw.priority}</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400">담당자</label>
                                <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.assignedTo}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
