import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, where, onSnapshot } from '../firebase';
import { db } from '../firebase';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { Package, ShieldAlert, AlertTriangle, CheckCircle2, Search, Info, Settings, ArrowUpDown, MapPin, ClipboardList, TrendingUp, Clock, TrendingDown } from 'lucide-react';
import RiskInventorySettingModal from '../components/RiskInventorySettingModal';
import InventoryDetail from '../components/InventoryDetail';
import { productionService } from '../services/productionService';

export default function InventoryPage() {
    const [inventory, setInventory] = useState([]);
    const [parts, setParts] = useState([]);
    const [prs, setPrs] = useState([]);
    const [boms, setBoms] = useState([]);
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modals
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        setLoading(true);
        
        // 실시간 데이터 리스너 설정
        const unsubInv = onSnapshot(collection(db, 'inventory'), snap => {
            setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubParts = onSnapshot(query(collection(db, 'parts'), orderBy('PartID', 'asc')), snap => {
            setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubPRs = onSnapshot(query(collection(db, 'production_requests'), where('Status', 'in', ['WAITING_FOR_PARTS', 'PROD_WAITING', 'IN_PRODUCTION'])), snap => {
            setPrs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubBOM = onSnapshot(collection(db, 'bom'), snap => {
            setBoms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubSettings = onSnapshot(collection(db, 'inventory_settings'), snap => {
            setSettings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => {
            unsubInv(); unsubParts(); unsubPRs(); unsubBOM(); unsubSettings();
        };
    }, []);

    // 1. BOM 구조 맵 생성 (계산형)
    const bomMap = useMemo(() => {
        const bm = {};
        boms.forEach(b => {
            if (!bm[b.ParentID]) bm[b.ParentID] = [];
            bm[b.ParentID].push(b);
        });
        return bm;
    }, [boms]);

    // 2. 예약 재고 실시간 계산 (계산형)
    // 상위 어셈블리 재고가 있을 경우 하위 부품 예약을 자동으로 차감하는 로직 포함
    const reservedMap = useMemo(() => {
        const invMap = {};
        inventory.forEach(i => { invMap[i.PartID] = Number(i.OnHand || 0); });
        return productionService.calculateReservedMap(prs, bomMap, invMap);
    }, [prs, bomMap, inventory]);

    // 3. 안전 재고 계산 (계산형)
    const safetyMap = useMemo(() => {
        const fgSettings = settings.filter(s => s.Type === 'FG');
        const partSettings = {};
        settings.filter(s => s.Type === 'PART').forEach(s => { partSettings[s.PartID] = s.Threshold; });

        const dynamicSafetyMap = { ...partSettings };
        const calculateRecursive = (id, targetQty) => {
            const children = bomMap[id] || [];
            children.forEach(child => {
                const childID = child.ChildID;
                const needed = (child.Quantity || 1) * targetQty;
                dynamicSafetyMap[childID] = Math.max(dynamicSafetyMap[childID] || 0, needed);
                calculateRecursive(childID, needed);
            });
        };

        fgSettings.forEach(fg => calculateRecursive(fg.PartID, fg.Threshold));
        return dynamicSafetyMap;
    }, [settings, bomMap]);

    // 4. 최종 디스플레이 데이터 산출 (실시간 연산)
    const displayData = useMemo(() => {
        return parts.map(part => {
            const pid = (part.PartID || '').trim().toUpperCase();
            const invRecord = inventory.find(i => (i.PartID || '').trim().toUpperCase() === pid);
            const onHand = Number(invRecord?.OnHand || 0);
            const reserved = Number(reservedMap[pid] || 0);
            const available = Math.max(0, onHand - reserved);
            const safety = Number(safetyMap[pid] || part.SafetyStock || 0);
            const isRisk = available < safety;

            return {
                ...part,
                OnHand: onHand,
                Reserved: reserved,
                Available: available,
                Safety: safety,
                IsRisk: isRisk,
                Location: invRecord?.Location || '기본 창고'
            };
        });
    }, [parts, inventory, reservedMap, safetyMap]);

    const filteredData = useMemo(() => {
        return displayData.filter(item => 
            item.PartID.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.Name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [displayData, searchTerm]);

    const fetchInitialData = () => { /* onSnapshot에 의해 자동 업데이트됨 */ };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-3 rounded-2xl border border-emerald-100/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 text-left">
                    <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-xl shadow-emerald-100"><Package size={24} /></div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">전사 재고 현황 (Inventory)</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">Dynamic Safety Stock & Reservation Tracking</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 text-rose-600 border-2 border-rose-100 font-extrabold py-3 px-6 rounded-2xl shadow-sm transition-all hover:scale-105"
                    >
                        <ShieldAlert size={18} /><span>위험재고 기준 설정</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
                {[
                    { label: '전체 품목', value: parts.length, color: 'text-slate-600', icon: ClipboardList },
                    { label: '위험 재고 (미달)', value: displayData.filter(d => d.IsRisk).length, color: 'text-rose-600', icon: AlertTriangle },
                    { label: '예약된 자재', value: Object.keys(reservedMap).length, color: 'text-indigo-600', icon: Clock },
                    { label: '입고 대기', value: '-', color: 'text-emerald-600', icon: TrendingDown }
                ].map((s, idx) => (
                    <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all">
                        <div className="text-left">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                            <p className={`text-2xl font-black ${s.color} mt-1`}>{s.value}</p>
                        </div>
                        <div className={`p-2.5 rounded-xl bg-slate-50 group-hover:bg-white transition-colors ${s.color}`}><s.icon size={20}/></div>
                    </div>
                ))}
            </div>

            {/* Main Grid */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden text-left relative">
                <MasterDataGrid
                    data={filteredData}
                    rowKey="PartID"
                    onRowClick={(row) => setSelectedItem(row)}
                    enableSearch={true}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Part ID 또는 품목명으로 검색..."
                    columnDefs={{
                        PartID: { label: 'Part ID', default: true },
                        Name: { label: '품목명', default: true },
                        OnHand: { label: '현재고', default: true },
                        Reserved: { label: '예약재고', default: true },
                        Available: { label: '가용재고', default: true },
                        Safety: { label: '안전재고', default: true },
                        Location: { label: '창고 위치', default: true }
                    }}
                    cellRenderer={{
                        PartID: (val, row) => (
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-500 uppercase tracking-tighter">{val}</span>
                                {row.IsRisk && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="재고 부족"/>}
                            </div>
                        ),
                        Name: (val) => <span className="font-bold text-slate-800">{val}</span>,
                        OnHand: (val) => <span className="font-black text-slate-400">{val?.toLocaleString()}</span>,
                        Reserved: (val) => <span className="font-black text-amber-500">{val > 0 ? `-${val.toLocaleString()}` : '0'}</span>,
                        Available: (val, row) => (
                            <span className={`font-black text-lg ${row.IsRisk ? 'text-rose-600 underline decoration-rose-200 underline-offset-4' : 'text-emerald-600'}`}>
                                {val.toLocaleString()}
                            </span>
                        ),
                        Safety: (val) => <span className="font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{val.toLocaleString()}</span>,
                        Location: (val) => <div className="flex items-center gap-1.5 text-slate-400 font-bold"><MapPin size={12}/> {val}</div>
                    }}
                />
                {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/></div>}
            </div>

            <RiskInventorySettingModal 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)} 
                onRefresh={fetchInitialData} 
            />

            {selectedItem && (
                <InventoryDetail 
                    item={selectedItem} 
                    isOpen={!!selectedItem} 
                    onClose={() => setSelectedItem(null)} 
                    onRefresh={fetchInitialData}
                />
            )}
        </div>
    );
}
