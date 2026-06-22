import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, where, onSnapshot, doc, addDoc, serverTimestamp } from '../firebase';
import { 
    Microscope, Zap, FileText, Plus, Search, Filter, 
    CheckCircle2, Clock, AlertTriangle, ArrowRight,
    TrendingUp, LayoutGrid, List, Layers, ExternalLink
} from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import DevTestRecordModal from '../components/DevTestRecordModal';

export default function DevelopmentTestingPage() {
    const [activeTab, setActiveTab] = useState('QUEUE'); // QUEUE | HISTORY
    const [loading, setLoading] = useState(false);
    
    // Modal states
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Data states
    const [testQueue, setTestQueue] = useState([]);
    const [testHistory, setTestHistory] = useState([]);
    const [stats, setStats] = useState({ total: 0, passed: 0, rate: 0 });

    useEffect(() => {
        fetchQueue();
        const unsubscribe = fetchHistory();
        return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
    }, []);

    const fetchQueue = async () => {
        setLoading(true);
        try {
            // 1. Projects in 'qa_test' stage
            const projSnap = await getDocs(query(collection(db, 'projects'), where('currentStage', '==', 'qa_test')));
            const projList = projSnap.docs.map(d => ({
                id: d.id,
                refType: 'Project',
                refId: d.data().code || d.id,
                title: d.data().name,
                partId: d.data().PartID || '-',
                createdAt: d.data().createdAt,
                status: 'Test Ready'
            }));

            // 2. Approved ECNs that might need testing
            const ecnSnap = await getDocs(query(collection(db, 'ecns'), where('Status', '==', 'Approved')));
            const ecnList = ecnSnap.docs.slice(0, 10).map(d => ({
                id: d.id,
                refType: 'ECN',
                refId: d.data().PartID, // Or ECN number if available
                title: d.data().Title || `Design Change: ${d.data().PartID}`,
                partId: d.data().PartID,
                createdAt: d.data().CreatedAt,
                status: 'Change Validation'
            }));

            setTestQueue([...projList, ...ecnList]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = () => {
        const q = query(collection(db, 'dev_test_records'), orderBy('completedAt', 'desc'));
        return onSnapshot(q, (snap) => {
            const list = [];
            let pCount = 0;
            snap.forEach(d => {
                const data = { id: d.id, ...d.data() };
                list.push(data);
                if (data.result === 'Pass') pCount++;
            });
            setTestHistory(list);
            setStats({
                total: list.length,
                passed: pCount,
                rate: list.length > 0 ? (pCount / list.length) * 100 : 0
            });
        });
    };

    const handleOpenModal = (item) => {
        setSelectedItem(item);
        setIsModalOpen(true);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                        <div className="p-2.5 bg-purple-600 rounded-2xl shadow-xl shadow-purple-100">
                            <Microscope size={28} className="text-white" />
                        </div>
                        개발 성능 및 품질테스트
                    </h1>
                    <p className="text-sm text-slate-500 font-bold mt-2 ml-1">
                        개발 단계 프로젝트 및 설계 변경(ECN) 품목의 성능·기능 검증 데이터를 관리합니다.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-md shadow-indigo-100 transition-all transform hover:scale-[1.02]">
                        <Plus size={18} /> 테스트 요청
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <StatCard label="최근 30일 테스트 건수" value={stats.total} unit="건" icon={Zap} color="text-purple-600" bgColor="bg-purple-50" />
                <StatCard label="테스트 합격률" value={`${stats.rate.toFixed(1)}%`} unit="" icon={CheckCircle2} color="text-emerald-600" bgColor="bg-emerald-50" />
                <StatCard label="검증 대기 품목" value={testQueue.length} unit="건" icon={Clock} color="text-amber-600" bgColor="bg-amber-50" />
            </div>

            {/* Tabs & Content */}
            <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-8 flex flex-col relative">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                        <button 
                            onClick={() => setActiveTab('QUEUE')}
                            className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'QUEUE' ? 'bg-white text-purple-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            테스트 대기열 (Queue)
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 text-[10px]">{testQueue.length}</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('HISTORY')}
                            className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white text-purple-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            테스트 수행 이력 (History)
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="프로젝트, 품번 검색..." 
                                className="bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all w-64"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeTab === 'QUEUE' ? (
                        <MasterDataGrid
                            data={testQueue}
                            columnDefs={{
                                refType: { label: '구분', width: '100px' },
                                refId: { label: '참조 ID', width: '150px' },
                                title: { label: '프로젝트/변경명', width: '300px' },
                                partId: { label: '품목 번호', width: '150px' },
                                status: { label: '상태', width: '120px' },
                                action: { label: '실행', width: '120px' }
                            }}
                            rowKey="id"
                            cellRenderer={{
                                refType: (val) => (
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${val === 'Project' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                                        {val}
                                    </span>
                                ),
                                action: (val, row) => (
                                    <button 
                                        onClick={() => handleOpenModal(row)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-xl text-[11px] font-black hover:bg-purple-700 transition-all shadow-md shadow-purple-50"
                                    >
                                        <Microscope size={12} /> 테스트 기록
                                    </button>
                                )
                            }}
                        />
                    ) : (
                        <MasterDataGrid
                            data={testHistory}
                            columnDefs={{
                                completedAt: { label: '완료일', width: '120px' },
                                partId: { label: '품번', width: '130px' },
                                partName: { label: '품명', width: '200px' },
                                tester: { label: '테스터', width: '100px' },
                                result: { label: '판정', width: '100px' },
                                sheetLink: { label: '성적서', width: '80px' }
                            }}
                            rowKey="id"
                            cellRenderer={{
                                completedAt: (val) => val?.seconds ? new Date(val.seconds * 1000).toLocaleDateString() : val || '-',
                                result: (val) => (
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${val === 'Pass' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                        {val}
                                    </span>
                                ),
                                sheetLink: (val) => val ? (
                                    <a href={val} target="_blank" rel="noreferrer" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg inline-block transition-all">
                                        <ExternalLink size={16} />
                                    </a>
                                ) : '-'
                            }}
                        />
                    )}
                </div>

                {loading && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
            </div>

            {/* Test Record Modal */}
            {isModalOpen && selectedItem && (
                <DevTestRecordModal
                    item={selectedItem}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={() => fetchQueue()}
                />
            )}
        </div>
    );
}

function StatCard({ label, value, unit, icon: Icon, color, bgColor }) {
    return (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-5 relative overflow-hidden group hover:border-purple-200 transition-all">
            <div className={`p-4 rounded-2xl ${bgColor} ${color} transition-transform group-hover:scale-110 duration-300`}>
                <Icon size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                <h3 className="text-2xl font-black text-slate-800">{value} <span className="text-xs text-slate-400 font-bold">{unit}</span></h3>
            </div>
            <div className={`absolute -right-4 -bottom-4 opacity-5 ${color}`}>
                <Icon size={80} />
            </div>
        </div>
    );
}
