const fs = require('fs');
const path = require('path');

// 1. Update ProductionExecutionPage.jsx
const execPagePath = path.join(__dirname, '..', 'src', 'pages', 'ProductionExecutionPage.jsx');
let execContent = fs.readFileSync(execPagePath, 'utf8');

// We need to replace the entire KanbanCard function block (including the duplicate/corrupt part)
// Let's locate the start of KanbanCard
const kanbanCardStart = execContent.indexOf('function KanbanCard({ pr, onClick }) {');
// Let's locate the start of ProductionExecutionPage function
const nextFuncStart = execContent.indexOf('export default function ProductionExecutionPage() {');

if (kanbanCardStart !== -1 && nextFuncStart !== -1) {
    const cleanKanbanCard = `function KanbanCard({ pr, onClick }) {
    const delayed = isDelayed(pr.DueDate);
    const isShortage = pr.Status === 'WAITING_FOR_PARTS';
    const items = pr.Items || [];

    return (
        <div onClick={() => onClick(pr)} className={\`bg-white rounded-2xl p-4 border shadow-sm cursor-pointer hover:shadow-md transition-all \${delayed ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-150'} text-left\`}>
            {/* 바디 영역: 상단에 고객사, 하단에 품목 목록과 수량 */}
            <div className="flex flex-col gap-2">
                {/* 고객사명 */}
                <div className="pt-0.5">
                    <h4 className="text-sm font-black text-slate-800 tracking-tight">{pr.CustomerName || '일반고객'}</h4>
                </div>

                {/* 품목명 + 수량 + 납기일 */}
                <div className="flex flex-col space-y-1.5 border-t border-slate-100 pt-2 w-full">
                    {items.length === 0 ? (
                        <div className="flex items-center justify-between gap-3 text-[10px] w-full">
                            <span className="font-bold text-slate-700">{pr.PartName} ({pr.TargetQty} EA)</span>
                            <span className="font-bold text-slate-400 shrink-0">{pr.DueDate}</span>
                        </div>
                    ) : items.length <= 2 ? (
                        items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-3 text-[10px] w-full">
                                <span className="font-bold text-slate-700 truncate max-w-[170px]">{item.PartName} ({item.TargetQty} EA)</span>
                                <span className="font-bold text-slate-450 shrink-0">{item.DueDate || pr.DueDate}</span>
                            </div>
                        ))
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 text-[10px] w-full">
                                <span className="font-bold text-slate-700 truncate max-w-[170px]">{items[0].PartName} ({items[0].TargetQty} EA)</span>
                                <span className="font-bold text-slate-450 shrink-0">{items[0].DueDate || pr.DueDate}</span>
                            </div>
                            <div className="text-[10px] font-black text-slate-400">
                                외 {items.length - 1}종
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

`;

    execContent = execContent.substring(0, kanbanCardStart) + cleanKanbanCard + execContent.substring(nextFuncStart);
    fs.writeFileSync(execPagePath, execContent, 'utf8');
    console.log('Successfully updated ProductionExecutionPage.jsx!');
} else {
    console.error('Could not find KanbanCard or ProductionExecutionPage inside ProductionExecutionPage.jsx');
}

// 2. Update ProductionRequestsPage.jsx
const reqPagePath = path.join(__dirname, '..', 'src', 'pages', 'ProductionRequestsPage.jsx');
let reqContent = fs.readFileSync(reqPagePath, 'utf8');

// Update fetchPRs
const targetFetchPRs = `            const loadedPrs = prSnap.docs.map(d => {
                const data = d.data();
                let createdAtStr = '-';
                if (data.CreatedAt) {
                    if (data.CreatedAt.toDate) {
                        createdAtStr = data.CreatedAt.toDate().toISOString().split('T')[0];
                    } else if (typeof data.CreatedAt === 'string') {
                        createdAtStr = data.CreatedAt.split('T')[0];
                    } else if (data.CreatedAt.seconds) {
                        createdAtStr = new Date(data.CreatedAt.seconds * 1000).toISOString().split('T')[0];
                    }
                }
                return { id: d.id, ...data, CreatedAt: createdAtStr };
            });`;

const replacementFetchPRs = `            const loadedPrs = prSnap.docs.map(d => {
                const data = d.data();
                let createdAtStr = '-';
                if (data.CreatedAt) {
                    if (data.CreatedAt.toDate) {
                        createdAtStr = data.CreatedAt.toDate().toISOString().split('T')[0];
                    } else if (typeof data.CreatedAt === 'string') {
                        createdAtStr = data.CreatedAt.split('T')[0];
                    } else if (data.CreatedAt.seconds) {
                        createdAtStr = new Date(data.CreatedAt.seconds * 1000).toISOString().split('T')[0];
                    }
                }

                // Derive items-based properties if missing or for consistency
                const items = data.Items || [];
                let partName = data.PartName || '';
                let targetQty = data.TargetQty || 0;
                let unitPrice = data.UnitPrice || 0;
                let totalAmount = data.TotalAmount || 0;

                if (items.length > 0) {
                    if (items.length === 1) {
                        partName = items[0].PartName || items[0].Name || partName;
                        targetQty = items[0].TargetQty || items[0].Qty || targetQty;
                        unitPrice = items[0].UnitPrice || unitPrice;
                        totalAmount = items[0].TotalAmount || items[0].Amount || (items[0].UnitPrice * items[0].TargetQty) || totalAmount;
                    } else {
                        const firstItemName = items[0].PartName || items[0].Name || '';
                        partName = \`\${firstItemName} 외 \${items.length - 1}종\`;
                        targetQty = items.reduce((acc, cur) => acc + (cur.TargetQty || cur.Qty || 0), 0);
                        unitPrice = '-';
                        totalAmount = data.TotalAmount || items.reduce((acc, cur) => acc + (cur.UnitPrice * (cur.TargetQty || cur.Qty || 0)), 0);
                    }
                }

                return { 
                    id: d.id, 
                    ...data, 
                    CreatedAt: createdAtStr,
                    PartName: partName,
                    TargetQty: targetQty,
                    UnitPrice: unitPrice,
                    TotalAmount: totalAmount
                };
            });`;

if (reqContent.includes(targetFetchPRs)) {
    reqContent = reqContent.replace(targetFetchPRs, replacementFetchPRs);
    console.log('Successfully updated loadedPrs mapping in ProductionRequestsPage.jsx!');
} else {
    console.error('Could not find targetFetchPRs in ProductionRequestsPage.jsx');
}

// Update MasterDataGrid data mapping in ProductionRequestsPage.jsx
const targetGridData = `                    <MasterDataGrid 
                        data={(activeTab === 'CURRENT' ? [...currentData.active, ...currentData.production] : currentData.history).map(pr => ({
                            ...pr,
                            Status: PR_STATUS[pr.Status]?.label || pr.Status
                        }))}`;

const replacementGridData = `                    <MasterDataGrid 
                        data={(activeTab === 'CURRENT' ? [...currentData.active, ...currentData.production] : currentData.history).map(pr => {
                            const currency = pr.Currency || 'KRW';
                            const formatVal = (val, isPrice = false) => {
                                if (val === '-') return '-';
                                if (typeof val !== 'number') return val;
                                if (isPrice) {
                                    if (currency === 'USD') {
                                        return \`$\${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`;
                                    }
                                    return \`₩\${val.toLocaleString()}\`;
                                }
                                return \`\${val.toLocaleString()} EA\`;
                            };
                            return {
                                ...pr,
                                TargetQty: formatVal(pr.TargetQty),
                                UnitPrice: formatVal(pr.UnitPrice, true),
                                TotalAmount: formatVal(pr.TotalAmount, true),
                                Status: PR_STATUS[pr.Status]?.label || pr.Status
                            };
                        })}`;

if (reqContent.includes(targetGridData)) {
    reqContent = reqContent.replace(targetGridData, replacementGridData);
    console.log('Successfully updated MasterDataGrid data in ProductionRequestsPage.jsx!');
} else {
    console.error('Could not find targetGridData in ProductionRequestsPage.jsx');
}

fs.writeFileSync(reqPagePath, reqContent, 'utf8');
