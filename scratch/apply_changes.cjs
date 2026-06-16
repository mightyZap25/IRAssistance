const fs = require('fs');
const path = require('path');

const invPagePath = path.join(__dirname, '..', 'src', 'pages', 'InventoryPage.jsx');
let invContent = fs.readFileSync(invPagePath, 'utf8').replace(/\r\n/g, '\n');

// Helper to escape special regex chars (though we are using exact string matches)
function normalize(str) {
    return str.replace(/\r\n/g, '\n');
}

// 1. Add pos state and change activeTab to activeFilter
const targetStates = '    const [isSettingsOpen, setIsSettingsOpen] = useState(false);\n    const [selectedItem, setSelectedItem] = useState(null);';

const replacementStates = '    const [isSettingsOpen, setIsSettingsOpen] = useState(false);\n    const [selectedItem, setSelectedItem] = useState(null);\n    const [activeFilter, setActiveFilter] = useState(\'ALL\'); // \'ALL\', \'RISK\', \'RESERVED\', \'INCOMING\'\n    const [pos, setPOs] = useState([]);';

if (invContent.includes(targetStates)) {
    invContent = invContent.replace(targetStates, replacementStates);
    console.log('Successfully updated states!');
} else {
    console.error('Could not find targetStates in InventoryPage.jsx');
}

// 2. Update useEffect to listen to purchasing (POs)
const targetUseEffect = '        const unsubSettings = onSnapshot(collection(db, \'inventory_settings\'), snap => {\n            setSettings(snap.docs.map(d => ({ id: d.id, ...d.data() })));\n            setLoading(false);\n        });\n\n        return () => {\n            unsubInv(); unsubParts(); unsubPRs(); unsubBOM(); unsubSettings();\n        };';

const replacementUseEffect = '        const unsubSettings = onSnapshot(collection(db, \'inventory_settings\'), snap => {\n            setSettings(snap.docs.map(d => ({ id: d.id, ...d.data() })));\n            setLoading(false);\n        });\n        const unsubPOs = onSnapshot(collection(db, \'purchasing\'), snap => {\n            setPOs(snap.docs.map(d => ({ id: d.id, ...d.data() })));\n        });\n\n        return () => {\n            unsubInv(); unsubParts(); unsubPRs(); unsubBOM(); unsubSettings(); unsubPOs();\n        };';

if (invContent.includes(targetUseEffect)) {
    invContent = invContent.replace(targetUseEffect, replacementUseEffect);
    console.log('Successfully updated useEffect onSnapshot listeners!');
} else {
    console.error('Could not find targetUseEffect in InventoryPage.jsx');
}

// 3. Replace reservedMap and add incomingMap
const targetReservedMap = '    // 2. 예약 재고 실시간 계산 (계산형)\n    const reservedMap = useMemo(() => {\n        const invMap = {};\n        inventory.forEach(i => {\n            invMap[(i.PartID || \'\').trim().toUpperCase()] = Number(i.OnHand || 0);\n        });\n        return productionService.calculateReservedMap(prs, bomMap, invMap);\n    }, [prs, bomMap, inventory]);';

const replacementReservedMap = '    // 2. 입고 예정 수량 계산 (계산형)\n    const incomingMap = useMemo(() => {\n        const inc = {};\n        pos.filter(po => [\'ORDERING\', \'WAITING_DELIVERY\', \'WAITING_INSPECTION\'].includes(po.Status)).forEach(po => {\n            const items = po.Items || [];\n            items.forEach(item => {\n                const pid = (item.PartID || \'\').trim().toUpperCase();\n                inc[pid] = (inc[pid] || 0) + Number(item.Qty || item.qty || 0);\n            });\n        });\n        return inc;\n    }, [pos]);\n\n    // 2.5 예약 및 부족 재고 통합 실시간 계산 (계산형)\n    const reservationResults = useMemo(() => {\n        const reserved = {};\n        const shortage = {};\n        const required = {};\n        const virtualInv = {};\n        \n        inventory.forEach(i => {\n            virtualInv[(i.PartID || \'\').trim().toUpperCase()] = Number(i.OnHand || 0);\n        });\n        \n        const processRequirement = (parentID, qty) => {\n            const pid = (parentID || \'\').trim().toUpperCase();\n            if (qty <= 0 || !pid) return;\n\n            required[pid] = (required[pid] || 0) + qty;\n\n            const availableInInv = Number(virtualInv[pid] || 0);\n            const takenFromInv = Math.min(availableInInv, qty);\n            \n            if (takenFromInv > 0) {\n                virtualInv[pid] -= takenFromInv;\n                reserved[pid] = (reserved[pid] || 0) + takenFromInv;\n            }\n            \n            const remainingToProduce = qty - takenFromInv;\n            if (remainingToProduce > 0) {\n                shortage[pid] = (shortage[pid] || 0) + remainingToProduce;\n                \n                const children = bomMap[pid] || [];\n                children.forEach(child => {\n                    const childID = (child.ChildID || \'\').trim().toUpperCase();\n                    const unitQty = Number(child.Quantity || child.qty || 1);\n                    const totalChildNeeded = unitQty * remainingToProduce;\n                    processRequirement(childID, totalChildNeeded);\n                });\n            }\n        };\n\n        prs.forEach(pr => {\n            const items = pr.Items || [{ PartID: pr.PartID, TargetQty: pr.TargetQty }];\n            items.forEach(item => {\n                processRequirement(item.PartID, Number(item.TargetQty || item.Qty || 0));\n            });\n        });\n\n        return { reservedMap: reserved, shortageMap: shortage, requiredMap: required };\n    }, [prs, bomMap, inventory]);\n\n    const reservedMap = reservationResults.reservedMap;\n    const shortageMap = reservationResults.shortageMap;';

if (invContent.includes(targetReservedMap)) {
    invContent = invContent.replace(targetReservedMap, replacementReservedMap);
    console.log('Successfully updated reservedMap computation!');
} else {
    console.error('Could not find targetReservedMap in InventoryPage.jsx');
}

// 4. Update displayData mapping to include shortageMap and incomingMap
const targetDisplayData = `    const displayData = useMemo(() => {
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
    }, [parts, inventory, reservedMap, safetyMap]);`;

const replacementDisplayData = `    const displayData = useMemo(() => {
        return parts.map(part => {
            const pid = (part.PartID || '').trim().toUpperCase();
            const invRecord = inventory.find(i => (i.PartID || '').trim().toUpperCase() === pid);
            const onHand = Number(invRecord?.OnHand || 0);
            const reserved = Number(reservedMap[pid] || 0);
            const available = Math.max(0, onHand - reserved);
            const safety = Number(safetyMap[pid] || part.SafetyStock || 0);
            const isRisk = available < safety;
            const shortage = Number(shortageMap[pid] || 0);
            const incoming = Number(incomingMap[pid] || 0);
            return {
                ...part,
                OnHand: onHand,
                Reserved: reserved,
                Available: available,
                Shortage: shortage,
                Incoming: incoming,
                Safety: safety,
                IsRisk: isRisk,
                Location: invRecord?.Location || '기본 창고'
            };
        });
    }, [parts, inventory, reservedMap, shortageMap, incomingMap, safetyMap]);`;

if (invContent.includes(targetDisplayData)) {
    invContent = invContent.replace(targetDisplayData, replacementDisplayData);
    console.log('Successfully updated displayData mapping!');
} else {
    console.error('Could not find targetDisplayData in InventoryPage.jsx');
}

// 5. Update filteredData useMemo to support activeFilter
const targetFilteredData = `    const filteredData = useMemo(() => {
        return displayData.filter(item => 
            item.PartID.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.Name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [displayData, searchTerm]);`;

const replacementFilteredData = '    const filteredData = useMemo(() => {\n        let list = displayData;\n        if (activeFilter === \'RISK\') {\n            list = list.filter(item => item.IsRisk);\n        } else if (activeFilter === \'RESERVED\') {\n            list = list.filter(item => item.Reserved > 0 || item.Shortage > 0);\n        } else if (activeFilter === \'INCOMING\') {\n            list = list.filter(item => item.Incoming > 0);\n        }\n        return list.filter(item => \n            item.PartID.toLowerCase().includes(searchTerm.toLowerCase()) ||\n            item.Name.toLowerCase().includes(searchTerm.toLowerCase())\n        );\n    }, [displayData, searchTerm, activeFilter]);';

if (invContent.includes(targetFilteredData)) {
    invContent = invContent.replace(targetFilteredData, replacementFilteredData);
    console.log('Successfully updated filteredData useMemo with activeFilter!');
} else {
    console.error('Could not find targetFilteredData in InventoryPage.jsx');
}

// 6. Update Quick Stats cards UI
const targetStatsGrid = `            {/* Quick Stats */}
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
                            <p className={\`text-2xl font-black \${s.color} mt-1\`}>{s.value}</p>
                        </div>
                        <div className={\`p-2.5 rounded-xl bg-slate-50 group-hover:bg-white transition-colors \${s.color}\`}><s.icon size={20}/></div>
                    </div>
                ))}
            </div>`;

const replacementStatsGrid = `            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
                {[
                    { id: 'ALL', label: '전체 품목', value: parts.length, color: 'text-slate-600', icon: ClipboardList },
                    { id: 'RISK', label: '위험 재고 (미달)', value: displayData.filter(d => d.IsRisk).length, color: 'text-rose-600', icon: AlertTriangle },
                    { id: 'RESERVED', label: '예약된 재고 (부족 포함)', value: displayData.filter(d => d.Reserved > 0 || d.Shortage > 0).length, subValue: displayData.reduce((acc, cur) => acc + (cur.Shortage || 0), 0) > 0 ? \`부족: \${displayData.reduce((acc, cur) => acc + (cur.Shortage || 0), 0).toLocaleString()} EA\` : null, color: 'text-indigo-600', icon: Clock },
                    { id: 'INCOMING', label: '입고 예정 품목', value: displayData.filter(d => d.Incoming > 0).length, color: 'text-blue-600', icon: ShieldAlert }
                ].map((s, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => setActiveFilter(s.id)}
                        className={\`bg-white rounded-2xl p-4 border shadow-sm flex items-center justify-between group cursor-pointer transition-all hover:scale-[1.02] \${activeFilter === s.id ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-200'}\`}
                    >
                        <div className="text-left">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <p className={\`text-2xl font-black \${s.color}\`}>{s.value}</p>
                                {s.subValue && <span className="text-[10px] font-black text-rose-500 bg-rose-50 border border-rose-100 rounded px-1">{s.subValue}</span>}
                            </div>
                        </div>
                        <div className={\`p-2.5 rounded-xl bg-slate-50 group-hover:bg-white transition-colors \${s.color}\`}><s.icon size={20}/></div>
                    </div>
                ))}
            </div>`;

if (invContent.includes(targetStatsGrid.replace(/\r\n/g, '\n'))) {
    invContent = invContent.replace(targetStatsGrid.replace(/\r\n/g, '\n'), replacementStatsGrid);
    console.log('Successfully updated Stats grid!');
} else {
    console.error('Could not find targetStatsGrid in InventoryPage.jsx');
}

// 7. Add dynamic Header Tab right before MasterDataGrid
const targetGridUI = `            {/* Main Grid */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden text-left relative">
                <MasterDataGrid`;

const replacementGridUI = `            {/* Main Grid */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden text-left relative">
                {/* Dynamic Header Tab */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex space-x-6">
                        <span className={\`text-sm font-black pb-4 -mb-4 border-b-2 \${activeFilter === \'RISK\' || activeFilter === \'RESERVED\' ? \'border-rose-600 text-rose-600\' : \'border-emerald-600 text-emerald-600\'}\`}>
                            {activeFilter === 'RISK' && \`위험 재고 (\${displayData.filter(d => d.IsRisk).length})\`}
                            {activeFilter === 'RESERVED' && \`예약된 재고 (부족 포함) (\${displayData.filter(d => d.Reserved > 0 || d.Shortage > 0).length})\`}
                            {activeFilter === 'INCOMING' && \`입고 예정 품목 (\${displayData.filter(d => d.Incoming > 0).length})\`}
                            {activeFilter === 'ALL' && \`전체 재고 (\${displayData.length})\`}
                        </span>
                    </div>
                </div>
                <MasterDataGrid`;

if (invContent.includes(targetGridUI)) {
    invContent = invContent.replace(targetGridUI, replacementGridUI);
    console.log('Successfully updated dynamic Header Tab!');
} else {
    console.error('Could not find targetGridUI in InventoryPage.jsx');
}

// 8. Update columnDefs and cellRenderer in MasterDataGrid
const targetColumnDefs = `                    columnDefs={{
                        PartID: { label: 'Part ID', default: true },
                        Name: { label: '품목명', default: true },
                        OnHand: { label: '현재고', default: true },
                        Reserved: { label: '예약재고', default: true },
                        Available: { label: '가용재고', default: true },
                        Safety: { label: '안전재고', default: true },
                        Location: { label: '창고 위치', default: true }
                    }}`;

const replacementColumnDefs = `                    columnDefs={{
                        PartID: { label: 'Part ID', default: true },
                        Name: { label: '품목명', default: true },
                        OnHand: { label: '현재고', default: true },
                        Reserved: { label: '예약재고', default: true },
                        Available: { label: '가용재고', default: true },
                        Incoming: { label: '입고예정', default: true },
                        Safety: { label: '안전재고', default: true },
                        Location: { label: '창고 위치', default: true }
                    }}`;

if (invContent.includes(targetColumnDefs)) {
    invContent = invContent.replace(targetColumnDefs, replacementColumnDefs);
    console.log('Successfully updated columnDefs!');
} else {
    console.error('Could not find targetColumnDefs in InventoryPage.jsx');
}

const targetCellRenderer = `                        OnHand: (val) => <span className="font-black text-slate-400">{val?.toLocaleString()}</span>,
                        Reserved: (val) => <span className="font-black text-amber-500">{val > 0 ? \`-\${val.toLocaleString()}\` : '0'}</span>,
                        Available: (val, row) => (
                            <span className={\`font-black text-lg \${row.IsRisk ? 'text-rose-600 underline decoration-rose-200 underline-offset-4' : 'text-emerald-600'}\`}>
                                {val.toLocaleString()}
                            </span>
                        ),`;

const replacementCellRenderer = `                        OnHand: (val) => <span className="font-black text-slate-400">{val?.toLocaleString()}</span>,
                        Reserved: (val, row) => {
                            const shortage = row.Shortage || 0;
                            return (
                                <div className="flex flex-col items-end">
                                    <span className="font-black text-amber-500">{val > 0 ? \`-\${val.toLocaleString()}\` : '0'}</span>
                                    {shortage > 0 && (
                                        <span className="text-[10px] font-black text-rose-500 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 mt-0.5 animate-pulse">
                                            부족: \${shortage.toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            );
                        },
                        Available: (val, row) => (
                            <span className={\`font-black text-lg \${row.IsRisk ? 'text-rose-600 underline decoration-rose-200 underline-offset-4' : 'text-emerald-600'}\`}>
                                {val.toLocaleString()}
                            </span>
                        ),
                        Incoming: (val) => <span className="font-black text-blue-600">{val > 0 ? \`+\${val.toLocaleString()}\` : '0'}</span>,`;

if (invContent.includes(targetCellRenderer)) {
    invContent = invContent.replace(targetCellRenderer, replacementCellRenderer);
    console.log('Successfully updated cellRenderer!');
} else {
    console.error('Could not find targetCellRenderer in InventoryPage.jsx');
}

fs.writeFileSync(invPagePath, invContent.replace(/\n/g, '\r\n'), 'utf8');
