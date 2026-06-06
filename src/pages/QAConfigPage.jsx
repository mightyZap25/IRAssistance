import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, addDoc, query, orderBy } from '../firebase';
import { Settings, ShieldCheck, Activity, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';

const DEFECT_CATEGORIES = [
    { key: 'Receiving', label: '수입검사' },
    { key: 'Middle', label: '중간검사' },
    { key: 'Shipping', label: '출하검사' },
    { key: 'As', label: 'AS' }
];

export default function QAConfigPage() {
    const [activeTab, setActiveTab] = useState('parts'); // 'parts' | 'defects'
    const [parts, setParts] = useState([]);
    const [qaParts, setQaParts] = useState([]);
    const [defectCodes, setDefectCodes] = useState([]);
    const [loading, setLoading] = useState(false);

    // Form states for defect code
    const [newDefect, setNewDefect] = useState({ code: '', name: '', category: 'Receiving' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch parts
            const partsSnap = await getDocs(collection(db, 'parts'));
            const pList = [];
            partsSnap.forEach(d => pList.push({ id: d.id, ...d.data() }));
            setParts(pList);

            // Fetch QA target parts
            const qaSnap = await getDocs(collection(db, 'qa_target_parts'));
            const qList = [];
            qaSnap.forEach(d => qList.push(d.id));
            setQaParts(qList);

            // Fetch Defect Codes
            const defectSnap = await getDocs(collection(db, 'qa_defect_codes'));
            const dList = [];
            defectSnap.forEach(d => dList.push({ id: d.id, ...d.data() }));
            setDefectCodes(dList);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleQaTarget = async (part) => {
        const isTarget = qaParts.includes(part.id);
        try {
            if (isTarget) {
                await deleteDoc(doc(db, 'qa_target_parts', part.id));
                setQaParts(prev => prev.filter(id => id !== part.id));
            } else {
                await setDoc(doc(db, 'qa_target_parts', part.id), {
                    partId: part.PartID || part.id,
                    partName: part.Name,
                    spec: part.Spec || '',
                    registeredAt: new Date()
                });
                setQaParts(prev => [...prev, part.id]);
            }
        } catch (err) {
            alert('상태 변경 실패');
        }
    };

    const handleAddDefect = async (e) => {
        e.preventDefault();
        if (!newDefect.code || !newDefect.name) return alert('코드와 불량명을 입력해주세요.');
        try {
            await setDoc(doc(db, 'qa_defect_codes', newDefect.code), {
                code: newDefect.code,
                name: newDefect.name,
                category: newDefect.category
            });
            setNewDefect({ code: '', name: '', category: 'Receiving' });
            fetchData();
            alert('불량코드가 등록되었습니다.');
        } catch (err) {
            alert('등록 실패');
        }
    };

    const handleDeleteDefect = async (code) => {
        if (!window.confirm('이 불량코드를 삭제하시겠습니까?')) return;
        try {
            await deleteDoc(doc(db, 'qa_defect_codes', code));
            fetchData();
        } catch (err) {
            alert('삭제 실패');
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)]">
            <div className="mb-4">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Settings size={28} className="text-teal-600" /> 품질 기준 관리 (QA Configuration)
                </h1>
                <p className="text-sm text-slate-500 font-bold mt-1 ml-9">
                    수입검사 대상 품목을 등록하고 검사별 불량 코드 명칭을 설정합니다.
                </p>
            </div>

            <div className="flex items-center gap-3 mb-4 shrink-0">
                <div className="flex bg-slate-200/50 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('parts')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'parts' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        수입검사 대상 품목 설정 ({qaParts.length}개)
                    </button>
                    <button 
                        onClick={() => setActiveTab('defects')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'defects' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        불량 명칭/코드 마스터 ({defectCodes.length}개)
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 relative">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-slate-400 font-bold">로딩 중...</div>
                ) : activeTab === 'parts' ? (
                    <div className="h-full flex flex-col">
                        <p className="text-xs text-slate-400 font-bold mb-3">※ 스위치를 클릭하여 부품을 수입검사 대상으로 지정하거나 해제할 수 있습니다. 수입검사 품목만 입고 시 품질 검사 화면에 나타납니다.</p>
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid
                                data={parts}
                                columnDefs={{
                                    PartID: { label: 'Part ID', width: '150px' },
                                    Name: { label: '부품명', width: '250px' },
                                    Spec: { label: '규격', width: '200px' },
                                    qaStatus: { label: '검사 대상 여부', width: '150px' }
                                }}
                                rowKey="id"
                                cellRenderer={{
                                    qaStatus: (val, row) => {
                                        const isQa = qaParts.includes(row.id);
                                        return (
                                            <button
                                                onClick={() => toggleQaTarget(row)}
                                                className={`px-3 py-1 rounded-xl text-xs font-black transition-all border ${isQa ? 'bg-teal-50 border-teal-200 text-teal-600' : 'bg-slate-50 border-slate-200 text-slate-450'}`}
                                            >
                                                {isQa ? '✓ 검사 대상' : '미대상'}
                                            </button>
                                        );
                                    }
                                }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col md:flex-row gap-6">
                        {/* Left: Form */}
                        <div className="w-full md:w-80 bg-slate-50 border border-slate-200 p-5 rounded-2xl shrink-0 flex flex-col gap-4">
                            <h3 className="font-black text-slate-700 text-sm flex items-center gap-1.5 border-b border-slate-200 pb-2">
                                <Plus size={16} /> 불량 코드 신규 등록
                            </h3>
                            <form onSubmit={handleAddDefect} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase">불량 분류</label>
                                    <select
                                        value={newDefect.category}
                                        onChange={e => setNewDefect(d => ({ ...d, category: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-bold text-slate-700 focus:outline-none"
                                    >
                                        {DEFECT_CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase">불량 코드</label>
                                    <input 
                                        type="text" 
                                        placeholder="예: DF_001" 
                                        value={newDefect.code}
                                        onChange={e => setNewDefect(d => ({ ...d, code: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-bold text-slate-700 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase">불량명 (원인명)</label>
                                    <input 
                                        type="text" 
                                        placeholder="예: 외관 스크래치" 
                                        value={newDefect.name}
                                        onChange={e => setNewDefect(d => ({ ...d, name: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-bold text-slate-700 focus:outline-none"
                                    />
                                </div>
                                <button type="submit" className="w-full bg-slate-800 text-white py-2.5 rounded-xl font-black text-xs hover:bg-slate-900 transition-all shadow-sm mt-2">
                                    등록하기
                                </button>
                            </form>
                        </div>

                        {/* Right: Master Grid */}
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid
                                data={defectCodes}
                                columnDefs={{
                                    category: { label: '구분', width: '120px' },
                                    code: { label: '코드', width: '120px' },
                                    name: { label: '불량명(원인명)', width: '250px' },
                                    action: { label: '관리', width: '100px' }
                                }}
                                rowKey="id"
                                cellRenderer={{
                                    category: (val) => {
                                        const label = DEFECT_CATEGORIES.find(c => c.key === val)?.label || val;
                                        return <span className="font-black text-slate-700 text-xs">{label}</span>;
                                    },
                                    action: (val, row) => (
                                        <button
                                            onClick={() => handleDeleteDefect(row.code)}
                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
