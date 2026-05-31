import React from 'react';
import { HelpCircle, MessageSquare, Users } from 'lucide-react';

/**
 * IssueListView — 이슈 목록을 테이블형 리스트로 표시합니다.
 *
 * Props:
 *  - issues:       Array  - 표시할 이슈 배열
 *  - allCategories: Object - 카테고리 키 → { label, color, icon } 매핑
 *  - STATUS_MAP:   Object - 상태 키 → { label, color, icon } 매핑
 *  - PRIORITY_MAP: Object - 우선순위 키 → { label, color } 매핑
 *  - onSelect:     (issue) => void - 이슈 클릭 시 호출
 */
export default function IssueListView({ issues, allCategories, STATUS_MAP, PRIORITY_MAP, onSelect }) {
    return (
        <div className="space-y-3">
            {issues.map(issue => {
                const catInfo    = allCategories[issue.Category] || { label: issue.Category || '미정', color: 'bg-slate-50', icon: HelpCircle };
                const statInfo   = STATUS_MAP[issue.Status]     || { label: '미정', color: 'bg-slate-50 border-slate-200 text-slate-500', icon: HelpCircle };
                const priorityInfo = PRIORITY_MAP[issue.Priority] || { label: '보통', color: 'text-slate-500 bg-slate-50' };
                const createdDate  = issue.CreatedAt?.toDate
                    ? issue.CreatedAt.toDate().toLocaleDateString('ko-KR')
                    : '-';

                return (
                    <div
                        key={issue.id}
                        onClick={() => onSelect(issue)}
                        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:scale-[1.005]"
                    >
                        {/* 왼쪽: 카테고리 뱃지 + 제목 + 설명 + 태그 */}
                        <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border ${catInfo.color}`}>
                                <catInfo.icon size={11} />
                                {catInfo.label}
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-black text-sm text-slate-800 line-clamp-1">
                                    {issue.Title}
                                </h3>
                                <p className="text-xs text-slate-400 font-medium line-clamp-1 mt-0.5">
                                    {issue.Description}
                                </p>
                                {(issue.TargetProductName || issue.ProductSeries || issue.ProductCommType) && (
                                    <div className="flex flex-wrap gap-1 items-center mt-1">
                                        {issue.TargetProductName && (
                                            <span
                                                className="bg-slate-100 text-slate-500 text-[8px] px-1.5 py-0.5 rounded font-black truncate max-w-[120px]"
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
                        </div>

                        {/* 오른쪽: 상태, 담당, 중요도, 작성자, 댓글수 */}
                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-500">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border ${statInfo.color}`}>
                                <statInfo.icon size={10} />
                                {statInfo.label}
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                <Users size={10} className="text-slate-400" />
                                {issue.TargetDept}부서 {issue.AssigneeName ? `(${issue.AssigneeName})` : ''}
                            </span>
                            <span className={`font-black px-1.5 py-0.5 rounded ${priorityInfo.color}`}>
                                중요: {priorityInfo.label}
                            </span>
                            <span className="text-slate-400 text-[9px]">등록: {issue.CreatedBy}</span>
                            <span className="flex items-center gap-1 text-slate-400 font-bold text-[9px]">
                                <MessageSquare size={10} />
                                {issue.Comments?.length || 0}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
