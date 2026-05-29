import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, AlertTriangle, Camera, Package, Info, CheckCircle2, Cloud, ExternalLink } from 'lucide-react';
import { updateDoc, doc, collection, getDocs, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';

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
    
    // DB에서 마스터 불량 유형 로드
    const [dbDefectTypes, setDbDefectTypes] = useState([]);

    const [googleSheetLink, setGoogleSheetLink] = useState('');
    const [isSheetCreated, setIsSheetCreated] = useState(false);
    
    // 예시 템플릿 보기용 모달 플래그
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setPassedQty((item.Qty || 0).toString());
            setFailedQty('0');
            setDefects([]);
            setInspectionMethod('Full');
            setHandlingType('Return');
            setSpecialAcceptanceCondition('');
            setGoogleSheetLink('');
            setIsSheetCreated(false);
            setShowPreview(false);
            
            // 로드 qa_defect_codes
            getDocs(collection(db, 'qa_defect_codes')).then(snap => {
                const list = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.category === 'Receiving') {
                        list.push(data.name);
                    }
                });
                // 없으면 기본 리스트 바인딩
                setDbDefectTypes(list.length > 0 ? list : ['치수 불량', '외관 스크래치', '파손/크랙', '조립 불량', '도금/도장 불량', '이물질/오염', '포장 불량', '기타']);
            });
        }
    }, [isOpen, item]);

    if (!isOpen || !item) return null;

    const handlePassedQtyChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setPassedQty(val.toString());
        const remain = item.Qty - val;
        setFailedQty(Math.max(0, remain).toString());
    };

    const handleFailedQtyChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setFailedQty(val.toString());
        const remain = item.Qty - val;
        setPassedQty(Math.max(0, remain).toString());
    };

    const addDefect = () => {
        if (!currentDefectType) return alert('불량 종류를 선택해주세요.');
        const dq = parseInt(currentDefectQty) || 0;
        if (dq <= 0) return alert('불량 수량을 1개 이상 입력해주세요.');

        setDefects([...defects, { type: currentDefectType, qty: dq, note: currentDefectNote }]);
        setCurrentDefectType('');
        setCurrentDefectNote('');
        setCurrentDefectQty('');
    };

    const removeDefect = (index) => {
        setDefects(defects.filter((_, i) => i !== index));
    };

    // Google Sheets 성적서 임시 저장 및 링크 제공
    const handlePreCreateSheet = async () => {
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            return alert('구글 연동 계정이 로그인되어 있지 않습니다. 오피스의 [파일 연동] 페이지에서 연동해 주세요.');
        }

        setLoading(true);
        try {
            const createUrl = 'https://www.googleapis.com/drive/v3/files';
            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `수입검사성적서_${item.PartName}_${item.PONumber}`,
                    mimeType: 'application/vnd.google-apps.spreadsheet',
                    parents: ['1oXv2DwVuvLiVSvhbS02aVydwoClztkrd'] // 구글 드라이브 지정 폴더에 생성
                })
            });

            if (!createRes.ok) throw new Error('구글 시트 생성 실패');
            const fileData = await createRes.json();
            const spreadsheetId = fileData.id;
            const docUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

            // 임시 데이터 채워넣기 (Sheet1 범위로 고정 명시)
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:D20?valueInputOption=USER_ENTERED`;
            const defectsList = defects?.map(d => `${d.type} (${d.qty}개) - ${d.note || ''}`).join(', ') || '없음';
            const values = [
                ['수 입 검 사 성 적 서', '', '', ''],
                ['', '', '', ''],
                ['발주 번호', item.PONumber, '공급사', item.VendorName],
                ['품목 번호', item.PartID, '품목명', item.PartName],
                ['검사 일시', new Date().toLocaleString(), '검사자', 'QA Manager'],
                ['', '', '', ''],
                ['[1. 검사 수량 및 합격 정보]', '', '', ''],
                ['총 입고 수량', '검사 방법', '합격 수량', '불량 수량'],
                [`${item.Qty} EA`, inspectionMethod === 'Sample' ? 'Sample 검사' : '전수 검사', `${passedQty || 0} EA`, `${failedQty || 0} EA`],
                ['최종 판정', (parseInt(failedQty) || 0) > 0 ? '불합격 포함' : '합격 (PASS)', '', ''],
                ['', '', '', ''],
                ['[2. 부적합 내용 및 조치 내역]', '', '', ''],
                ['불량 내역', defectsList, '', ''],
                ['부적합 조치방안', (parseInt(failedQty) || 0) > 0 ? (handlingType === 'SpecialAcceptance' ? `특채 승인 (특채조건: ${specialAcceptanceCondition})` : '공급업체 반품 처리') : 'N/A', '', '']
            ];

            const writeRes = await fetch(updateUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    range: 'Sheet1!A1:D20',
                    majorDimension: 'ROWS',
                    values: values
                })
            });

            if (!writeRes.ok) {
                // 한글 브라우저 등에서 '시트1'로 생성되었을 경우 재시도
                const retryUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%EC%8B%9C%ED%8A%B81!A1:D20?valueInputOption=USER_ENTERED`;
                const writeResRetry = await fetch(retryUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        range: '시트1!A1:D20',
                        majorDimension: 'ROWS',
                        values: values
                    })
                });
                if (!writeResRetry.ok) {
                    const errDetail = await writeResRetry.text();
                    throw new Error(`시트 템플릿 데이터 기입 실패: ${errDetail}`);
                }
            }

            setGoogleSheetLink(docUrl);
            setIsSheetCreated(true);
            
            // 템플릿 생성 시 바로 팝업(Preview)을 띄워서 사용자에게 보여줌
            setShowPreview(true);
        } catch (err) {
            console.error(err);
            alert(`오류: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitWithSheet = async (e) => {
        e.preventDefault();
        const pQty = parseInt(passedQty) || 0;
        const fQty = parseInt(failedQty) || 0;
        const targetQty = item.Qty || 0;

        if (pQty + fQty !== targetQty) {
            return alert(`합격 수량(${pQty})과 불량 수량(${fQty})의 합이 총 입고 수량(${targetQty})과 일치해야 합니다.`);
        }

        if (fQty > 0) {
            if (defects.length === 0) {
                return alert('불량 수량이 1개 이상일 경우, 반드시 불량 사유를 1개 이상 등록해야 합니다.');
            }
            const totalDefectQty = defects.reduce((sum, d) => sum + (d.qty || 0), 0);
            if (totalDefectQty !== fQty) {
                return alert(`입력하신 총 불량 수량(${fQty})과 등록된 불량 상세 수량의 합(${totalDefectQty})이 일치하지 않습니다.`);
            }
            if (handlingType === 'SpecialAcceptance' && !specialAcceptanceCondition) {
                return alert('특채로 처리하는 경우 특채 조건을 반드시 입력해야 합니다.');
            }
        }

        if (!googleSheetLink) {
            return alert('수입검사성적서 작성이 완료되지 않았습니다. 먼저 성적서를 생성하고 작성해 주세요.');
        }

        if (!window.confirm('검사 결과 및 작성된 구글 시트 링크를 저장하고 검사를 완료하시겠습니까?')) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const receivingRef = doc(db, 'receiving', item.id);

            // 1. Update Receiving Document
            batch.update(receivingRef, {
                Status: 'INSPECTION_COMPLETE',
                PassedQty: pQty,
                FailedQty: fQty,
                Defects: defects,
                InspectionMethod: inspectionMethod,
                HandlingType: fQty > 0 ? handlingType : 'None',
                SpecialAcceptanceCondition: (fQty > 0 && handlingType === 'SpecialAcceptance') ? specialAcceptanceCondition : '',
                GoogleSheetLink: googleSheetLink,
                InspectedAt: serverTimestamp(),
                InspectedBy: userProfile?.uid || 'Unknown'
            });

            // 2. If FailedQty > 0, create a Return (NCR) document
            if (fQty > 0) {
                const returnRef = doc(collection(db, 'returns'));
                batch.set(returnRef, {
                    ReceivingID: item.id,
                    PO_ID: item.PO_ID,
                    PONumber: item.PONumber,
                    PartID: item.PartID,
                    PartName: item.PartName,
                    VendorName: item.VendorName,
                    Qty: fQty,
                    Defects: defects,
                    HandlingType: handlingType,
                    SpecialAcceptanceCondition: handlingType === 'SpecialAcceptance' ? specialAcceptanceCondition : '',
                    GoogleSheetLink: googleSheetLink,
                    Status: handlingType === 'SpecialAcceptance' ? 'SPECIAL_ACCEPTED' : 'WAITING_RETURN',
                    CreatedAt: serverTimestamp(),
                    CreatedBy: userProfile?.uid || 'Unknown'
                });
            }

            await batch.commit();
            alert('성적서 저장 및 검사 처리가 완료되었습니다.');
            onRefresh && await onRefresh();
            onClose();
        } catch (error) {
            console.error("QA Inspection Failed:", error);
            alert('검사 처리 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const content = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-slate-800 px-6 py-4 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <CheckCircle2 size={20} className="text-teal-400" />
                            QA 입고 검사 (Receiving Inspection)
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-700 rounded-xl text-slate-300 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        
                        {/* Left Column: Info & Summary */}
                        <div className="space-y-4">
                            {/* Item Info Summary */}
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center shrink-0">
                                    <Package size={20} className="text-indigo-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black text-indigo-500 mb-0.5">{item.PONumber}</p>
                                    <h3 className="text-sm font-black text-slate-800 leading-tight truncate">{item.PartName}</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5 font-bold">공급사: {item.VendorName}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">입고 수량</p>
                                    <p className="text-xl font-black text-slate-800">{item.Qty} <span className="text-xs">EA</span></p>
                                </div>
                            </div>

                            {/* Receiving Request Details */}
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-[10px] font-black text-slate-400 border-b border-slate-100 pb-1.5 mb-2.5 uppercase tracking-wider">입고 신청 상세 내역</h4>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 mb-0.5">Part ID</p>
                                        <p className="font-bold text-slate-700 truncate">{item.PartID || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 mb-0.5">입고 일시</p>
                                        <p className="font-bold text-slate-700 truncate">{item.ReceivedAt?.toDate ? item.ReceivedAt.toDate().toLocaleString() : '-'}</p>
                                    </div>
                                    <div className="col-span-2 mt-0.5">
                                        <p className="text-[9px] font-bold text-slate-400 mb-1">Invoice Memo</p>
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 min-h-[40px]">
                                            <p className="font-bold text-slate-650 text-[11px] leading-relaxed">{item.InvoiceMemo || '작성된 전달 사항 없음'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* 안내 문구 */}
                            <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex items-start gap-2.5">
                                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                <p className="text-[11px] text-blue-800 font-bold leading-normal">
                                    합격품은 <b>'적재 대기'</b> 상태가 되며, 불량품은 즉각 <b>'부적합품'</b> 목록으로 이관되어 반품/폐기 프로세스를 타게 됩니다.
                                </p>
                            </div>
                        </div>

                        {/* Right Column: QA Inputs Form */}
                        <div>
                            <form id="qaForm" onSubmit={handleSubmitWithSheet} className="space-y-4">
                                {/* Qty Input */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white p-3 rounded-xl border-2 border-teal-100 shadow-sm relative overflow-hidden">
                                        <label className="text-[10px] font-black text-teal-700 flex items-center gap-1 mb-1.5">
                                            <CheckCircle size={12} /> 합격 수량 (Passed)
                                        </label>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={item.Qty}
                                            value={passedQty} 
                                            onChange={handlePassedQtyChange} 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-lg font-black text-slate-800 text-center focus:outline-none focus:border-teal-400"
                                            required 
                                        />
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border-2 border-rose-100 shadow-sm relative overflow-hidden">
                                        <label className="text-[10px] font-black text-rose-700 flex items-center gap-1 mb-1.5">
                                            <XCircle size={12} /> 불량 수량 (Failed)
                                        </label>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={item.Qty}
                                            value={failedQty} 
                                            onChange={handleFailedQtyChange} 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-lg font-black text-rose-600 text-center focus:outline-none focus:border-rose-400"
                                            required 
                                        />
                                    </div>
                                </div>

                                {/* 신규 품질검사 상세 설정 항목 */}
                                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 mb-1 uppercase tracking-wider">검사 방법</label>
                                        <div className="flex gap-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setInspectionMethod('Full')} 
                                                className={clsx("flex-1 py-1.5 text-xs font-black rounded-lg border transition-all", inspectionMethod === 'Full' ? "bg-teal-50 border-teal-200 text-teal-600" : "bg-white border-slate-200 text-slate-500")}
                                            >
                                                전수
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => setInspectionMethod('Sample')} 
                                                className={clsx("flex-1 py-1.5 text-xs font-black rounded-lg border transition-all", inspectionMethod === 'Sample' ? "bg-teal-50 border-teal-200 text-teal-600" : "bg-white border-slate-200 text-slate-500")}
                                            >
                                                샘플
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {parseInt(failedQty) > 0 && (
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-400 mb-1 uppercase tracking-wider">불량품 처리 방식</label>
                                            <div className="flex gap-2">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setHandlingType('Return')} 
                                                    className={clsx("flex-1 py-1.5 text-xs font-black rounded-lg border transition-all", handlingType === 'Return' ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white border-slate-200 text-slate-500")}
                                                >
                                                    반품
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setHandlingType('SpecialAcceptance')} 
                                                    className={clsx("flex-1 py-1.5 text-xs font-black rounded-lg border transition-all", handlingType === 'SpecialAcceptance' ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-white border-slate-200 text-slate-500")}
                                                >
                                                    특채
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {parseInt(failedQty) > 0 && handlingType === 'SpecialAcceptance' && (
                                        <div className="col-span-2">
                                            <label className="block text-[9px] font-black text-slate-400 mb-1 uppercase tracking-wider">특채 조건 (필수)</label>
                                            <input 
                                                type="text" 
                                                value={specialAcceptanceCondition}
                                                onChange={e => setSpecialAcceptanceCondition(e.target.value)}
                                                placeholder="특채 조건/사유 입력"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none"
                                                required
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* 성적서 작성 및 Google Sheet 링크 연동 영역 */}
                                <div className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-sm space-y-2.5">
                                    <h3 className="text-[10px] font-black text-indigo-700 flex items-center gap-1 uppercase tracking-wider">
                                        📝 수입검사성적서 작성 프로세스
                                    </h3>
                                    <div className="flex gap-2 items-center">
                                        <button
                                            type="button"
                                            onClick={handlePreCreateSheet}
                                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-sm animate-pulse"
                                        >
                                            <Cloud size={12} /> 성적서 구글 시트 생성
                                        </button>
                                        {isSheetCreated && (
                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-2 rounded-lg border border-emerald-100">
                                                ✓ 시트 준비됨
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 mb-0.5">작성된 성적서 Google Sheet 링크</label>
                                        <input
                                            type="url"
                                            value={googleSheetLink}
                                            onChange={e => setGoogleSheetLink(e.target.value)}
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Defect Entry Section */}
                                {parseInt(failedQty) > 0 && (
                                    <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-sm space-y-2.5">
                                        <h3 className="text-xs font-black text-rose-800 flex items-center gap-1.5">
                                            <AlertTriangle size={14} /> 불량 사유 등록 (NCR 연계)
                                        </h3>
                                        
                                        <div className="flex gap-1.5 items-start">
                                            <div className="w-1/3">
                                                <select 
                                                    value={currentDefectType} 
                                                    onChange={e => setCurrentDefectType(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-700 focus:outline-none"
                                                >
                                                    <option value="">유형</option>
                                                    {dbDefectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div className="w-16">
                                                <input 
                                                    type="number" 
                                                    min="1"
                                                    value={currentDefectQty}
                                                    onChange={e => setCurrentDefectQty(e.target.value)}
                                                    placeholder="수량"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-700 focus:outline-none text-center"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <input 
                                                    type="text" 
                                                    value={currentDefectNote}
                                                    onChange={e => setCurrentDefectNote(e.target.value)}
                                                    placeholder="메모(선택)"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-700 focus:outline-none"
                                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDefect())}
                                                />
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={addDefect}
                                                className="p-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 whitespace-nowrap"
                                            >
                                                추가
                                            </button>
                                        </div>

                                        {defects.length > 0 ? (
                                            <div className="space-y-1.5">
                                                {defects.map((d, idx) => (
                                                    <div key={idx} className="flex justify-between items-center bg-rose-50 border border-rose-100 rounded-lg px-2 py-1 text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-1.5 py-0.5 bg-rose-200 text-rose-800 rounded text-[10px] font-black">{d.type}</span>
                                                            <span className="font-black text-rose-600">{d.qty}개</span>
                                                            <span className="text-slate-700 truncate max-w-[120px]">{d.note || '-'}</span>
                                                        </div>
                                                        <button type="button" onClick={() => removeDefect(idx)} className="text-rose-400 hover:text-rose-600">
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 bg-slate-50 rounded-lg border border-dashed border-slate-350">
                                                <p className="text-[10px] text-slate-400 font-bold">등록된 불량 사유가 없습니다. (1개 이상 필수)</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </form>
                        </div>

                    </div>
                </div>

                <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-black text-sm rounded-xl hover:bg-slate-200 transition-colors">
                        취소
                    </button>
                    <button type="submit" form="qaForm" disabled={loading || !googleSheetLink} className="px-8 py-2.5 bg-slate-800 text-white font-black text-sm rounded-xl hover:bg-slate-900 shadow-md flex items-center gap-2 disabled:opacity-50">
                        {loading ? '처리중...' : (
                            <>
                                <CheckCircle2 size={16} />
                                검사 완료 확정
                            </>
                        )}
                    </button>
                </div>

            </div>

            {/* ─── 시트 생성 직후 보여줄 지능형 예시 템플릿 팝업 ─── */}
            {showPreview && (
                <div className="fixed inset-0 bg-slate-950/70 z-[20000] flex items-center justify-center p-6 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 border border-slate-200 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                            <div>
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <CheckCircle2 size={18} className="text-emerald-500" />
                                    수입검사성적서 시트 생성 완료 (데이터 주입됨)
                                </h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">구글 시트에 작성되어 저장된 서식 내용의 요약 정보입니다.</p>
                            </div>
                            <button onClick={() => setShowPreview(false)} className="p-1.5 hover:bg-slate-150 rounded-xl text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* 시트 서식 미리보기 목업 */}
                        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-white p-6 shadow-inner font-mono text-xs text-slate-700 space-y-4">
                            <div className="text-center font-black text-lg text-slate-900 border-b border-slate-800 pb-2">
                                수 입 검 사 성 적 서
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-slate-150 pb-3">
                                <div><b>발주 번호:</b> {item.PONumber}</div>
                                <div><b>공급사:</b> {item.VendorName}</div>
                                <div><b>품목 번호:</b> {item.PartID}</div>
                                <div><b>품목명:</b> {item.PartName}</div>
                                <div><b>검사 일시:</b> {new Date().toLocaleString()}</div>
                                <div><b>검사자:</b> QA Manager</div>
                            </div>
                            <div>
                                <div className="font-bold text-slate-950 mb-2">[1. 검사 수량 및 합격 정보]</div>
                                <div className="grid grid-cols-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center font-bold">
                                    <div>총 입고수</div>
                                    <div>검사 방법</div>
                                    <div className="text-teal-600">합격수</div>
                                    <div className="text-rose-600">불량수</div>
                                    <div className="mt-1 font-black">{item.Qty}</div>
                                    <div className="mt-1">{inspectionMethod === 'Sample' ? '샘플' : '전수'}</div>
                                    <div className="mt-1 text-teal-600 font-black">{passedQty || 0}</div>
                                    <div className="mt-1 text-rose-600 font-black">{failedQty || 0}</div>
                                </div>
                                <div className="mt-2.5 text-right font-black">
                                    최종 판정: <span className={parseInt(failedQty) > 0 ? "text-rose-500" : "text-teal-500"}>
                                        {parseInt(failedQty) > 0 ? "불합격 포함" : "합격 (PASS)"}
                                    </span>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-dashed border-slate-200">
                                <div className="font-bold text-slate-950 mb-2">[2. 부적합 내용 및 조치 내역]</div>
                                <p className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                                    <b>불량 내역:</b> {defects.map(d => `${d.type} (${d.qty}개) - ${d.note || ''}`).join(', ') || '없음'}<br/>
                                    <b>부적합 조치방안:</b> {parseInt(failedQty) > 0 ? (handlingType === 'SpecialAcceptance' ? `특채 승인 (특채조건: ${specialAcceptanceCondition})` : '공급업체 반품 처리') : 'N/A'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => setShowPreview(false)}
                                className="px-5 py-2.5 bg-slate-100 text-slate-700 font-black text-xs rounded-xl hover:bg-slate-200 transition-all"
                            >
                                닫기
                            </button>
                            <button
                                onClick={() => {
                                    window.open(googleSheetLink, '_blank');
                                    setShowPreview(false);
                                }}
                                className="px-6 py-2.5 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 flex items-center gap-1.5 shadow-md shadow-indigo-100"
                            >
                                <ExternalLink size={14} />
                                구글 시트 바로 열기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
}
