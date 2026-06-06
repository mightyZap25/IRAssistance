import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from '../firebase';
import { FileText, Plus, ShieldCheck, Activity, Search, AlertCircle, Trash2, Settings, PlusCircle, CheckCircle } from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';

export default function QAProcessPage() {
    const [activeTab, setActiveTab] = useState('middle'); // 'middle' | 'shipping' | 'as'
    const [loading, setLoading] = useState(false);

    // Master list data
    const [middleInspections, setMiddleInspections] = useState([]);
    const [shippingInspections, setShippingInspections] = useState([]);
    const [asRecords, setAsRecords] = useState([]);

    // Master Defect Codes loaded from DB
    const [defectCodes, setDefectCodes] = useState([]);

    // Form inputs state
    const [middleForm, setMiddleForm] = useState({ date: new Date().toISOString().split('T')[0], model: '', spec: '', qty: '', method: 'Full', testQty: '', passQty: '', failQty: '', defects: [] });
    const [shippingForm, setShippingForm] = useState({ buyer: '', partName: '', model: '', lotQty: '', method: 'Full', testQty: '', result: 'Pass', handling: 'None', defects: [] });
    const [asForm, setAsForm] = useState({ buyer: '', partName: '', model: '', spec: '', requestDetails: '', repairDetails: '', cost: '', receivedDate: new Date().toISOString().split('T')[0], completedDate: '', trackingNumber: '', defects: [], causes: [] });

    // Temp defect input state
    const [tempDefectType, setTempDefectType] = useState('');
    const [tempDefectQty, setTempDefectQty] = useState('');
    const [tempDefectNote, setTempDefectNote] = useState('');

    // Temp cause input state for AS
    const [tempCauseType, setTempCauseType] = useState('');
    const [tempCauseQty, setTempCauseQty] = useState('');
    const [tempCauseNote, setTempCauseNote] = useState('');

    useEffect(() => {
        fetchMasterData();
    }, [activeTab]);

    const fetchMasterData = async () => {
        setLoading(true);
        try {
            // Load defect codes
            const defectSnap = await getDocs(collection(db, 'qa_defect_codes'));
            const dCodes = [];
            defectSnap.forEach(d => dCodes.push(d.data()));
            setDefectCodes(dCodes);

            // Load inspections based on current tab
            if (activeTab === 'middle') {
                const snap = await getDocs(collection(db, 'qa_middle_inspections'));
                const list = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                setMiddleInspections(list);
            } else if (activeTab === 'shipping') {
                const snap = await getDocs(collection(db, 'qa_shipping_inspections'));
                const list = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                setShippingInspections(list);
            } else if (activeTab === 'as') {
                const snap = await getDocs(collection(db, 'qa_as_records'));
                const list = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                setAsRecords(list);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddMiddle = async (e) => {
        e.preventDefault();
        const tQty = parseInt(middleForm.testQty) || 0;
        const pQty = parseInt(middleForm.passQty) || 0;
        const fQty = parseInt(middleForm.failQty) || 0;

        if (pQty + fQty !== tQty) {
            return alert(`양품 수량(${pQty})과 불량 수량(${fQty})의 합은 검사 수량(${tQty})과 같아야 합니다.`);
        }

        try {
            await addDoc(collection(db, 'qa_middle_inspections'), {
                ...middleForm,
                qty: parseInt(middleForm.qty) || 0,
                testQty: tQty,
                passQty: pQty,
                failQty: fQty,
                failRate: tQty > 0 ? (fQty / tQty) * 100 : 0,
                createdAt: serverTimestamp()
            });
            alert('중간검사가 등록되었습니다.');
            setMiddleForm({ date: new Date().toISOString().split('T')[0], model: '', spec: '', qty: '', method: 'Full', testQty: '', passQty: '', failQty: '', defects: [] });
            fetchMasterData();
        } catch (err) {
            alert('등록 오류');
        }
    };

    const handleAddShipping = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'qa_shipping_inspections'), {
                ...shippingForm,
                lotQty: parseInt(shippingForm.lotQty) || 0,
                testQty: parseInt(shippingForm.testQty) || 0,
                createdAt: serverTimestamp()
            });
            alert('출하검사가 등록되었습니다.');
            setShippingForm({ buyer: '', partName: '', model: '', lotQty: '', method: 'Full', testQty: '', result: 'Pass', handling: 'None', defects: [] });
            fetchMasterData();
        } catch (err) {
            alert('등록 오류');
        }
    };

    const handleAddAs = async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'qa_as_records'), {
                ...asForm,
                cost: parseFloat(asForm.cost) || 0,
                createdAt: serverTimestamp()
            });
            alert('AS 접수 건이 등록되었습니다.');
            setAsForm({ buyer: '', partName: '', model: '', spec: '', requestDetails: '', repairDetails: '', cost: '', receivedDate: new Date().toISOString().split('T')[0], completedDate: '', trackingNumber: '', defects: [], causes: [] });
            fetchMasterData();
        } catch (err) {
            alert('등록 오류');
        }
    };

    // Filter defect codes by category helper
    const getDefectsByCategory = (cat) => {
        return defectCodes.filter(d => d.category === cat).map(d => d.name);
    };

    const addDefectItem = (type) => {
        if (!tempDefectType) return alert('유형을 선택하세요.');
        const qty = parseInt(tempDefectQty) || 0;
        if (qty <= 0) return alert('수량을 입력하세요.');

        const item = { type: tempDefectType, qty, note: tempDefectNote };
        if (type === 'middle') {
            setMiddleForm(f => ({ ...f, defects: [...f.defects, item] }));
        } else if (type === 'shipping') {
            setShippingForm(f => ({ ...f, defects: [...f.defects, item] }));
        } else if (type === 'as_defect') {
            setAsForm(f => ({ ...f, defects: [...f.defects, item] }));
        }

        setTempDefectType('');
        setTempDefectQty('');
        setTempDefectNote('');
    };

    const addCauseItem = () => {
        if (!tempCauseType) return alert('유형을 선택하세요.');
        const qty = parseInt(tempCauseQty) || 0;
        if (qty <= 0) return alert('수량을 입력하세요.');

        setAsForm(f => ({ ...f, causes: [...f.causes, { type: tempCauseType, qty, note: tempCauseNote }] }));
        setTempCauseType('');
        setTempCauseQty('');
        setTempCauseNote('');
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)]">
            <div className="mb-4">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Activity size={28} className="text-teal-600" /> 공정 및 품질 모니터링 (QA Processes)
                </h1>
                <p className="text-sm text-slate-500 font-bold mt-1 ml-9">
                    공정 중간 검사, 완제품 출하 검사 및 AS 접수/처리 내역을 종합 관리합니다.
                </p>
            </div>

            <div className="flex items-center gap-3 mb-4 shrink-0">
                <div className="flex bg-slate-200/50 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('middle')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'middle' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        중간 검사 관리
                    </button>
                    <button 
                        onClick={() => setActiveTab('shipping')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'shipping' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        출하 검사 관리
                    </button>
                    <button 
                        onClick={() => setActiveTab('as')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'as' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        AS 관리
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 flex flex-col md:flex-row gap-6">
                {/* 1. 중간 검사 탭 */}
                {activeTab === 'middle' && (
                    <>
                        <div className="w-full md:w-96 bg-slate-50 border border-slate-200 p-5 rounded-2xl shrink-0 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
                            <h3 className="font-black text-slate-700 text-sm border-b border-slate-200 pb-2">중간 검사 등록</h3>
                            <form onSubmit={handleAddMiddle} className="space-y-3 text-xs font-bold text-slate-600">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">검사 일자</label>
                                        <input type="date" value={middleForm.date} onChange={e => setMiddleForm(f => ({ ...f, date: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">품명(Model)</label>
                                        <input type="text" value={middleForm.model} onChange={e => setMiddleForm(f => ({ ...f, model: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" placeholder="Model 입력" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">규격(Spec)</label>
                                        <input type="text" value={middleForm.spec} onChange={e => setMiddleForm(f => ({ ...f, spec: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">생산 수량</label>
                                        <input type="number" value={middleForm.qty} onChange={e => setMiddleForm(f => ({ ...f, qty: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">검사 방법</label>
                                        <select value={middleForm.method} onChange={e => setMiddleForm(f => ({ ...f, method: e.target.value }))} className="w-full border p-2 rounded-lg bg-white">
                                            <option value="Full">전수 검사</option>
                                            <option value="Sample">Sample 검사</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">검사 수량</label>
                                        <input type="number" value={middleForm.testQty} onChange={e => setMiddleForm(f => ({ ...f, testQty: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">양품 수량</label>
                                        <input type="number" value={middleForm.passQty} onChange={e => setMiddleForm(f => ({ ...f, passQty: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">불량 수량</label>
                                        <input type="number" value={middleForm.failQty} onChange={e => setMiddleForm(f => ({ ...f, failQty: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>

                                {/* Defect code logic */}
                                {parseInt(middleForm.failQty) > 0 && (
                                    <div className="border border-rose-100 rounded-xl p-3 bg-white space-y-2 mt-2">
                                        <p className="text-[10px] text-rose-500 font-extrabold uppercase">불량 내역 상세 등록</p>
                                        <div className="flex gap-1.5">
                                            <select value={tempDefectType} onChange={e => setTempDefectType(e.target.value)} className="border p-1 text-xs rounded bg-slate-50 flex-1">
                                                <option value="">불량유형</option>
                                                {getDefectsByCategory('Middle').map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <input type="number" value={tempDefectQty} onChange={e => setTempDefectQty(e.target.value)} placeholder="수량" className="border p-1 text-xs rounded w-14 text-center bg-slate-50" />
                                            <button type="button" onClick={() => addDefectItem('middle')} className="bg-slate-800 text-white px-2.5 rounded text-xs">추가</button>
                                        </div>
                                        {middleForm.defects.map((def, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100 font-black">
                                                <span>{def.type} ({def.qty}개)</span>
                                                <button type="button" onClick={() => setMiddleForm(f => ({ ...f, defects: f.defects.filter((_, i) => i !== idx) }))} className="text-rose-500">×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button type="submit" className="w-full bg-slate-800 text-white py-2.5 rounded-xl font-black text-xs hover:bg-slate-900 transition-all shadow-sm mt-3">검사 등록</button>
                            </form>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid
                                data={middleInspections}
                                columnDefs={{
                                    date: { label: '검사일자', width: '110px' },
                                    model: { label: '품명(Model)', width: '130px' },
                                    qty: { label: '생산수량', width: '100px' },
                                    testQty: { label: '검사수량', width: '100px' },
                                    passQty: { label: '양품수량', width: '100px' },
                                    failQty: { label: '불량수량', width: '100px' },
                                    failRate: { label: '불량률 (%)', width: '100px' }
                                }}
                                rowKey="id"
                                cellRenderer={{
                                    failRate: (val) => <span className="text-rose-500 font-extrabold">{Number(val).toFixed(2)}%</span>,
                                    qty: (val) => Number(val).toLocaleString(),
                                    testQty: (val) => Number(val).toLocaleString()
                                }}
                            />
                        </div>
                    </>
                )}

                {/* 2. 출하 검사 탭 */}
                {activeTab === 'shipping' && (
                    <>
                        <div className="w-full md:w-96 bg-slate-50 border border-slate-200 p-5 rounded-2xl shrink-0 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
                            <h3 className="font-black text-slate-700 text-sm border-b border-slate-200 pb-2">출하 검사 등록</h3>
                            <form onSubmit={handleAddShipping} className="space-y-3 text-xs font-bold text-slate-600">
                                <div>
                                    <label className="block text-[10px] text-slate-400 mb-1">고객/바이어 명</label>
                                    <input type="text" value={shippingForm.buyer} onChange={e => setShippingForm(f => ({ ...f, buyer: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" placeholder="바이어 입력" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">품명</label>
                                        <input type="text" value={shippingForm.partName} onChange={e => setShippingForm(f => ({ ...f, partName: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">Model</label>
                                        <input type="text" value={shippingForm.model} onChange={e => setShippingForm(f => ({ ...f, model: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">Lot 수량</label>
                                        <input type="number" value={shippingForm.lotQty} onChange={e => setShippingForm(f => ({ ...f, lotQty: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">검사 방법</label>
                                        <select value={shippingForm.method} onChange={e => setShippingForm(f => ({ ...f, method: e.target.value }))} className="w-full border p-2 rounded-lg bg-white">
                                            <option value="Full">전수 검사</option>
                                            <option value="Sample">Sample 검사</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">검사 수량</label>
                                        <input type="number" value={shippingForm.testQty} onChange={e => setShippingForm(f => ({ ...f, testQty: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">검사 결과</label>
                                        <select value={shippingForm.result} onChange={e => setShippingForm(f => ({ ...f, result: e.target.value }))} className="w-full border p-2 rounded-lg bg-white">
                                            <option value="Pass">합격 (Pass)</option>
                                            <option value="Fail">불합격 (Fail)</option>
                                        </select>
                                    </div>
                                </div>

                                {shippingForm.result === 'Fail' && (
                                    <div className="space-y-2 border border-rose-100 bg-white p-3 rounded-xl mt-2">
                                        <div className="flex gap-1.5">
                                            <select value={tempDefectType} onChange={e => setTempDefectType(e.target.value)} className="border p-1 text-xs rounded bg-slate-50 flex-1">
                                                <option value="">불량유형</option>
                                                {getDefectsByCategory('Shipping').map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <input type="number" value={tempDefectQty} onChange={e => setTempDefectQty(e.target.value)} placeholder="수량" className="border p-1 text-xs rounded w-14 text-center bg-slate-50" />
                                            <button type="button" onClick={() => addDefectItem('shipping')} className="bg-slate-800 text-white px-2.5 rounded text-xs">추가</button>
                                        </div>
                                        {shippingForm.defects.map((def, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100 font-black">
                                                <span>{def.type} ({def.qty}개)</span>
                                                <button type="button" onClick={() => setShippingForm(f => ({ ...f, defects: f.defects.filter((_, i) => i !== idx) }))} className="text-rose-500">×</button>
                                            </div>
                                        ))}
                                        <div>
                                            <label className="block text-[9px] text-slate-400 mb-1 mt-1">부적합품 처리 방안</label>
                                            <input type="text" placeholder="예: 반품 처리 후 재조립" value={shippingForm.handling} onChange={e => setShippingForm(f => ({ ...f, handling: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                        </div>
                                    </div>
                                )}
                                <button type="submit" className="w-full bg-slate-800 text-white py-2.5 rounded-xl font-black text-xs hover:bg-slate-900 transition-all shadow-sm mt-3">출하 검사 등록</button>
                            </form>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid
                                data={shippingInspections}
                                columnDefs={{
                                    buyer: { label: '바이어/고객명', width: '130px' },
                                    partName: { label: '품목명', width: '150px' },
                                    model: { label: 'Model', width: '120px' },
                                    lotQty: { label: 'Lot 수량', width: '100px' },
                                    testQty: { label: '검사 수량', width: '100px' },
                                    result: { label: '검사 결과', width: '100px' }
                                }}
                                rowKey="id"
                                cellRenderer={{
                                    result: (val) => val === 'Pass' ? (
                                        <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-600 font-extrabold text-[10px]">합격</span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 font-extrabold text-[10px]">불합격</span>
                                    )
                                }}
                            />
                        </div>
                    </>
                )}

                {/* 3. AS 관리 탭 */}
                {activeTab === 'as' && (
                    <>
                        <div className="w-full md:w-[420px] bg-slate-50 border border-slate-200 p-5 rounded-2xl shrink-0 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
                            <h3 className="font-black text-slate-700 text-sm border-b border-slate-200 pb-2">AS 접수 및 수리 등록</h3>
                            <form onSubmit={handleAddAs} className="space-y-3 text-xs font-bold text-slate-600">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">고객명</label>
                                        <input type="text" value={asForm.buyer} onChange={e => setAsForm(f => ({ ...f, buyer: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">품명</label>
                                        <input type="text" value={asForm.partName} onChange={e => setAsForm(f => ({ ...f, partName: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">Model</label>
                                        <input type="text" value={asForm.model} onChange={e => setAsForm(f => ({ ...f, model: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">규격(Spec)</label>
                                        <input type="text" value={asForm.spec} onChange={e => setAsForm(f => ({ ...f, spec: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-slate-400 mb-1">의뢰 내용 (고객 클레임)</label>
                                    <textarea value={asForm.requestDetails} onChange={e => setAsForm(f => ({ ...f, requestDetails: e.target.value }))} className="w-full border p-2 rounded-lg bg-white min-h-[50px]" />
                                </div>

                                {/* Defects array section */}
                                <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                                    <p className="text-[10px] text-slate-500 font-extrabold uppercase">불량 내역 추가 (항목화)</p>
                                    <div className="flex gap-1.5">
                                        <select value={tempDefectType} onChange={e => setTempDefectType(e.target.value)} className="border p-1 text-xs rounded bg-slate-50 flex-1">
                                            <option value="">불량유형</option>
                                            {getDefectsByCategory('As').map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <input type="number" value={tempDefectQty} onChange={e => setTempDefectQty(e.target.value)} placeholder="수량" className="border p-1 text-xs rounded w-14 text-center bg-slate-50" />
                                        <button type="button" onClick={() => addDefectItem('as_defect')} className="bg-slate-800 text-white px-2.5 rounded text-xs">추가</button>
                                    </div>
                                    {asForm.defects.map((def, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100 font-black">
                                            <span>{def.type} ({def.qty}개)</span>
                                            <button type="button" onClick={() => setAsForm(f => ({ ...f, defects: f.defects.filter((_, i) => i !== idx) }))} className="text-rose-500">×</button>
                                        </div>
                                    ))}
                                </div>

                                {/* Cause array section */}
                                <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                                    <p className="text-[10px] text-indigo-600 font-extrabold uppercase">결함 원인 추가 (항목화)</p>
                                    <div className="flex gap-1.5">
                                        <select value={tempCauseType} onChange={e => setTempCauseType(e.target.value)} className="border p-1 text-xs rounded bg-slate-50 flex-1">
                                            <option value="">원인코드</option>
                                            {getDefectsByCategory('As').map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <input type="number" value={tempCauseQty} onChange={e => setTempCauseQty(e.target.value)} placeholder="수량" className="border p-1 text-xs rounded w-14 text-center bg-slate-50" />
                                        <button type="button" onClick={addCauseItem} className="bg-indigo-600 text-white px-2.5 rounded text-xs">추가</button>
                                    </div>
                                    {asForm.causes.map((def, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100 font-black">
                                            <span>{def.type} ({def.qty}개)</span>
                                            <button type="button" onClick={() => setAsForm(f => ({ ...f, causes: f.causes.filter((_, i) => i !== idx) }))} className="text-rose-500">×</button>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <label className="block text-[10px] text-slate-400 mb-1">수리 내용 또는 처리 결과</label>
                                    <textarea value={asForm.repairDetails} onChange={e => setAsForm(f => ({ ...f, repairDetails: e.target.value }))} className="w-full border p-2 rounded-lg bg-white min-h-[50px]" />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">수리 비용</label>
                                        <input type="number" value={asForm.cost} onChange={e => setAsForm(f => ({ ...f, cost: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" placeholder="₩" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">배송 송장 번호</label>
                                        <input type="text" value={asForm.trackingNumber} onChange={e => setAsForm(f => ({ ...f, trackingNumber: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" placeholder="송장 입력" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">접수일</label>
                                        <input type="date" value={asForm.receivedDate} onChange={e => setAsForm(f => ({ ...f, receivedDate: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-400 mb-1">완료일</label>
                                        <input type="date" value={asForm.completedDate} onChange={e => setAsForm(f => ({ ...f, completedDate: e.target.value }))} className="w-full border p-2 rounded-lg bg-white" />
                                    </div>
                                </div>

                                <button type="submit" className="w-full bg-slate-800 text-white py-2.5 rounded-xl font-black text-xs hover:bg-slate-900 transition-all shadow-sm mt-3">AS 접수/처리 등록</button>
                            </form>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid
                                data={asRecords}
                                columnDefs={{
                                    buyer: { label: '고객명', width: '120px' },
                                    partName: { label: '품명', width: '130px' },
                                    model: { label: 'Model', width: '110px' },
                                    receivedDate: { label: '접수일', width: '110px' },
                                    completedDate: { label: '완료일', width: '110px' },
                                    cost: { label: '수리비용', width: '115px' },
                                    trackingNumber: { label: '송장번호', width: '130px' }
                                }}
                                rowKey="id"
                                cellRenderer={{
                                    cost: (val) => val ? `₩${Number(val).toLocaleString()}` : '₩0'
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
