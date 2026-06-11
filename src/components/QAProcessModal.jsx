import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, CheckCircle, XCircle, AlertTriangle, ClipboardList, 
    FileText, Plus, Trash2, Save, Info, Gauge, Zap
} from 'lucide-react';
import { db } from '../firebase';
import { 
    doc, getDoc, updateDoc, addDoc, collection, 
    serverTimestamp, writeBatch, query, where, getDocs 
} from 'firebase/firestore';

export default function QAProcessModal({ item, type, isOpen, onClose, onSave }) {
    function InfoRow({ label, value, highlight = false }) {
        return (
            <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                <span className={`font-black ${highlight ? 'text-teal-600' : 'text-slate-700'}`}>{value || '-'}</span>
            </div>
        );
    }

    const [loading, setLoading] = useState(false);
    const [passedQty, setPassedQty] = useState(item?.Qty || 0);
    const [failedQty, setFailedQty] = useState(0);
    const [defects, setDefects] = useState([]); // { code, name, qty, value, note }
    const [inspectionMethod, setInspectionMethod] = useState('Full');
    const [remarks, setRemarks] = useState('');
    
    // Master data
    const [defectCodes, setDefectCodes] = useState([]);
    const [qaStandards, setQaStandards] = useState(null);

    // Temp defect input
    const [selectedDefectCode, setSelectedDefectCode] = useState('');
    const [tempDefectQty, setTempDefectQty] = useState(1);
    const [tempDefectValue, setTempDefectValue] = useState('');

    useEffect(() => {
        if (isOpen && item) {
            setPassedQty(item.Qty || 0);
            setFailedQty(0);
            setDefects([]);
            setRemarks('');
            fetchMasterData();
        }
    }, [isOpen, item]);

    const fetchMasterData = async () => {
        try {
            // 1. Load Defect Codes for the current category
            const categoryMap = { 'receiving': 'Receiving', 'shipping': 'Shipping', 'middle': 'Middle' };
            const q = query(collection(db, 'qa_defect_codes'), where('category', '==', categoryMap[type]));
            const dSnap = await getDocs(q);
            const dList = [];
            dSnap.forEach(d => dList.push({ id: d.id, ...d.data() }));
            setDefectCodes(dList);

            // 2. Load QA Standards for the part
            if (item.PartID) {
                const qaDoc = await getDoc(doc(db, 'qa_target_parts', String(item.PartID)));
                if (qaDoc.exists()) {
                    setQaStandards(qaDoc.data());
                } else {
                    // Fallback search by partId field
                    const q2 = query(collection(db, 'qa_target_parts'), where('partId', '==', String(item.PartID)));
                    const q2Snap = await getDocs(q2);
                    if (!q2Snap.empty) setQaStandards(q2Snap.docs[0].data());
                }
            }
        } catch (err) {
            console.error("Error fetching master data:", err);
        }
    };

    const handleAddDefect = () => {
        if (!selectedDefectCode) return;
        const codeObj = defectCodes.find(c => c.code === selectedDefectCode);
        if (!codeObj) return;

        const newDefect = {
            code: codeObj.code,
            name: codeObj.name,
            qty: parseInt(tempDefectQty) || 0,
            value: tempDefectValue,
            id: Date.now()
        };

        const updatedDefects = [...defects, newDefect];
        setDefects(updatedDefects);
        
        // Auto-calculate failed qty
        const totalFailed = updatedDefects.reduce((sum, d) => sum + d.qty, 0);
        setFailedQty(totalFailed);
        setPassedQty(Math.max(0, (item.Qty || 0) - totalFailed));

        // Reset temps
        setSelectedDefectCode('');
        setTempDefectQty(1);
        setTempDefectValue('');
    };

    const handleRemoveDefect = (id) => {
        const updated = defects.filter(d => d.id !== id);
        setDefects(updated);
        const totalFailed = updated.reduce((sum, d) => sum + d.qty, 0);
        setFailedQty(totalFailed);
        setPassedQty(Math.max(0, (item.Qty || 0) - totalFailed));
    };

    const handleSubmit = async () => {
        if (passedQty + failedQty !== item.Qty) {
            if (!window.confirm(`총 수량(${item.Qty})과 검사 합계(${passedQty + failedQty})가 일치하지 않습니다. 그래도 진행하시겠습니까?`)) return;
        }

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const result = failedQty === 0 ? 'Pass' : 'Fail';
            const timestamp = serverTimestamp();

            // 1. Update the inspection record
            let collectionName = '';
            if (type === 'receiving') collectionName = 'receiving';
            else if (type === 'shipping') collectionName = 'qa_shipping_inspections';
            else collectionName = 'qa_middle_inspections';

            const recordRef = doc(db, collectionName, item.id);
            const updateData = {
                PassedQty: passedQty,
                FailedQty: failedQty,
                Defects: defects,
                Status: 'QA_COMPLETE', // or INSPECTION_COMPLETE
                result: result,
                InspectionMethod: inspectionMethod,
                Remarks: remarks,
                InspectedAt: timestamp
            };
            batch.update(recordRef, updateData);

            // 2. If production-related, update Production Request status
            if (item.RefPRID) {
                const prRef = doc(db, 'production_requests', item.RefPRID);
                batch.update(prRef, {
                    Status: 'QA_COMPLETE',
                    UpdatedAt: timestamp
                });
            }

            await batch.commit();
            alert('검사 결과가 성공적으로 저장되었습니다.');
            onSave();
            onClose();
        } catch (err) {
            alert('저장 실패: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-teal-600 rounded-2xl shadow-lg shadow-teal-100">
                            <ClipboardList className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">품질 검사 및 판정</h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5">
                                {type.toUpperCase()} | {item.PONumber || item.PRNumber || 'ID 없음'} | {item.PartName}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    {/* Left: Info & Criteria */}
                    <div className="w-full lg:w-1/3 bg-slate-50/50 border-r border-slate-100 p-8 space-y-6 overflow-y-auto custom-scrollbar">
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Info size={14} className="text-blue-500" /> 기본 정보
                            </h4>
                            <div className="space-y-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                                <InfoRow label="품목 ID" value={item.PartID} />
                                <InfoRow label="품명" value={item.PartName} />
                                <InfoRow label="총 수량" value={`${item.Qty} EA`} highlight />
                                <InfoRow label="요청일" value={item.ReceivedAt?.toDate ? item.ReceivedAt.toDate().toLocaleDateString() : item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-'} />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Gauge size={14} className="text-teal-500" /> 품질 검사 기준 (QA Standard)
                            </h4>
                            {qaStandards ? (
                                <div className="space-y-4">
                                    {qaStandards.useDocument ? (
                                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
                                            <FileText size={18} className="text-blue-500 mt-0.5" />
                                            <p className="text-[11px] font-bold text-blue-700 leading-relaxed">
                                                도면 또는 데이터시트를 참조하여 검사를 수행하십시오.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50 border-b border-slate-100">
                                                    <tr>
                                                        <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">항목</th>
                                                        <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase text-right">기준값</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {qaStandards.inspectionItems?.map((std, idx) => (
                                                        <tr key={idx} className="hover:bg-teal-50/10">
                                                            <td className="px-3 py-2.5 text-[10px] font-black text-slate-700">{std.name}</td>
                                                            <td className="px-3 py-2.5 text-[10px] font-bold text-teal-600 text-right">{std.standard}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                                    <p className="text-[10px] text-slate-400 font-bold">등록된 검사 기준이 없습니다.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Results Input */}
                    <div className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar bg-white">
                        {/* 1. Quantities */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-teal-50/50 p-6 rounded-[2rem] border border-teal-100">
                                <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest block mb-2">양품 수량 (Good)</label>
                                <div className="flex items-end gap-2">
                                    <input 
                                        type="number" 
                                        value={passedQty}
                                        onChange={e => setPassedQty(parseInt(e.target.value) || 0)}
                                        className="text-3xl font-black text-teal-700 bg-transparent outline-none w-full"
                                    />
                                    <span className="text-sm font-bold text-teal-500 pb-1">EA</span>
                                </div>
                            </div>
                            <div className="bg-rose-50/50 p-6 rounded-[2rem] border border-rose-100">
                                <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2">불량 수량 (Reject)</label>
                                <div className="flex items-end gap-2">
                                    <input 
                                        type="number" 
                                        value={failedQty}
                                        readOnly
                                        className="text-3xl font-black text-rose-700 bg-transparent outline-none w-full"
                                    />
                                    <span className="text-sm font-bold text-rose-500 pb-1">EA</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">검사 방법</label>
                                <select 
                                    value={inspectionMethod}
                                    onChange={e => setInspectionMethod(e.target.value)}
                                    className="w-full bg-transparent text-lg font-black text-slate-700 outline-none mt-2"
                                >
                                    <option value="Full">전수 검사</option>
                                    <option value="Sample">샘플 검사</option>
                                </select>
                            </div>
                        </div>

                        {/* 2. Defect Registration */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-black text-slate-800 uppercase flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-rose-500" /> 불량 내역 및 데이터 입력
                                </h4>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                <div className="md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">불량 유형 선택</label>
                                    <select 
                                        value={selectedDefectCode}
                                        onChange={e => setSelectedDefectCode(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-sm"
                                    >
                                        <option value="">유형 선택...</option>
                                        {defectCodes.map(c => <option key={c.id} value={c.code}>{c.name} ({c.code})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">불량 수량</label>
                                    <input 
                                        type="number" 
                                        value={tempDefectQty}
                                        onChange={e => setTempDefectQty(parseInt(e.target.value) || 1)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-sm"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button 
                                        onClick={handleAddDefect}
                                        className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-xs font-black hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-100"
                                    >
                                        <Plus size={14} /> 추가하기
                                    </button>
                                </div>
                                <div className="md:col-span-4 mt-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1 block">측정 데이터값 (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="예: 실측값 98.5mm"
                                        value={tempDefectValue}
                                        onChange={e => setTempDefectValue(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            {/* Defects List */}
                            {defects.length > 0 && (
                                <div className="space-y-2">
                                    {defects.map(d => (
                                        <div key={d.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-rose-200 transition-all group animate-in slide-in-from-left-2">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                                                    <XCircle size={18} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-slate-800">{d.name}</span>
                                                        <span className="text-[9px] font-mono font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{d.code}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-[10px] font-bold text-rose-600">수량: {d.qty} EA</span>
                                                        {d.value && <span className="text-[10px] font-bold text-slate-400 border-l border-slate-200 pl-3">데이터: {d.value}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleRemoveDefect(d.id)}
                                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 3. Remarks */}
                        <div>
                            <label className="text-[11px] font-black text-slate-800 uppercase mb-3 block">검사 비고 (Remarks)</label>
                            <textarea 
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                placeholder="검사 과정에서의 특이사항이나 조치 내용을 입력하세요."
                                className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none transition-all min-h-[100px]"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white border border-slate-200 text-slate-500 font-black text-xs rounded-2xl hover:bg-slate-50 transition-all"
                    >
                        취소
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-10 py-2.5 bg-slate-900 text-white font-black text-xs rounded-2xl shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? '저장 중...' : <><Save size={16} /> 판정 결과 저장</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
