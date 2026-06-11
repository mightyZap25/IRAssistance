import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, doc, updateDoc, serverTimestamp, getDocs, collection, query, where, addDoc } from '../firebase';
import { X, ShieldCheck, CheckCircle2, XCircle, Info, User, ClipboardList, Package, Camera, AlertTriangle } from 'lucide-react';

const QualityInspectionModal = ({ isOpen, onClose, inspectionData, onRefresh }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // 'PASS' or 'FAIL'
    const [inspector, setInspector] = useState('');
    const [passQty, setPassQty] = useState(0);
    const [failQty, setFailQty] = useState(0);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen && inspectionData) {
            setPassQty(inspectionData.Qty || 0);
            setFailQty(0);
            setResult(null);
            setNotes('');
        }
    }, [isOpen, inspectionData]);

    const handleComplete = async () => {
        if (!result) return alert('검사 판정(합격/불합격)을 선택해주세요.');
        if (!inspector) return alert('검사자 이름을 입력해주세요.');
        if (passQty + failQty !== inspectionData.Qty) {
            if (!window.confirm('합격/불합격 수량의 합이 요청 수량과 다릅니다. 진행하시겠습니까?')) return;
        }

        setLoading(true);
        try {
            // 1. 품질 검사 데이터 업데이트
            const inspRef = doc(db, 'quality_inspections', inspectionData.id);
            await updateDoc(inspRef, {
                Status: result,
                Inspector: inspector,
                PassQty: Number(passQty),
                FailQty: Number(failQty),
                Notes: notes,
                CompletedAt: serverTimestamp()
            });

            // 2. 수입검사(INCOMING) 합격 시 재고 반영
            if (inspectionData.Type === 'INCOMING' && result === 'PASS' && passQty > 0) {
                const invSnap = await getDocs(query(collection(db, 'inventory'), where('PartID', '==', inspectionData.PartID)));
                
                if (!invSnap.empty) {
                    const invDoc = invSnap.docs[0];
                    await updateDoc(invDoc.ref, {
                        OnHand: (invDoc.data().OnHand || 0) + Number(passQty),
                        UpdatedAt: serverTimestamp()
                    });
                } else {
                    // 재고 레코드가 없는 경우 신규 생성
                    await addDoc(collection(db, 'inventory'), {
                        PartID: inspectionData.PartID,
                        OnHand: Number(passQty),
                        UpdatedAt: serverTimestamp(),
                        Location: '기본 창고'
                    });
                }

                // 입출고 히스토리 기록
                await addDoc(collection(db, 'inventory_history'), {
                    PartID: inspectionData.PartID,
                    Change: Number(passQty),
                    Type: 'IN',
                    SourceType: 'INCOMING_QA',
                    RefID: inspectionData.ID,
                    Timestamp: serverTimestamp(),
                    Inspector: inspector
                });
            }

            // 3. 원천 문서(Purchasing) 상태 업데이트
            if (inspectionData.Type === 'INCOMING' && inspectionData.RefPOID) {
                await updateDoc(doc(db, 'purchasing', inspectionData.RefPOID), {
                    Status: result === 'PASS' ? 'INSPECTION_COMPLETE' : 'INSPECTION_FAIL'
                });
            }

            alert('검사 처리가 완료되었습니다.');
            onRefresh();
            onClose();
        } catch (err) { console.error(err); alert('처리 중 오류 발생'); } finally { setLoading(false); }
    };

    if (!isOpen || !inspectionData) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[11000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden text-left">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-indigo-50/30 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <ShieldCheck size={28} className="text-indigo-600" />
                            품질 검사 수행
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest text-left">{inspectionData.Type} | {inspectionData.ID}</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                    <div className="grid grid-cols-2 gap-10">
                        {/* Left: Info */}
                        <div className="space-y-6">
                            <section className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <ClipboardList size={14}/> 검사 대상 정보
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-xs font-bold text-slate-400">품목명</span>
                                        <span className="text-sm font-black text-slate-800">{inspectionData.PartName}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-xs font-bold text-slate-400">Part ID</span>
                                        <span className="text-xs font-mono font-bold text-indigo-600">{inspectionData.PartID}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 pb-2">
                                        <span className="text-xs font-bold text-slate-400">요청 수량</span>
                                        <span className="text-lg font-black text-slate-900">{inspectionData.Qty?.toLocaleString()} EA</span>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">검사자 이름</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"/>
                                    <input 
                                        type="text" 
                                        value={inspector} 
                                        onChange={e => setInspector(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="검사 담당자 성명"
                                    />
                                </div>
                            </section>
                        </div>

                        {/* Right: Actions */}
                        <div className="space-y-8">
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setResult('PASS')}
                                    className={`p-6 rounded-[32px] border-4 transition-all flex flex-col items-center gap-3 ${result === 'PASS' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-emerald-200'}`}
                                >
                                    <CheckCircle2 size={40} className={result === 'PASS' ? 'text-emerald-500' : 'text-slate-200'}/>
                                    <span className={`text-sm font-black ${result === 'PASS' ? 'text-emerald-700' : 'text-slate-400'}`}>최종 합격 (PASS)</span>
                                </button>
                                <button 
                                    onClick={() => setResult('FAIL')}
                                    className={`p-6 rounded-[32px] border-4 transition-all flex flex-col items-center gap-3 ${result === 'FAIL' ? 'border-rose-500 bg-rose-50' : 'border-slate-100 bg-white hover:border-rose-200'}`}
                                >
                                    <XCircle size={40} className={result === 'FAIL' ? 'text-rose-500' : 'text-slate-200'}/>
                                    <span className={`text-sm font-black ${result === 'FAIL' ? 'text-rose-700' : 'text-slate-400'}`}>불합격 (FAIL)</span>
                                </button>
                            </div>

                            <div className="bg-slate-900 rounded-[32px] p-6 text-white space-y-4">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">합격 수량</label>
                                        <input type="number" value={passQty} onChange={e => setPassQty(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xl font-black outline-none focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">불합격 수량</label>
                                        <input type="number" value={failQty} onChange={e => setFailQty(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xl font-black outline-none focus:ring-2 focus:ring-rose-500" />
                                    </div>
                                </div>
                            </div>

                            <section className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">특이사항 및 불량 사유</label>
                                <textarea 
                                    value={notes} 
                                    onChange={e => setNotes(e.target.value)}
                                    className="w-full h-24 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    placeholder="불량 내용 또는 검사 소견 기술..."
                                />
                            </section>
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                    <button 
                        onClick={handleComplete} 
                        disabled={loading} 
                        className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center gap-3 transition-all disabled:opacity-50"
                    >
                        {loading ? '처리 중...' : '검사 결과 최종 저장'}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default QualityInspectionModal;
