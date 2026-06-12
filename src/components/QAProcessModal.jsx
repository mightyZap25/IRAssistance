import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, CheckCircle, XCircle, AlertTriangle, ClipboardList, 
    FileText, Plus, Trash2, Save, Info, Gauge, Zap
} from 'lucide-react';
import { db, 
    doc, getDoc, updateDoc, addDoc, collection, 
    serverTimestamp, writeBatch, query, where, getDocs 
} from '../firebase';
import { autoRegisterDefect } from '../services/defectAutoRegister';
import QAItemReportModal from './QAItemReportModal';

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
    const [handlingType, setHandlingType] = useState('Rework'); // 'Rework' | 'Additional' | 'None'
    
    // Master data
    const [defectCodes, setDefectCodes] = useState([]);
    const [qaStandards, setQaStandards] = useState(null);

    // Temp defect input
    const [selectedDefectCode, setSelectedDefectCode] = useState('');
    const [tempDefectQty, setTempDefectQty] = useState(1);
    const [tempDefectValue, setTempDefectValue] = useState('');

    // Report modal state
    const [isReportOpen, setIsReportOpen] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setPassedQty(item.PassedQty !== undefined ? item.PassedQty : item.Qty || 0);
            setFailedQty(item.FailedQty || 0);
            setDefects(item.Defects || []);
            setRemarks(item.Remarks || '');
            setInspectionMethod(item.InspectionMethod || 'Full');
            fetchMasterData();
        }
    }, [isOpen, item]);

    const fetchMasterData = async () => {
        try {
            // 1. Load Defect Codes - Fetch all and filter manually for mock compatibility
            const dSnap = await getDocs(collection(db, 'qa_defect_codes'));
            const categoryMap = { 'receiving': 'Receiving', 'shipping': 'Shipping', 'middle': 'Middle' };
            const targetCategory = categoryMap[type] || type;
            
            const dList = [];
            dSnap.forEach(d => {
                const data = d.data();
                if (!targetCategory || (data.category && data.category.toLowerCase() === targetCategory.toLowerCase())) {
                    dList.push({ id: d.id || data.code, ...data });
                }
            });
            
            setDefectCodes(dList);

            // 2. Load QA Standards for the part
            if (item.PartID) {
                const qaDoc = await getDoc(doc(db, 'qa_target_parts', String(item.PartID)));
                if (qaDoc.exists()) {
                    setQaStandards(qaDoc.data());
                } else {
                    const q2 = query(collection(db, 'qa_target_parts'), where('partId', '==', String(item.PartID)));
                    const q2Snap = await getDocs(q2);
                    if (!q2Snap.empty) setQaStandards(q2Snap.docs[0].data());
                }
            }
        } catch (err) {
            console.error("Error fetching master data:", err);
        }
    };

    const handlePassedQtyChange = (val) => {
        if (item.Status === 'QA_COMPLETE' || item.Status === 'INSPECTION_COMPLETE') return;
        const p = Math.min(item.Qty, Math.max(0, parseInt(val) || 0));
        setPassedQty(p);
        setFailedQty(item.Qty - p);
    };

    const handleFailedQtyChange = (val) => {
        if (item.Status === 'QA_COMPLETE' || item.Status === 'INSPECTION_COMPLETE') return;
        const f = Math.min(item.Qty, Math.max(0, parseInt(val) || 0));
        setFailedQty(f);
        setPassedQty(item.Qty - f);
        const alreadyAssigned = defects.reduce((sum, d) => sum + d.qty, 0);
        setTempDefectQty(Math.max(1, f - alreadyAssigned));
    };

    // New state for manual entry mode
    const [isAddingNewType, setIsAddingNewType] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');

    const handleAddDefect = async () => {
        if (item.Status === 'QA_COMPLETE' || item.Status === 'INSPECTION_COMPLETE') return;
        let defectName = '';
        let codeObj = null;

        if (isAddingNewType) {
            if (!newTypeName) return alert('신규 불량 유형명을 입력해주세요.');
            const categoryMap = { 'receiving': 'Receiving', 'shipping': 'Shipping', 'middle': 'Middle' };
            const registered = await autoRegisterDefect(newTypeName, categoryMap[type]);
            if (registered) {
                codeObj = registered;
                setDefectCodes(prev => [...prev, registered]);
                setIsAddingNewType(false);
                setNewTypeName('');
            } else {
                return alert('불량 코드 등록 중 오류가 발생했습니다.');
            }
        } else {
            if (!selectedDefectCode) return alert('불량 유형을 선택해주세요.');
            codeObj = defectCodes.find(c => c.code === selectedDefectCode);
        }

        if (!codeObj) return;

        const qtyToAdd = parseInt(tempDefectQty) || 0;
        const newDefect = {
            code: codeObj.code,
            name: codeObj.name,
            qty: qtyToAdd,
            value: tempDefectValue,
            id: Date.now()
        };

        const updatedDefects = [...defects, newDefect];
        setDefects(updatedDefects);
        
        const totalDetailFailed = updatedDefects.reduce((sum, d) => sum + d.qty, 0);
        if (totalDetailFailed > failedQty) {
            setFailedQty(totalDetailFailed);
            setPassedQty(Math.max(0, (item.Qty || 0) - totalDetailFailed));
        }

        setSelectedDefectCode('');
        const remaining = Math.max(1, (totalDetailFailed > failedQty ? totalDetailFailed : failedQty) - totalDetailFailed);
        setTempDefectQty(Math.max(1, remaining));
        setTempDefectValue('');
    };

    const handleRemoveDefect = (id) => {
        if (item.Status === 'QA_COMPLETE' || item.Status === 'INSPECTION_COMPLETE') return;
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

            let collectionName = '';
            if (type === 'receiving') collectionName = 'receiving';
            else if (type === 'shipping') collectionName = 'qa_shipping_inspections';
            else collectionName = 'qa_middle_inspections';

            const recordRef = doc(db, collectionName, item.id);
            const updateData = {
                PassedQty: passedQty,
                FailedQty: failedQty,
                Defects: defects,
                Status: 'QA_COMPLETE',
                result: result,
                InspectionMethod: inspectionMethod,
                Remarks: remarks,
                InspectedAt: timestamp
            };
            batch.update(recordRef, updateData);

            // 2. If production-related, update ONLY the specific schedule status
            if (item.PR_ID) {
                const prRef = doc(db, 'production_requests', item.PR_ID);
                const prSnap = await getDoc(prRef);
                
                if (prSnap.exists()) {
                    const prData = prSnap.data();
                    const updatedItems = [...(prData.Items || [])];
                    let updated = false;

                    // Find the item and schedule to update using PartID and ScheduleIdx
                    updatedItems.forEach((pItem) => {
                        if (pItem.PartID === item.PartID) {
                            if (pItem.Schedules && item.ScheduleIdx !== undefined && pItem.Schedules[item.ScheduleIdx]) {
                                // ─────────────────────────────────────────────────────────────
                                // [부적합품 조치 핵심 로직]
                                // ─────────────────────────────────────────────────────────────
                                if (failedQty > 0) {
                                    if (handlingType === 'Rework') {
                                        // 방안 A: 재작업 - 상태를 다시 생산중으로 롤백
                                        pItem.Schedules[item.ScheduleIdx].status = 'IN_PRODUCTION';
                                        pItem.Schedules[item.ScheduleIdx].remarks = `[QA재작업지시] ${remarks}`;
                                        updated = true;
                                    } else if (handlingType === 'Additional') {
                                        // 방안 B: 추가 생산 - 현재 차수는 완료, 부족분 신규 차수 생성
                                        pItem.Schedules[item.ScheduleIdx].status = 'QA_COMPLETE';
                                        
                                        // 신규 차수 일정 추가
                                        const nextDate = new Date();
                                        nextDate.setDate(nextDate.getDate() + 3); // 기본 3일 후로 세팅
                                        const newSchedule = {
                                            date: nextDate.toISOString().split('T')[0],
                                            qty: failedQty,
                                            status: 'PROD_WAITING',
                                            isAdditional: true,
                                            parentScheduleIdx: item.ScheduleIdx,
                                            remarks: `[QA불량보충] 원본차수: ${item.ScheduleIdx + 1}차`
                                        };
                                        pItem.Schedules.push(newSchedule);
                                        updated = true;
                                    } else {
                                        // 방안 C: 부족 승인 (None) - 그냥 완료
                                        pItem.Schedules[item.ScheduleIdx].status = 'QA_COMPLETE';
                                        updated = true;
                                    }
                                } else {
                                    // 불량 없는 경우 정상 완료
                                    pItem.Schedules[item.ScheduleIdx].status = 'QA_COMPLETE';
                                    updated = true;
                                }
                                
                                // Aggregated item status
                                if (pItem.Schedules.every(s => ['QA_COMPLETE', 'SHIP_READY', 'SHIPPED'].includes(s.status))) {
                                    pItem.Status = 'QA_COMPLETE';
                                }
                            } else if (!pItem.Schedules && !updated) {
                                pItem.Status = 'QA_COMPLETE';
                                updated = true;
                            }
                        }
                    });

                    const updatePayload = { UpdatedAt: timestamp };
                    if (updated) {
                        updatePayload.Items = updatedItems;
                        // Overall PR status: only QA_COMPLETE if every schedule of every item is done
                        const allDone = updatedItems.every(pItem => 
                            (pItem.Schedules || [{ status: pItem.Status }]).every(s => ['QA_COMPLETE', 'SHIP_READY', 'SHIPPED'].includes(s.status))
                        );
                        updatePayload.Status = allDone ? 'QA_COMPLETE' : 'IN_PRODUCTION';
                    } else {
                        // If no specific schedule was found/updated, but it is a PR, update main status as fallback
                        updatePayload.Status = 'QA_COMPLETE';
                    }

                    batch.update(prRef, updatePayload);
                }
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

    const isViewMode = item.Status === 'QA_COMPLETE' || item.Status === 'INSPECTION_COMPLETE';

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
                    <div className="flex items-center gap-2">
                        {isViewMode && (
                            <button 
                                onClick={() => setIsReportOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 border border-teal-100 rounded-xl text-xs font-black hover:bg-teal-600 hover:text-white transition-all shadow-sm"
                            >
                                <FileText size={14} /> 성적서 출력
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-all"><X size={20} /></button>
                    </div>
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
                                        onChange={e => handlePassedQtyChange(e.target.value)}
                                        readOnly={isViewMode}
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
                                        onChange={e => handleFailedQtyChange(e.target.value)}
                                        readOnly={isViewMode}
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
                                    disabled={isViewMode}
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

                            {!isViewMode && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                    <div className="md:col-span-2">
                                        <div className="flex justify-between items-center mb-1 ml-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase block">
                                                {isAddingNewType ? '신규 불량 유형명 직접 입력' : '불량 유형 선택'}
                                            </label>
                                            <button 
                                                type="button"
                                                onClick={() => { setIsAddingNewType(!isAddingNewType); setSelectedDefectCode(''); setNewTypeName(''); }}
                                                className="text-[9px] font-black text-teal-600 hover:text-teal-800 transition-colors uppercase tracking-tighter"
                                            >
                                                {isAddingNewType ? '취소 및 목록에서 선택' : '+ 신규 유형 추가'}
                                            </button>
                                        </div>
                                        
                                        {isAddingNewType ? (
                                            <div className="relative">
                                                <input 
                                                    type="text"
                                                    value={newTypeName}
                                                    onChange={e => setNewTypeName(e.target.value)}
                                                    placeholder="새로운 불량 사유 입력..."
                                                    className="w-full bg-white border-2 border-teal-500 rounded-xl px-4 py-2.5 text-xs font-black outline-none shadow-md animate-in zoom-in-95"
                                                    autoFocus
                                                />
                                                <Zap size={14} className="absolute right-3 top-3 text-teal-500 animate-pulse" />
                                            </div>
                                        ) : (
                                            <select 
                                                value={selectedDefectCode}
                                                onChange={e => setSelectedDefectCode(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-sm"
                                            >
                                                <option value="">유형 선택 (목록)...</option>
                                                {defectCodes.map(c => (
                                                    <option key={c.id} value={c.code}>{c.name} ({c.code})</option>
                                                ))}
                                            </select>
                                        )}
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
                                            className={`w-full ${isAddingNewType ? 'bg-teal-600 hover:bg-teal-700' : 'bg-slate-900 hover:bg-black'} text-white py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg`}
                                        >
                                            {isAddingNewType ? <Zap size={14} /> : <Plus size={14} />}
                                            {isAddingNewType ? '등록 후 추가' : '추가하기'}
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
                            )}

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
                                            {!isViewMode && (
                                                <button 
                                                    onClick={() => handleRemoveDefect(d.id)}
                                                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 3. Disposition (Only if failedQty > 0) */}
                        {!isViewMode && failedQty > 0 && (
                            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 space-y-4 animate-in slide-in-from-top-2">
                                <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
                                    <RotateCcw size={18} className="text-rose-600" />
                                    <h4 className="text-xs font-black text-rose-800 uppercase tracking-tight">부적합품 조치 방안 선택 (Disposition)</h4>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { id: 'Rework', label: '재작업 (Rework)', desc: '상태를 생산중으로 되돌림' },
                                        { id: 'Additional', label: '추가생산 (New)', desc: '부족분 신규 일정 생성' },
                                        { id: 'None', label: '부족승인 (Accept)', desc: '부족한 대로 마감' }
                                    ].map(type => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setHandlingType(type.id)}
                                            className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-1 ${handlingType === type.id ? 'bg-rose-600 border-rose-600 text-white shadow-lg' : 'bg-white border-rose-100 text-slate-400 hover:border-rose-300'}`}
                                        >
                                            <span className="text-[11px] font-black">{type.label}</span>
                                            <span className={`text-[9px] font-bold ${handlingType === type.id ? 'text-rose-100' : 'text-slate-400'}`}>{type.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. Remarks */}
                        <div>
                            <label className="text-[11px] font-black text-slate-800 uppercase mb-3 block">검사 비고 (Remarks)</label>
                            <textarea 
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                readOnly={isViewMode}
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
                        {isViewMode ? '닫기' : '취소'}
                    </button>
                    {!isViewMode && (
                        <button 
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-10 py-2.5 bg-slate-900 text-white font-black text-xs rounded-2xl shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            {loading ? '저장 중...' : <><Save size={16} /> 판정 결과 저장</>}
                        </button>
                    )}
                </div>
            </div>

            {/* Individual Inspection Report Modal */}
            {isReportOpen && (
                <QAItemReportModal
                    item={item}
                    type={type}
                    isOpen={isReportOpen}
                    onClose={() => setIsReportOpen(false)}
                />
            )}
        </div>,
        document.body
    );
}
