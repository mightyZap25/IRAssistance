import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, XCircle, MessageSquare, Clock, User, ShieldCheck, ShoppingCart, FileText, ExternalLink } from 'lucide-react';
import { db, doc, updateDoc, getDoc, serverTimestamp } from '../database';
import { useAuth } from '../contexts/AuthContext';
import { createNotification } from '../services/notificationService';

export default function ApprovalReviewModal({ isOpen, approvalData, onClose, onRefresh }) {
    const { currentUser, userProfile } = useAuth();
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [sourceDoc, setSourceDoc] = useState(null);

    useEffect(() => {
        if (isOpen && approvalData?.RefID) {
            fetchSourceDoc();
        }
    }, [isOpen, approvalData]);

    const fetchSourceDoc = async () => {
        try {
            const collectionName = approvalData.DocType === 'PURCHASE_REQUEST' ? 'purchasing' : 
                                 approvalData.DocType === 'OUTSOURCING_REQUEST' ? 'outsourcing' : null;
            
            if (collectionName) {
                const snap = await getDoc(doc(db, collectionName, approvalData.RefID));
                if (snap.exists()) {
                    setSourceDoc(snap.data());
                }
            }
        } catch (error) {
            console.error("Error fetching source doc:", error);
        }
    };

    if (!isOpen || !approvalData) return null;

    const handleAction = async (action) => {
        if (action === 'REJECTED' && !comment) {
            return alert('반려 사유를 입력해주세요.');
        }

        if (!window.confirm(`${action === 'APPROVED' ? '승인' : '반려'} 처리하시겠습니까?`)) return;

        setLoading(true);
        try {
            // 1. Update Approval Document
            await updateDoc(doc(db, 'approvals', approvalData.id), {
                Status: action,
                Comment: comment,
                ProcessedAt: serverTimestamp()
            });

            // 2. Update Source Document Status
            const collectionName = approvalData.DocType === 'PURCHASE_REQUEST' ? 'purchasing' : 
                                 approvalData.DocType === 'OUTSOURCING_REQUEST' ? 'outsourcing' : null;
            
            if (collectionName && approvalData.RefID) {
                await updateDoc(doc(db, collectionName, approvalData.RefID), {
                    Status: action === 'APPROVED' ? 'APPROVED' : 'QUOTED', // Reject moves back to Quoted
                    UpdatedAt: serverTimestamp()
                });
            }

            // 3. Send Notification to Requester
            if (approvalData.RequesterID) {
                createNotification(
                    approvalData.RequesterID,
                    `결재 ${action === 'APPROVED' ? '승인' : '반려'} 알림`,
                    `[${approvalData.Title}] 건이 ${action === 'APPROVED' ? '승인' : '반려'}되었습니다.`,
                    collectionName === 'purchasing' ? '/purchasing' : '/outsourcing'
                );
            }

            alert('처리가 완료되었습니다.');
            if (onRefresh) onRefresh();
            onClose();
        } catch (error) {
            console.error("Approval action failed:", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">결재 문서 검토</h2>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{approvalData.DocType}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* Summary Card */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">{approvalData.Title}</h3>
                            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 border border-amber-100 dark:border-amber-800 rounded-full text-[10px] font-black uppercase">Pending Approval</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2 text-slate-500">
                                <User size={14} />
                                <span className="font-bold">기안자:</span>
                                <span className="text-slate-900 dark:text-slate-200">{approvalData.RequesterName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500">
                                <Clock size={14} />
                                <span className="font-bold">요청일:</span>
                                <span className="text-slate-900 dark:text-slate-200">{new Date(approvalData.RequestedAt).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Source Data Preview */}
                    {sourceDoc && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ExternalLink size={12} /> 연동 문서 요약
                            </h4>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                                {approvalData.DocType === 'PURCHASE_REQUEST' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">공급업체</span>
                                            <span className="text-sm font-black text-slate-900 dark:text-white">{sourceDoc.VendorName}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">품목</span>
                                            <span className="text-sm font-black text-slate-900 dark:text-white">{sourceDoc.PartName}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                                            <span className="text-xs font-bold text-slate-500">합계 금액</span>
                                            <span className="text-lg font-black text-indigo-600">₩ {sourceDoc.TotalPrice?.toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}
                                {approvalData.DocType === 'OUTSOURCING_REQUEST' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">외주업체</span>
                                            <span className="text-sm font-black text-slate-900 dark:text-white">{sourceDoc.VendorName}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">가공품목</span>
                                            <span className="text-sm font-black text-slate-900 dark:text-white">{sourceDoc.TargetPartName}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">기안 내용</h4>
                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-700 dark:text-slate-300 min-h-[100px] whitespace-pre-wrap leading-relaxed">
                            {approvalData.Content}
                        </div>
                    </div>

                    {/* Comment Input */}
                    <div className="space-y-2 pt-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <MessageSquare size={12} /> 검토 의견 (반려 시 필수)
                        </h4>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[80px]"
                            placeholder="승인 또는 반려 사유를 입력하세요..."
                        />
                    </div>
                </div>

                {/* Footer Actions - 작성자 본인이 아닐 때만 표시 */}
                {currentUser?.uid !== approvalData.RequesterID && (
                    <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-4">
                        <button
                            onClick={() => handleAction('REJECTED')}
                            disabled={loading}
                            className="flex-1 py-4 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 text-rose-600 font-black rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                            <XCircle size={20} /> 반려하기
                        </button>
                        <button
                            onClick={() => handleAction('APPROVED')}
                            disabled={loading}
                            className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-200 dark:shadow-none"
                        >
                            <CheckCircle2 size={20} /> 최종 승인
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
