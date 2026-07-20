import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, AlertTriangle, Camera, Package, Info, CheckCircle2, Cloud, ExternalLink, FileText, ClipboardList, Trash2, Plus } from 'lucide-react';
import { updateDoc, doc, collection, getDocs, addDoc, serverTimestamp, writeBatch, getDoc, query, where } from '../database';
import { db } from '../database';
import { useAuth } from '../contexts/AuthContext';
import { autoRegisterDefect } from '../services/defectAutoRegister';
import clsx from 'clsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MOCKUP_COLORS = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

export default function QAInspectionModal({ item, isOpen, onClose, onRefresh }) {
    const { userProfile } = useAuth();
    const [passedQty, setPassedQty] = useState('');
    const [failedQty, setFailedQty] = useState('');
    const [defects, setDefects] = useState([]);
    const [currentDefectType, setCurrentDefectType] = useState('');
    const [currentDefectQty, setCurrentDefectQty] = useState('');
    const [currentDefectNote, setCurrentDefectNote] = useState('');
    const [loading, setLoading] = useState(false);

    // 신규 입력 항목
    const [inspectionMethod, setInspectionMethod] = useState('Full'); // Full (전수) | Sample (샘플)
    const [handlingType, setHandlingType] = useState('Return'); // Return (반품) | SpecialAcceptance (특채)
    const [specialAcceptanceCondition, setSpecialAcceptanceCondition] = useState('');
    
    // 추가 품질 정보 항목
    const [lotNumber, setLotNumber] = useState('');
    const [drawingNo, setDrawingNo] = useState('');
    const [inspectionTool, setInspectionTool] = useState('Vernier Calipers');
    const [defectPhotoUrl, setDefectPhotoUrl] = useState('');
    const [partDatasheet, setPartDatasheet] = useState('');
    
    // QA 기준 정보 로드
    const [qaStandards, setQaStandards] = useState(null);
    
    // DB에서 마스터 불량 유형 로드
    const [dbDefectTypes, setDbDefectTypes] = useState([]);

    const [googleSheetLink, setGoogleSheetLink] = useState('');
    const [isSheetCreated, setIsSheetCreated] = useState(false);
    
    // 예시 템플릿 보기용 모달 플래그
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setPassedQty((item.PassedQty !== undefined ? item.PassedQty : item.Qty || 0).toString());
            setFailedQty((item.FailedQty || 0).toString());
            setDefects(item.Defects || []);
            setInspectionMethod(item.InspectionMethod || 'Full');
            setHandlingType(item.HandlingType || 'Return');
            setSpecialAcceptanceCondition(item.SpecialAcceptanceCondition || '');
            setGoogleSheetLink(item.GoogleSheetLink || '');
            setIsSheetCreated(!!item.GoogleSheetLink);
            setShowPreview(false);

            setLotNumber(item.LotNumber || '');
            setDrawingNo(item.DrawingNo || '');
            setInspectionTool(item.InspectionTool || 'Vernier Calipers');
            setDefectPhotoUrl(item.DefectPhotoUrl || '');
            setPartDatasheet('');
            setQaStandards(null);
            
            // Fetch associated part's datasheet and QA Standards
            if (item.PartID) {
                const partIdStr = String(item.PartID);
                const partDocRef = doc(db, 'parts', partIdStr);
                getDoc(partDocRef).then(snap => {
                    if (snap.exists()) {
                        setPartDatasheet(snap.data().Datasheet || '');
                    } else {
                        getDocs(query(collection(db, 'parts'), where('PartID', '==', partIdStr))).then(qSnap => {
                            if (!qSnap.empty) {
                                setPartDatasheet(qSnap.docs[0].data().Datasheet || '');
                            }
                        });
                    }
                });

                // Load QA Standards (Inspection Items)
                getDoc(doc(db, 'qa_target_parts', partIdStr)).then(snap => {
                    if (snap.exists()) {
                        setQaStandards(snap.data());
                    } else {
                        getDocs(query(collection(db, 'qa_target_parts'), where('partId', '==', partIdStr))).then(qSnap => {
                            if (!qSnap.empty) setQaStandards(qSnap.docs[0].data());
                        });
                    }
                });
            }
            
            getDocs(collection(db, 'qa_defect_codes')).then(snap => {
                const list = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.category === 'Receiving') list.push(data.name);
                });
                setDbDefectTypes(list.length > 0 ? list : ['치수 불량', '외관 스크래치', '파손/크랙', '조립 불량', '도금/도장 불량', '이물질/오염', '포장 불량', '기타']);
            });
        }
    }, [isOpen, item]);

    if (!isOpen || !item) return null;

    const handlePassedQtyChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setPassedQty(val.toString());
        setFailedQty(Math.max(0, item.Qty - val).toString());
    };

    const handleFailedQtyChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setFailedQty(val.toString());
        setPassedQty(Math.max(0, item.Qty - val).toString());
    };

    const addDefect = async () => {
        if (!currentDefectType) return alert('불량 종류를 선택해주세요.');
        const dq = parseInt(currentDefectQty) || 0;
        if (dq <= 0) return alert('불량 수량을 1개 이상 입력해주세요.');
        
        // Auto-register if new
        if (!dbDefectTypes.includes(currentDefectType)) {
            const registered = await autoRegisterDefect(currentDefectType, 'Receiving');
            if (registered) {
                setDbDefectTypes(prev => [...prev, registered.name]);
            }
        }

        setDefects([...defects, { type: currentDefectType, qty: dq, note: currentDefectNote }]);
        setCurrentDefectType(''); setCurrentDefectNote(''); setCurrentDefectQty('');
    };

    const removeDefect = (index) => setDefects(defects.filter((_, i) => i !== index));

    const handlePreCreateSheet = async () => {
        const token = localStorage.getItem('google_access_token');
        if (!token) return alert('구글 연동 계정이 로그인되어 있지 않습니다.');
        if (googleSheetLink) { window.open(googleSheetLink, '_blank'); setShowPreview(true); return; }

        setLoading(true);
        try {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `수입검사성적서_${item.PartName}_${item.PONumber}`,
                    mimeType: 'application/vnd.google-apps.spreadsheet',
                    parents: ['1oXv2DwVuvLiVSvhbS02aVydwoClztkrd']
                })
            });
            if (!createRes.ok) throw new Error('구글 시트 생성 실패');
            const fileData = await createRes.json();
            const docUrl = `https://docs.google.com/spreadsheets/d/${fileData.id}/edit`;
            
            await updateDoc(doc(db, 'receiving', item.id), { GoogleSheetLink: docUrl });
            setGoogleSheetLink(docUrl); setIsSheetCreated(true); setShowPreview(true);
        } catch (err) {
            alert(`오류: ${err.message}`);
        } finally { setLoading(false); }
    };

    const handleSubmitWithSheet = async (e) => {
        e.preventDefault();
        const pQty = parseInt(passedQty) || 0;
        const fQty = parseInt(failedQty) || 0;
        if (pQty + fQty !== item.Qty) return alert('수량 합계가 일치하지 않습니다.');
        if (!googleSheetLink) return alert('성적서를 먼저 생성해주세요.');

        setLoading(true);
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'receiving', item.id), {
                Status: 'INSPECTION_COMPLETE', PassedQty: pQty, FailedQty: fQty, Defects: defects,
                InspectionMethod: inspectionMethod, HandlingType: fQty > 0 ? handlingType : 'None',
                GoogleSheetLink: googleSheetLink, LotNumber: lotNumber, DrawingNo: drawingNo,
                InspectionTool: inspectionTool, DefectPhotoUrl: defectPhotoUrl,
                InspectedAt: serverTimestamp(), InspectedBy: userProfile?.uid || 'Unknown'
            });
            await batch.commit();
            alert('검사 완료!'); onRefresh && await onRefresh(); onClose();
        } catch (error) { alert('오류 발생'); } finally { setLoading(false); }
    };

    const content = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-indigo-500/20">
                    <h2 className="text-white font-black flex items-center gap-2">
                        <CheckCircle2 size={20} className="text-teal-400" />
                        QA 입고 검사 (Receiving Inspection)
                    </h2>
                    <button onClick={onClose} className="p-2 text-slate-350 hover:text-white transition-all"><X size={15} /></button>
                </div>

                <form id="qaForm" onSubmit={handleSubmitWithSheet} className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100">
                                    <Package size={20} className="text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-indigo-600 mb-0.5">{item.PONumber}</p>
                                    <h3 className="text-sm font-black text-slate-900 truncate">{item.PartName}</h3>
                                    <p className="text-xs text-slate-500 mt-1 font-bold">공급사: {item.VendorName}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[9px] font-black text-slate-400 uppercase">입고 수량</p>
                                    <p className="text-2xl font-black text-slate-900">{item.Qty} EA</p>
                                </div>
                            </div>

                            {qaStandards && (
                                <div className="bg-white p-4 rounded-xl border-2 border-teal-100 shadow-md">
                                    <div className="flex items-center justify-between mb-3 border-b border-teal-50 pb-2">
                                        <h4 className="text-[10px] font-black text-teal-700 flex items-center gap-1.5 uppercase">
                                            <ClipboardList size={14} /> 품질 검사 기준 (QA Standards)
                                        </h4>
                                    </div>
                                    {qaStandards.useDocument ? (
                                        <p className="text-[11px] font-bold text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                            도면 또는 데이터시트를 참조하여 검사를 수행하십시오.
                                        </p>
                                    ) : (
                                        <div className="overflow-hidden rounded-xl border border-slate-100">
                                            <table className="w-full text-left text-[11px]">
                                                <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                                                    <tr><th className="px-3 py-1.5">항목</th><th className="px-3 py-1.5">기준값</th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 bg-white">
                                                    {qaStandards.inspectionItems?.map((std, idx) => (
                                                        <tr key={idx}><td className="px-3 py-2 font-black text-slate-700">{std.name}</td><td className="px-3 py-2 font-bold text-teal-600">{std.standard}</td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-3 rounded-xl border border-teal-100">
                                    <label className="text-[10px] font-black text-teal-700 block mb-1">합격 수량 (Passed)</label>
                                    <input type="number" value={passedQty} onChange={handlePassedQtyChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-lg font-black text-teal-600 text-center" required />
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-rose-100">
                                    <label className="text-[10px] font-black text-rose-700 block mb-1">불량 수량 (Failed)</label>
                                    <input type="number" value={failedQty} onChange={handleFailedQtyChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-lg font-black text-rose-600 text-center" required />
                                </div>
                            </div>

                            {parseInt(failedQty) > 0 && (
                                <div className="bg-white p-4 rounded-xl border border-rose-100 space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle size={16} className="text-rose-500" />
                                        <h4 className="text-[10px] font-black text-rose-700 uppercase">불량 내역 등록 (Defect Details)</h4>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <input 
                                                    list="inspection-defect-types"
                                                    value={currentDefectType}
                                                    onChange={e => setCurrentDefectType(e.target.value)}
                                                    placeholder="불량 종류 입력 또는 선택"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-rose-400"
                                                />
                                                <datalist id="inspection-defect-types">
                                                    {dbDefectTypes.map((t, idx) => <option key={idx} value={t} />)}
                                                </datalist>
                                            </div>
                                            <input 
                                                type="number" 
                                                value={currentDefectQty}
                                                onChange={e => setCurrentDefectQty(e.target.value)}
                                                placeholder="수량"
                                                className="w-20 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-center"
                                            />
                                            <button 
                                                type="button"
                                                onClick={addDefect}
                                                className="bg-rose-600 text-white px-3 rounded-lg hover:bg-rose-700 transition-colors"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <input 
                                            type="text"
                                            value={currentDefectNote}
                                            onChange={e => setCurrentDefectNote(e.target.value)}
                                            placeholder="불량 상세 내용 (선택 사항)"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-rose-400"
                                        />
                                    </div>

                                    {defects.length > 0 && (
                                        <div className="mt-4 space-y-2 border-t border-rose-50 pt-3">
                                            {defects.map((def, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-black text-rose-700">{def.type}</span>
                                                            <span className="text-[10px] font-bold text-rose-500 bg-white px-1.5 rounded-full border border-rose-100">{def.qty} EA</span>
                                                        </div>
                                                        {def.note && <p className="text-[10px] text-slate-500 truncate mt-0.5">{def.note}</p>}
                                                    </div>
                                                    <button onClick={() => removeDefect(idx)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-black text-sm rounded-xl">취소</button>
                    <button type="submit" form="qaForm" disabled={loading || !googleSheetLink} className="px-8 py-2.5 bg-slate-800 text-white font-black text-sm rounded-xl disabled:opacity-50">
                        {loading ? '처리중...' : '검사 완료 확정'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
