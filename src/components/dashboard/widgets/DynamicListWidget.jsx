import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs, query, where, limit } from '../../../firebase';
import { 
    Layers, Package, FileText, ShoppingCart, 
    Factory, AlertCircle, Loader2, ChevronRight,
    Search, ListFilter
} from 'lucide-react';

const COLLECTION_ICONS = {
    'parts': Package,
    'boms': Layers,
    'ecns': AlertCircle,
    'purchaseOrders': ShoppingCart,
    'productionRequests': Factory
};

const COLLECTION_LABELS = {
    'parts': '부품',
    'boms': 'BOM',
    'ecns': 'ECN',
    'purchaseOrders': '발주',
    'productionRequests': '생산의뢰'
};

export default function DynamicListWidget({ viewType = 'list', customSettings = {} }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { 
        collectionName = 'parts', 
        filters = [], 
        title = '사용자 정의 위젯',
        limitCount = 10
    } = customSettings;

    useEffect(() => {
        fetchData();
    }, [collectionName, JSON.stringify(filters), limitCount]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            let q = collection(db, collectionName);
            
            // Apply filters if any
            if (filters && filters.length > 0) {
                const queryConstraints = filters
                    .filter(f => f.field && f.value)
                    .map(f => where(f.field, f.operator || '==', f.value));
                
                if (queryConstraints.length > 0) {
                    q = query(q, ...queryConstraints, limit(limitCount || 20));
                } else {
                    q = query(q, limit(limitCount || 20));
                }
            } else {
                q = query(q, limit(limitCount || 20));
            }

            const snap = await getDocs(q);
            const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(results);
        } catch (err) {
            console.error("DynamicListWidget error:", err);
            setError("데이터를 불러오는 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const Icon = COLLECTION_ICONS[collectionName] || FileText;

    if (loading) return (
        <div className="h-full flex flex-col items-center justify-center animate-pulse text-slate-300">
            <Loader2 className="animate-spin mb-2" size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Loading Data</span>
        </div>
    );

    if (error) return (
        <div className="h-full flex flex-col items-center justify-center text-rose-400 p-4 text-center">
            <AlertCircle size={24} className="mb-2" />
            <p className="text-[10px] font-bold">{error}</p>
        </div>
    );

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{COLLECTION_LABELS[collectionName] || collectionName}</div>
                    <div className="text-4xl font-black text-indigo-600 tracking-tighter">{data.length} <span className="text-sm">건</span></div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 rounded-xl flex items-center justify-center gap-2">
                    <ListFilter size={12} className="text-indigo-500" />
                    <span className="text-[9px] font-bold text-indigo-700 truncate">
                        {filters.length > 0 ? `${filters[0].field}: ${filters[0].value}` : '전체 보기'}
                    </span>
                </div>
            </div>
        );
    }

    // --- 2. Table View ---
    if (viewType === 'table') {
        const displayFields = getDisplayFields(collectionName);
        return (
            <div className="h-full overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                            {displayFields.map(f => (
                                <th key={f.key} className="pb-2">{f.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {data.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                {displayFields.map(f => (
                                    <td key={f.key} className="py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px]">
                                        {renderFieldValue(item, f.key)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // --- Default List View ---
    if (data.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40 italic">
            <Search size={24} className="mb-1" />
            <p className="text-[9px] font-bold">No results found</p>
        </div>
    );

    return (
        <div className="space-y-1.5">
            {data.map(item => (
                <div key={item.id} className="flex items-center justify-between p-2.5 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all group">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 group-hover:text-indigo-600 transition-colors">
                            <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[8px] font-mono font-bold text-slate-400 leading-none">
                                {getMainID(item, collectionName)}
                            </div>
                            <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate mt-1">
                                {getMainName(item, collectionName)}
                            </h4>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${getStatusStyle(item, collectionName)}`}>
                            {item.Status || item.Lifecycle || item.status || 'Active'}
                        </span>
                        <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Helpers
function getMainID(item, collection) {
    switch(collection) {
        case 'parts': return item.PartID;
        case 'boms': return item.BOMID;
        case 'ecns': return item.ECNID;
        case 'purchaseOrders': return item.PONumber;
        case 'productionRequests': return item.RequestID;
        default: return item.id?.slice(0, 8);
    }
}

function getMainName(item, collection) {
    switch(collection) {
        case 'parts': return item.Name;
        case 'boms': return item.Description || item.Name;
        case 'ecns': return item.Title;
        case 'purchaseOrders': return item.VendorName || item.Vendor;
        case 'productionRequests': return item.ProductName;
        default: return item.name || 'Untitled';
    }
}

function getStatusStyle(item, collection) {
    const status = (item.Status || item.Lifecycle || item.status || '').toLowerCase();
    if (['active', 'approved', 'completed', 'released'].includes(status)) return 'bg-emerald-50 text-emerald-600';
    if (['pending', 'draft', 'in review'].includes(status)) return 'bg-amber-50 text-amber-600';
    if (['obsolete', 'cancelled', 'rejected'].includes(status)) return 'bg-rose-50 text-rose-600';
    return 'bg-slate-50 text-slate-600';
}

function getDisplayFields(collection) {
    switch(collection) {
        case 'parts': return [{key: 'PartID', label: '품번'}, {key: 'Name', label: '품명'}, {key: 'CurrentStock', label: '재고'}];
        case 'boms': return [{key: 'BOMID', label: 'ID'}, {key: 'Description', label: '설명'}, {key: 'Status', label: '상태'}];
        case 'ecns': return [{key: 'ECNID', label: 'ID'}, {key: 'Title', label: '제목'}, {key: 'Priority', label: '우선순위'}];
        case 'purchaseOrders': return [{key: 'PONumber', label: '발주번호'}, {key: 'VendorName', label: '공급사'}, {key: 'TotalAmount', label: '금액'}];
        case 'productionRequests': return [{key: 'RequestID', label: '요청ID'}, {key: 'ProductName', label: '제품명'}, {key: 'Quantity', label: '수량'}];
        default: return [{key: 'id', label: 'ID'}, {key: 'name', label: '이름'}];
    }
}

function renderFieldValue(item, key) {
    const val = item[key];
    if (typeof val === 'number') return val.toLocaleString();
    if (val && typeof val === 'object' && val.seconds) { // Firestore timestamp
        return new Date(val.seconds * 1000).toLocaleDateString();
    }
    return val || '-';
}
