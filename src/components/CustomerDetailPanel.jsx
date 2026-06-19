import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy, limit } from '../firebase';
import { Building2, X, Phone, User, Mail, History, Package, FileText, Receipt, DollarSign, PenTool, Printer, ChevronRight, ExternalLink, MapPin } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function CustomerDetailPanel({ customer, onClose, onEdit, inline = false }) {
    const [activeTab, setActiveTab] = useState('info');
    const [history, setHistory] = useState([]);
    const [deliveredItems, setDeliveredItems] = useState([]);
    const [emailHistory, setEmailHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if(!customer) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Delivery History & Delivered Products
                const qDelivery = query(
                    collection(db, 'receiving'),
                    where('CustomerName', '==', customer.Name),
                    where('Status', '==', 'PLACEMENT_COMPLETE'),
                    orderBy('ReceivedAt', 'desc'),
                    limit(50)
                );
                const snapDelivery = await getDocs(qDelivery);
                const deliveryData = snapDelivery.docs.map(doc => ({ 
                    id: doc.id, 
                    type: 'DELIVERY',
                    ...doc.data() 
                }));
                
                setHistory(deliveryData);
                setDeliveredItems(deliveryData);

                // 2. Fetch Integrated History (Mocking Emails, Quotes, Invoices for now)
                const mockIntegrated = [
                    { id: 'mail-1', type: 'EMAIL', Subject: '[수신] 도면 변경 건 문의', Content: '요청하신 변경 도면 검토 결과 회신드립니다.', CreatedAt: { toDate: () => new Date(Date.now() - 86400000 * 1) }, Sender: 'cs@irrobot.com' },
                    { id: 'quote-1', type: 'QUOTE', Subject: '부품 발주 견적서 발행', Content: '총 금액: ₩12,500,000 (VAT 별도)', CreatedAt: { toDate: () => new Date(Date.now() - 86400000 * 3) } },
                    { id: 'invoice-1', type: 'INVOICE', Subject: '세금계산서 국세청 전송 완료', Content: '공급가액: ₩5,000,000 / 세액: ₩500,000', CreatedAt: { toDate: () => new Date(Date.now() - 86400000 * 7) } },
                    { id: 'mail-2', type: 'EMAIL', Subject: '완제품 납품 일정 안내', Content: '6월 중순 납품 예정인 제품들의 생산이 완료되어 일정을 안내드립니다.', CreatedAt: { toDate: () => new Date(Date.now() - 86400000 * 5) }, Sender: 'sales@irrobot.com' }
                ];
                setEmailHistory(mockIntegrated);
                
            } catch (err) {
                console.error("Error fetching customer data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customer]);

    if (!customer) return null;

    // Combined timeline for History tab
    const timeline = [...history, ...emailHistory].sort((a, b) => {
        const dateA = a.CreatedAt?.toDate ? a.CreatedAt.toDate() : new Date(0);
        const dateB = b.CreatedAt?.toDate ? b.CreatedAt.toDate() : new Date(0);
        return dateB - dateA;
    });

    const content = (
        <div className={`flex flex-col h-full bg-white dark:bg-slate-900 ${inline ? 'w-full' : 'relative rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-800'}`}>
            
            {/* Minimal Header */}
            <div className="px-8 py-8 flex flex-col gap-6 shrink-0 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-800/20 dark:to-slate-900">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{customer.Name}</h2>
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest border ${
                                customer.Category === '해외' 
                                ? 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800' 
                                : 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                            }`}>{customer.Category || '국내'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                            <Building2 size={14} className="text-blue-500" />
                            <p className="text-xs font-bold text-slate-500 truncate max-w-md">{customer.Address || '주소 정보 없음'}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => onEdit(customer)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-800 rounded-2xl transition-all shadow-sm border border-slate-100 dark:border-slate-800">
                            <PenTool size={18} />
                        </button>
                        {!inline && (
                            <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-white dark:hover:bg-slate-800 rounded-2xl transition-all shadow-sm border border-slate-100 dark:border-slate-800">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Modern Simple Tabs */}
                <div className="flex gap-8 border-b border-slate-100 dark:border-slate-800">
                    {[
                        { id: 'info', label: '기본 정보' },
                        { id: 'products', label: '납품 완제품' },
                        { id: 'history', label: '통합 이력' }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-4 text-[11px] font-black transition-all border-b-2 uppercase tracking-widest relative ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            {tab.label}
                            {activeTab === tab.id && <span className="absolute bottom-[-2px] left-0 right-0 h-0.5 bg-blue-600 rounded-full"></span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar bg-white dark:bg-slate-900">
                {activeTab === 'info' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pt-6">
                        {/* Company & Main Info */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 shrink-0 w-[120px]">
                                    <Building2 size={14} className="text-blue-500" />
                                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{customer.Name}</span>
                                </div>
                                <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 shrink-0"></div>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <MapPin size={13} className="text-slate-400" />
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">{customer.Address || '주소 정보 없음'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Contacts Section */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Contacts</h3>
                            </div>
                            {(customer.Contacts && customer.Contacts.length > 0 ? customer.Contacts : [{
                                Name: customer.ContactPerson,
                                Phone: customer.Phone,
                                Email: customer.Email,
                                Title: '주담당자'
                            }]).map((contact, idx) => (
                                <div key={idx} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-blue-200 transition-colors shadow-sm">
                                    <div className="flex items-center gap-2 w-[120px] shrink-0">
                                        <User size={14} className="text-blue-500" />
                                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{contact.Name || '-'}</span>
                                        {contact.Title && <span className="text-[8px] font-bold text-slate-400 border border-slate-100 px-1 rounded shrink-0">{contact.Title}</span>}
                                    </div>
                                    <div className="w-px h-3 bg-slate-100 dark:bg-slate-800 shrink-0"></div>
                                    <div className="flex items-center gap-2 w-[130px] shrink-0">
                                        <Phone size={13} className="text-slate-300" />
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono">{contact.Phone || '-'}</span>
                                    </div>
                                    <div className="w-px h-3 bg-slate-100 dark:bg-slate-800 shrink-0"></div>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Mail size={13} className="text-slate-300" />
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">{contact.Email || '-'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Business Info Info Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">사업자 등록 번호</label>
                                <p className="text-sm font-black text-slate-700 dark:text-slate-200">{customer.BusinessNumber || '-'}</p>
                            </div>
                            <div className="p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">결제 조건</label>
                                <p className="text-sm font-black text-slate-700 dark:text-slate-200">{customer.PaymentTerms || '익월 말 결제'}</p>
                            </div>
                        </div>

                        <div className="p-6 rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex justify-between items-center shadow-lg shadow-blue-200/50 dark:shadow-none">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-blue-100 uppercase tracking-widest">총 누적 매출</label>
                                <div className="text-2xl font-black tracking-tight">₩ 4,700,000</div>
                            </div>
                            <div className="text-right space-y-1">
                                <label className="text-[9px] font-black text-blue-100 uppercase tracking-widest">고객 상태</label>
                                <div className="flex items-center gap-2 justify-end">
                                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                                    <span className="text-xs font-black uppercase tracking-widest">Active Partner</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'products' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pt-4">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">납품된 완제품 리스트</h3>
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{deliveredItems.length} Items</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {loading ? (
                                <div className="py-12 text-center text-[10px] font-black text-slate-300 tracking-widest animate-pulse">데이터 로드 중...</div>
                            ) : deliveredItems.length === 0 ? (
                                <div className="py-16 text-center bg-slate-50 dark:bg-slate-800/30 rounded-[2rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
                                    <Package size={32} className="mx-auto text-slate-200 mb-3" />
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">납품된 제품이 없습니다.</p>
                                </div>
                            ) : (
                                deliveredItems.map(item => (
                                    <div key={item.id} className="p-5 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Package size={24} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-slate-800 dark:text-white">{item.PartName}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-mono font-bold text-slate-400">{item.PartID}</span>
                                                    <span className="text-[10px] text-slate-300">|</span>
                                                    <span className="text-[10px] font-bold text-slate-500">{item.ReceivedAt?.toDate().toLocaleDateString()} 납품</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-base font-black text-slate-900 dark:text-white">{Number(item.ReceivedQty || 0).toLocaleString()} <span className="text-[10px] text-slate-400">EA</span></div>
                                            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter mt-1">Status: {item.Status}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pt-4">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">고객사 커뮤니케이션 & 납품 이력</h3>
                        </div>
                        <div className="relative space-y-4">
                            {/* Timeline Line */}
                            <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-100 dark:bg-slate-800 ml-[0.5px]"></div>
                            
                            {loading ? (
                                <div className="py-12 text-center text-[10px] font-black text-slate-300 tracking-widest uppercase animate-pulse">Loading Logs...</div>
                            ) : timeline.length === 0 ? (
                                <div className="py-16 text-center">
                                    <History size={32} className="mx-auto text-slate-100 mb-3" />
                                    <p className="text-xs font-black text-slate-300 uppercase tracking-widest">이력 정보가 없습니다.</p>
                                </div>
                            ) : (
                                timeline.map((item, idx) => {
                                    let icon, bgColor, textColor, label;
                                    if (item.type === 'DELIVERY') {
                                        icon = <Package size={18} />; bgColor = 'bg-blue-500'; textColor = 'text-blue-600 bg-blue-100'; label = 'Delivery (납품)';
                                    } else if (item.type === 'EMAIL') {
                                        icon = <Mail size={18} />; bgColor = 'bg-slate-700'; textColor = 'text-slate-700 bg-slate-200'; label = 'Email (이메일)';
                                    } else if (item.type === 'QUOTE') {
                                        icon = <FileText size={18} />; bgColor = 'bg-amber-500'; textColor = 'text-amber-700 bg-amber-100'; label = 'Quotation (견적)';
                                    } else if (item.type === 'INVOICE') {
                                        icon = <Receipt size={18} />; bgColor = 'bg-emerald-500'; textColor = 'text-emerald-700 bg-emerald-100'; label = 'Tax Invoice (세금계산서)';
                                    } else {
                                        icon = <History size={18} />; bgColor = 'bg-indigo-500'; textColor = 'text-indigo-600 bg-indigo-100'; label = 'Log';
                                    }

                                    return (
                                    <div key={item.id} className="relative flex gap-6 group">
                                        {/* Icon */}
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 z-10 shadow-sm border border-white dark:border-slate-900 ${bgColor} text-white`}>
                                            {icon}
                                        </div>
                                        {/* Content */}
                                        <div className="flex-1 bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 group-hover:bg-white dark:group-hover:bg-slate-800 transition-all group-hover:shadow-md">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg mb-2 inline-block ${textColor}`}>
                                                        {label}
                                                    </span>
                                                    <h4 className="text-sm font-black text-slate-800 dark:text-white">
                                                        {item.type === 'DELIVERY' ? `${item.PartName} 납품` : item.Subject}
                                                    </h4>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400 font-mono">
                                                    {item.CreatedAt?.toDate().toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                                                {item.type === 'DELIVERY' ? `${item.PONumber || 'PO'} 관련 ${item.ReceivedQty}개 물량 출하 완료되었습니다.` : item.Content}
                                            </p>
                                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] font-bold text-slate-400">
                                                <span>Ref: {item.PONumber || item.id}</span>
                                                <button className="flex items-center gap-1 text-blue-600 hover:underline">상세보기 <ExternalLink size={10} /></button>
                                            </div>
                                        </div>
                                    </div>
                                )})
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    if (inline) return content;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="animate-in zoom-in-95 duration-200 w-full flex justify-center">
                {content}
            </div>
        </div>,
        document.body
    );
}
