import React from 'react';
import { HelpCircle, MessageSquare, Users } from 'lucide-react';

/**
 * IssueCardView — 이슈 목록을 카드형 그리드로 표시합니다.
 *
 * Props:
 *  - issues:        Array  - 표시할 이슈 배열
 *  - allCategories: Object - 카테고리 키 → { label, color, icon } 매핑
 *  - STATUS_MAP:    Object - 상태 키 → { label, color, icon } 매핑
 *  - PRIORITY_MAP:  Object - 우선순위 키 → { label, color } 매핑
 *  - onSelect:      (issue) => void - 이슈 클릭 시 호출
 */
export default function IssueCardView({ issues, allCategories, STATUS_MAP, PRIORITY_MAP, onSelect }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {issues.map(issue => {
                const catInfo      = allCategories[issue.Category] || { label: issue.Category || '미정', color: 'bg-slate-50', icon: HelpCircle };
                const statInfo     = STATUS_MAP[issue.Status]     || { label: '미정', color: 'bg-slate-50 border-slate-200 text-slate-500', icon: HelpCircle };
                const priorityInfo = PRIORITY_MAP[issue.Priority] || { label: '보통', color: 'text-slate-500 bg-slate-50' };
                const createdDate  = issue.CreatedAt?.toDate
                    ? issue.CreatedAt.toDate().toLocaleDateString('ko-KR')
                    : '-';

                return (
                    <div
                        key={issue.id}
                        onClick={() => onSelect(issue)}
                        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between cursor-pointer group hover:scale-[1.01]"
                    >
                        <div className="space-y-3.5">
                            {/* 상단 뱃지 행: 카테고리 + 상태 */}
                            <div className="flex justify-between items-center">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border ${catInfo.color}`}>
                                    <catInfo.icon size={11} />
                                    {catInfo.label}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border ${statInfo.color}`}>
                                    <statInfo.icon size={11} />
                                    {statInfo.label}
                                </span>
                            </div>

                            {/* 제목 + 설명 + 제품 태그 */}
                            <div className="space-y-1.5">
                                <h3 className="font-black text-sm text-slate-800 group-hover:text-indigo-650 transition-colors line-clamp-1">
                                    {issue.Title}
                                </h3>
                                <p className="text-xs text-slate-450 leading-relaxed font-medium line-clamp-2">
                                    {issue.Description}
                                </p>
                                {(issue.TargetProductName || issue.ProductSeries || issue.ProductCommType) && (
                                    <div className="pt-2 border-t border-slate-100/70 flex flex-wrap gap-1 items-center">
                                        {issue.TargetProductName && (
                                            <span
                                                className="bg-slate-100 text-slate-650 text-[9px] px-1.5 py-0.5 rounded font-black max-w-[120px] truncate"
                                                title={issue.TargetProductName}
                                            >
                                                {issue.TargetProductName}
                                            </span>
                                        )}
                                        {issue.ProductSeries && (
                                            <span className="bg-indigo-50 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded font-black border border-indigo-100/40">
                                                {issue.ProductSeries}
                                            </span>
                                        )}
                                        {issue.ProductCommType && (
                                            <span className="bg-teal-50 text-teal-700 text-[9px] px-1.5 py-0.5 rounded font-black border border-teal-100/40">
                                                {issue.ProductCommType}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 하단 정보: 담당 + 중요도 */}
                        <div className="mt-5 pt-3.5 border-t border-slate-100 flex justify-between items-center text-[10px]">
                            <div className="flex gap-2.5 items-center">
                                <span className="font-bold text-slate-400">배정:</span>
                                <span className="inline-flex items-center gap-1 font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                    <Users size={10} className="text-slate-400" />
                                    {issue.TargetDept}부서 {issue.AssigneeName ? `(${issue.AssigneeName})` : ''}
                                </span>
                            </div>
                            <div className="flex gap-1.5">
                                <span className={`font-black px-1.5 py-0.5 rounded ${priorityInfo.color}`}>
                                    중요: {priorityInfo.label}
                                </span>
                            </div>
                        </div>

                        {/* 등록자 + 댓글수 */}
                        <div className="mt-3 flex justify-between items-center text-[9px] text-slate-400 font-bold">
                            <span>등록: {issue.CreatedBy} ({createdDate})</span>
                            <span className="flex items-center gap-1">
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
