import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, where, doc, updateDoc, serverTimestamp } from '../firebase';
import { db } from '../firebase';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { ShieldCheck, ClipboardCheck, AlertCircle, CheckCircle2, XCircle, Search, Filter, History, Package, Factory, Truck } from 'lucide-react';
import { qualityService } from '../services/qualityService';

const INSPECTION_TYPES = {
    INCOMING: { label: '수입검사', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50' },
    PROCESS:  { label: '공정검사', icon: Settings, color: 'text-amber-600', bg: 'bg-amber-50' },
    FINAL:    { label: '최종검사', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' }
};

const INSPECTION_STATUS = {
    WAITING: { label: '검사대기', color: 'bg-slate-100 text-slate-500' },
    IN_PROGRESS: { label: '검사중', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    PASS: { label: '합격(PASS)', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    FAIL: { label: '불합격(FAIL)', color: 'bg-rose-50 text-rose-600 border-rose-200' }
};

export default function QualityProcessPage() {
    const [inspections, setInspections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('ALL'); // ALL, INCOMING, PRODUCTION

    useEffect(() => { fetchInspections(); }, []);

    const fetchInspections = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'quality_inspections'), orderBy('RequestedAt', 'desc')));
            setInspections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const filteredData = useMemo(() => {
        return inspections.filter(item => {
            const matchesSearch = item.PartName?.toLowerCase().includes(searchTerm.toLowerCase()) || item.ID?.toLowerCase().includes(searchTerm.toLowerCase());
            if (activeTab === 'ALL') return matchesSearch;
            if (activeTab === 'INCOMING') return item.Type === 'INCOMING' && matchesSearch;
            if (activeTab === 'PRODUCTION') return (item.Type === 'PROCESS' || item.Type === 'FINAL') && matchesSearch;
            return matchesSearch;
        });
    }, [inspections, searchTerm, activeTab]);

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-emerald-500/5 to-transparent p-3 rounded-2xl border border-indigo-100/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 text-left">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><ShieldCheck size={24} /></div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">품질 공정 통합 관리 (QA)</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">Standard Inspection & Quality Control</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/50 p-1 rounded-2xl border border-slate-200/50 self-start ml-1">
                {[
                    { id: 'ALL', label: '전체 검사' },
                    { id: 'INCOMING', label: '수입검사 (Purchasing)' },
                    { id: 'PRODUCTION', label: '공정/최종검사 (Production)' }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* List Grid */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden text-left">
                <MasterDataGrid
                    data={filteredData}
                    rowKey="id"
                    enableSearch={true}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="검사 ID, 품목명 검색..."
                    columnDefs={{
                        ID: { label: '검사 ID', default: true },
                        Type: { label: '유형', default: true },
                        PartName: { label: '품목명', default: true },
                        Qty: { label: '요청수량', default: true },
                        RequestedAt: { label: '요청일시', default: true },
                        Status: { label: '진행 상태', default: true }
                    }}
                    cellRenderer={{
                        ID: (val) => <span className="font-mono font-black text-slate-400 text-[10px]">{val}</span>,
                        Type: (val) => {
                            const info = INSPECTION_TYPES[val] || { label: val, color: 'text-slate-400' };
                            return <span className={`text-[10px] font-black ${info.color} flex items-center gap-1.5`}>{info.label}</span>;
                        },
                        PartName: (val, row) => (
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-800">{val}</span>
                                <span className="text-[9px] font-mono text-slate-400">REF: {row.RefID || '-'}</span>
                            </div>
                        ),
                        Status: (val) => {
                            const info = INSPECTION_STATUS[val] || { label: val, color: 'bg-slate-50' };
                            return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${info.color}`}>{info.label}</span>;
                        },
                        RequestedAt: (val) => <span className="text-xs text-slate-400">{val?.toDate ? val.toDate().toLocaleString() : '-'}</span>
                    }}
                />
            </div>
        </div>
    );
}

// Settings Icon Helper
const Settings = (props) => <Factory {...props}/>;
