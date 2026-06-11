import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, addDoc, query, orderBy, onSnapshot } from '../firebase';
import { Settings, ShieldCheck, Activity, Plus, Trash2, CheckCircle2, Settings2, Sliders } from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import QAStandardSetupModal from '../components/QAStandardSetupModal';

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

    // Modal states
    const [selectedPart, setSelectedPart] = useState(null);
    const [isQaModalOpen, setIsQaModalOpen] = useState(false);

    // Form states for defect code
    const [newDefect, setNewDefect] = useState({ code: '', name: '', category: 'Receiving' });

    useEffect(() => {
        fetchData();
        
        // Listen to qa_target_parts for real-time count
        const unsubscribe = onSnapshot(collection(db, 'qa_target_parts'), (snap) => {
            const list = [];
            snap.forEach(d => list.push(d.id));
            setQaParts(list);
        });

        return () => unsubscribe();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch parts
            const partsSnap = await getDocs(collection(db, 'parts'));
            const pList = [];
            partsSnap.forEach(d => pList.push({ id: d.id, ...d.data() }));
            setParts(pList);

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

    const handleOpenQaSetup = (part) => {
        setSelectedPart(part);
        setIsQaModalOpen(true);
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
        <div className="flex flex-col h-[calc(100vh-100px)] animate-in fade-in duration-500">
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                        <div className="p-2.5 bg-teal-600 rounded-2xl shadow-xl shadow-teal-100">
                            <Sliders size={28} className="text-white" />
                        </div>
                        품질 기준 및 마스터 설정
                    </h1>
                    <p className="text-sm text-slate-500 font-bold mt-2 ml-1">
                        수입검사 대상 품목의 세부 기준을 수립하고 불량 코드 체계를 관리합니다.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                    <button 
                        onClick={() => setActiveTab('parts')}
                        className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'parts' ? 'bg-white text-teal-600 shadow-md border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        <ShieldCheck size={16} />
                        수입검사 품목 설정
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'parts' ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                            {qaParts.length}
                        </span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('defects')}
                        className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'defects' ? 'bg-white text-teal-600 shadow-md border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                        <Activity size={16} />
                        불량 코드 마스터
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'defects' ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                            {defectCodes.length}
                        </span>
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-8 relative">
                {loading ? (
                    <div className="flex h-full items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-slate-400 font-black text-xs uppercase tracking-widest">Loading Quality Data...</p>
                        </div>
                    </div>
                ) : activeTab === 'parts' ? (
                    <div className="h-full flex flex-col animate-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-4 flex items-center gap-3">
                            <div className="p-2 bg-white rounded-xl shadow-sm">
                                <Plus size={16} className="text-teal-600" />
                            </div>
                            <p className="text-[11px] text-slate-500 font-bold">부품별 [검사 설정] 버튼을 클릭하여 세부 검사항목(치수, 외관 등)과 기준값을 정의할 수 있습니다.</p>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid
                                data={parts}
                                columnDefs={{
                                    PartID: { label: 'Part ID', width: '150px' },
                                    Name: { label: '부품명', width: '250px' },
                                    Spec: { label: '규격', width: '200px' },
                                    qaStatus: { label: '검사 설정 상태', width: '150px' },
                                    action: { label: '관리', width: '120px' }
                                }}
                                rowKey="id"
                                cellRenderer={{
                                    qaStatus: (val, row) => {
                                        const isQa = qaParts.includes(row.id);
                                        return (
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isQa ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`} />
                                                <span className={`text-[11px] font-black ${isQa ? 'text-teal-600' : 'text-slate-400'}`}>
                                                    {isQa ? '검사 대상' : '미설정'}
                                                </span>
                                            </div>
                                        );
                                    },
                                    action: (val, row) => (
                                        <button
                                            onClick={() => handleOpenQaSetup(row)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-600 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200 transition-all shadow-sm group"
                                        >
                                            <Settings2 size={13} className="group-hover:rotate-45 transition-transform duration-300" />
                                            검사 설정
                                        </button>
                                    )
                                }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col md:flex-row gap-8 animate-in slide-in-from-bottom-4 duration-500">
                        {/* Left: Form */}
                        <div className="w-full md:w-80 bg-slate-50 border border-slate-200 p-6 rounded-[2rem] shrink-0 flex flex-col gap-6 shadow-sm">
                            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 pb-3 border-b border-slate-200">
                                <Plus size={18} className="text-teal-600" /> 불량 코드 신규 등록
                            </h3>
                            <form onSubmit={handleAddDefect} className="space-y-5">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">불량 분류</label>
                                    <select
                                        value={newDefect.category}
                                        onChange={e => setNewDefect(d => ({ ...d, category: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none transition-all shadow-sm"
                                    >
                                        {DEFECT_CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">불량 코드</label>
                                    <input 
                                        type="text" 
                                        placeholder="예: DF_001" 
                                        value={newDefect.code}
                                        onChange={e => setNewDefect(d => ({ ...d, code: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none transition-all shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">불량명 (원인명)</label>
                                    <input 
                                        type="text" 
                                        placeholder="예: 외관 스크래치" 
                                        value={newDefect.name}
                                        onChange={e => setNewDefect(d => ({ ...d, name: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none transition-all shadow-sm"
                                    />
                                </div>
                                <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-2xl font-black text-xs hover:bg-black transition-all shadow-lg shadow-slate-200 active:scale-95">
                                    마스터에 등록
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
                                        return (
                                            <span className="inline-flex px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg font-black text-[10px] uppercase tracking-tighter">
                                                {label}
                                            </span>
                                        );
                                    },
                                    action: (val, row) => (
                                        <button
                                            onClick={() => handleDeleteDefect(row.code)}
                                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* QA Setup Modal */}
            {isQaModalOpen && (
                <QAStandardSetupModal 
                    part={selectedPart}
                    isOpen={isQaModalOpen}
                    onClose={() => setIsQaModalOpen(false)}
                    onSave={() => fetchData()}
                />
            )}
        </div>
    );
}
