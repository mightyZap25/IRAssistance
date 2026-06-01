import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { Building2, X, Phone, User, Mail, History, Package, FileText, Receipt, DollarSign, PenTool, Printer } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function CustomerDetailPanel({ customer, onClose, onEdit, inline = false }) {
    const [activeTab, setActiveTab] = useState('info');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    // Mock data for new tabs (Quotations & Invoices)
    const [quotations] = useState([
        { id: 'QT-2026-001', date: '2026-05-20', amount: 1500000, status: '승인됨' },
        { id: 'QT-2026-002', date: '2026-06-01', amount: 3200000, status: '대기중' }
    ]);
    const [invoices] = useState([
        { id: 'INV-2026-001', date: '2026-05-25', amount: 1500000, status: '결제완료' }
    ]);

    useEffect(() => {
        if(!customer) return;
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const q = query(
                    collection(db, 'receiving'),
                    where('CustomerName', '==', customer.Name),
                    where('Type', '==', 'SHIPPING'),
                    orderBy('CreatedAt', 'desc')
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setHistory(data);
            } catch (err) {
                console.error("Error fetching customer history:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [customer]);

    if (!customer) return null;

    // PDF 생성 로직 (브라우저 인쇄 다이얼로그 활용)
    const handleGeneratePDF = (type, item) => {
        const printWindow = window.open('', '_blank');
        const title = type === 'quotation' ? '견 적 서' : '세 금 계 산 서';
        printWindow.document.write(`
            <html>
                <head>
                    <title>${title} - ${item.id}</title>
                    <style>
                        body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
                        .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #1e293b; padding-bottom: 20px; }
                        h1 { font-size: 32px; margin: 0; letter-spacing: 5px; }
                        .info-container { display: flex; justify-content: space-between; margin-bottom: 40px; }
                        .info-box { width: 45%; }
                        .info-row { margin-bottom: 10px; font-size: 14px; }
                        .info-label { font-weight: bold; display: inline-block; width: 100px; color: #64748b; }
                        .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
                        .table th, .table td { border: 1px solid #cbd5e1; padding: 12px 15px; text-align: left; }
                        .table th { background: #f8fafc; font-weight: bold; color: #475569; }
                        .table td.right { text-align: right; }
                        .total-row { background: #f1f5f9; font-weight: bold; }
                        .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 20px; color: #0f172a; border-top: 2px solid #1e293b; padding-top: 15px; }
                        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${title}</h1>
                    </div>
                    <div class="info-container">
                        <div class="info-box">
                            <div class="info-row"><span class="info-label">수신:</span> <strong>${customer.Name}</strong> 귀하</div>
                            <div class="info-row"><span class="info-label">담당자:</span> ${customer.ContactPerson || '-'}</div>
                            <div class="info-row"><span class="info-label">연락처:</span> ${customer.Phone || '-'}</div>
                        </div>
                        <div class="info-box">
                            <div class="info-row"><span class="info-label">문서 번호:</span> ${item.id}</div>
                            <div class="info-row"><span class="info-label">발행 일자:</span> ${item.date}</div>
                            <div class="info-row"><span class="info-label">발신:</span> IR Assistant (주)</div>
                        </div>
                    </div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th style="width: 50%">품목/내역</th>
                                <th style="width: 15%">수량</th>
                                <th style="width: 15%">단가</th>
                                <th style="width: 20%" class="right">공급가액</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>통합 시스템 고도화 및 서비스 구축</td>
                                <td>1</td>
                                <td class="right">${item.amount.toLocaleString()}</td>
                                <td class="right">${item.amount.toLocaleString()}</td>
                            </tr>
                            <tr class="total-row">
                                <td colspan="3" class="right">소계</td>
                                <td class="right">${item.amount.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td colspan="3" class="right">부가세 (10%)</td>
                                <td class="right">${(item.amount * 0.1).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="total">합계 금액: ₩ ${(item.amount * 1.1).toLocaleString()} 원</div>
                    <div class="footer">본 ${type === 'quotation' ? '견적서' : '세금계산서'}는 IR Assistant 시스템에서 자동 발행되었습니다.</div>
                    <script>
                        window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const content = (
        <div className={`flex flex-col transform transition-all duration-300 ${inline ? 'h-full w-full' : 'relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden animate-in zoom-in-95'}`}>
            
            {/* Header */}
            <div className="p-6 border-b border-slate-150/40 dark:border-slate-800 flex justify-between items-start bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-slate-850/50 dark:to-slate-900 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-100 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Building2 size={32} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1.5">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{customer.Name}</h2>
                            <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-black rounded-lg uppercase tracking-widest border border-blue-200/50">{customer.Category || '국내'}</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-5 text-xs">
                            <span className="flex items-center gap-1.5"><User size={14} className="text-slate-400" /> {customer.ContactPerson || '담당자 미지정'}</span>
                            <span className="flex items-center gap-1.5"><Phone size={14} className="text-slate-400" /> {customer.Phone || '연락처 없음'}</span>
                            <span className="flex items-center gap-1.5"><Mail size={14} className="text-slate-400" /> {customer.Email || '이메일 없음'}</span>
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <button onClick={() => onEdit(customer)} className="px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-blue-50 text-blue-600 border border-slate-200 dark:border-slate-700 font-black rounded-xl transition-all text-xs flex items-center gap-2 shadow-sm">
                        <PenTool size={14} /> 정보 수정
                    </button>
                    {!inline && (
                        <button onClick={onClose} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex px-6 pt-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 gap-6 shrink-0 overflow-x-auto custom-scrollbar">
                {[
                    { id: 'info', label: 'CRM & 리드', icon: User },
                    { id: 'quotations', label: '견적서 (Quote)', icon: FileText },
                    { id: 'invoices', label: '정산/계산서', icon: Receipt },
                    { id: 'history', label: '납품 이력', icon: History }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`py-3 text-[11px] font-black transition-all border-b-2 uppercase tracking-widest flex items-center gap-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/30">
                {/* Info Tab */}
                {activeTab === 'info' && (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Building2 size={16}/> 상세 정보</h3>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">사업자등록번호</label>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{customer.BusinessNumber || '미등록'}</p>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">결제 조건</label>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{customer.PaymentTerms || '익월 말 결제'}</p>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">상세 주소 (Address)</label>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{customer.Address || '미등록'}</p>
                                </div>
                            </div>
                        </div>

                        {/* 리드 관리 & 누적 매출 영역 */}
                        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm">
                            <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2"><DollarSign size={16}/> 영업 리드(Lead) 및 결제 트래킹</h3>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white dark:bg-slate-900 rounded-xl border border-indigo-50 dark:border-indigo-900/50 gap-4">
                                <div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">현재 리드 상태</div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span className="text-sm font-extrabold text-emerald-600">계약 진행중 (Active Negotiation)</span>
                                    </div>
                                </div>
                                <div className="sm:text-right sm:border-l border-slate-100 dark:border-slate-800 sm:pl-6 w-full sm:w-auto">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">올해 누적 매출</div>
                                    <div className="text-2xl font-black text-indigo-600">₩ 4,700,000</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quotations Tab */}
                {activeTab === 'quotations' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">발행된 견적서 목록</h3>
                            <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-blue-700 transition-colors shadow-sm">
                                <span className="text-sm leading-none">+</span> 새 견적서 작성
                            </button>
                        </div>
                        {quotations.map(qt => (
                            <div key={qt.id} className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between hover:shadow-md transition-shadow gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-mono font-black text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">{qt.id}</span>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${qt.status === '승인됨' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{qt.status}</span>
                                    </div>
                                    <div className="text-xs font-bold text-slate-500">발행일: {qt.date}</div>
                                </div>
                                <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                    <div className="text-base font-black text-slate-800 dark:text-slate-100">₩ {qt.amount.toLocaleString()}</div>
                                    <button onClick={() => handleGeneratePDF('quotation', qt)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-all group shadow-sm border border-slate-100 dark:border-slate-700" title="PDF 인쇄/출력">
                                        <Printer size={16} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Invoices Tab */}
                {activeTab === 'invoices' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">세금계산서 발행 내역</h3>
                            <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-indigo-700 transition-colors shadow-sm">
                                <span className="text-sm leading-none">+</span> 세금계산서 발행
                            </button>
                        </div>
                        {invoices.map(inv => (
                            <div key={inv.id} className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between hover:shadow-md transition-shadow gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-mono font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">{inv.id}</span>
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">{inv.status}</span>
                                    </div>
                                    <div className="text-xs font-bold text-slate-500">발행일: {inv.date}</div>
                                </div>
                                <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                    <div className="text-base font-black text-slate-800 dark:text-slate-100">₩ {inv.amount.toLocaleString()}</div>
                                    <button onClick={() => handleGeneratePDF('invoice', inv)} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-all group shadow-sm border border-slate-100 dark:border-slate-700" title="PDF 인쇄/출력">
                                        <Printer size={16} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-4">
                        {loading ? (
                            <div className="text-center py-12 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">이력을 불러오는 중...</div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-12 bg-white dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                                <Package size={32} className="mx-auto text-slate-300 mb-3" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">납품 이력이 없습니다</p>
                            </div>
                        ) : (
                            history.map(item => (
                                <div key={item.id} className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">{item.PoID || item.PR_ID || 'No Ref'}</div>
                                            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{item.PartName}</h4>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-slate-800 dark:text-slate-100">{Number(item.ReceivedQty || item.Quantity || 0).toLocaleString()} PKG</div>
                                            <div className="text-[9px] font-bold text-slate-400 mt-0.5">{item.CreatedAt?.toDate ? item.CreatedAt.toDate().toLocaleDateString() : new Date(item.CreatedAt).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-slate-800">
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{item.Status}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    if (inline) return content;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>
            {content}
        </div>,
        document.body
    );
}
