
/**
 * 2-Month Business Sequence Simulation Test (Version 2 - Advanced Logic)
 * Covers: Recursive BOM, Lead times, Quality Rework, Safety Stock
 */

const mockDb = {
    parts: {
        'PROD-A': { id: 'PROD-A', name: '완제품 A', class: 'Product', safetyStock: 20, onHand: 0, leadTime: 1 },
        'ASSY-01': { id: 'ASSY-01', name: '반제품 01', class: 'Assembly', onHand: 0, leadTime: 2 },
        'PART-01': { id: 'PART-01', name: '원자재 01', class: 'Part', onHand: 0, leadTime: 3 }
    },
    bom: {
        'PROD-A': [{ id: 'ASSY-01', qty: 1 }],
        'ASSY-01': [{ id: 'PART-01', qty: 2 }]
    },
    purchaseOrders: [],
    receivingQueue: [],
    productionQueue: [],
    timeline: []
};

let currentDate = new Date('2026-06-11');

function log(msg) {
    const d = currentDate.toISOString().split('T')[0];
    mockDb.timeline.push(`[${d}] ${msg}`);
}

const Biz = {
    // 1. Recursive Demand Calculation & Trigger
    ensureSupply: (partId, neededQty) => {
        const part = mockDb.parts[partId];
        const currentTotal = part.onHand + Biz.getIncomingQty(partId);
        
        if (currentTotal < neededQty) {
            const gap = neededQty - currentTotal;
            if (part.class === 'Part') {
                Biz.createPO(partId, gap + 10); // Buy with buffer
            } else {
                Biz.createPR(partId, gap + 5); // Produce with buffer
            }
        }
    },

    getIncomingQty: (partId) => {
        const poIn = mockDb.purchaseOrders.filter(p => p.partId === partId && !p.done).reduce((s, p) => s + p.qty, 0);
        const prIn = mockDb.productionQueue.filter(p => p.partId === partId && p.status !== 'DONE').reduce((s, p) => s + p.qty, 0);
        return poIn + prIn;
    },

    createPO: (partId, qty) => {
        log(`[구매] ${partId} 견적/결재/발주 시작 (수량: ${qty})`);
        const eta = new Date(currentDate);
        eta.setDate(eta.getDate() + mockDb.parts[partId].leadTime);
        mockDb.purchaseOrders.push({ partId, qty, eta, done: false });
    },

    createPR: (partId, qty) => {
        log(`[생산] ${partId} 생산 계획 수립 (수량: ${qty})`);
        mockDb.productionQueue.push({ partId, qty, status: 'PLANNING', createdAt: new Date(currentDate) });
    },

    // 2. Daily Processing
    processDaily: () => {
        // A. PO Arrival
        mockDb.purchaseOrders.forEach(po => {
            if (!po.done && po.eta <= currentDate) {
                log(`[입고] ${po.partId} 자재 입고 (수량: ${po.qty}). 입고검사 진행.`);
                mockDb.receivingQueue.push({ partId: po.partId, qty: po.qty, type: 'INCOMING' });
                po.done = true;
            }
        });

        // B. Inspection (Immediate for sim)
        while (mockDb.receivingQueue.length > 0) {
            const task = mockDb.receivingQueue.shift();
            mockDb.parts[task.partId].onHand += task.qty;
            log(`[검사] ${task.partId} 검사 통과 및 적재. (현재고: ${mockDb.parts[task.partId].onHand})`);
        }

        // C. Production Execution
        mockDb.productionQueue.forEach(pr => {
            if (pr.status === 'PLANNING') {
                const bom = mockDb.bom[pr.partId] || [];
                let canStart = true;
                bom.forEach(item => {
                    if (mockDb.parts[item.id].onHand < (item.qty * pr.qty)) {
                        canStart = false;
                        Biz.ensureSupply(item.id, item.qty * pr.qty);
                    }
                });

                if (canStart) {
                    log(`[생산] ${pr.partId} 자재 확보 완료. 작업 착수.`);
                    bom.forEach(item => mockDb.parts[item.id].onHand -= (item.qty * pr.qty));
                    pr.status = 'IN_PROGRESS';
                    pr.finishDate = new Date(currentDate);
                    pr.finishDate.setDate(pr.finishDate.getDate() + mockDb.parts[pr.partId].leadTime);
                }
            } else if (pr.status === 'IN_PROGRESS' && pr.finishDate <= currentDate) {
                log(`[품질] ${pr.partId} 생산 완료. 출하/공정 검사 실시.`);
                // Simulate Defect (15%)
                if (Math.random() < 0.15) {
                    const scrap = Math.floor(pr.qty * 0.2);
                    const rework = pr.qty - scrap;
                    log(`[품질] ${pr.partId} 불량 발생! (폐기: ${scrap}, 재작업: ${rework})`);
                    pr.qty = rework;
                    pr.status = 'PLANNING'; // Back to loop
                } else {
                    log(`[완료] ${pr.partId} 최종 합격. 창고 이동. (현재고: ${mockDb.parts[pr.partId].onHand + pr.qty})`);
                    mockDb.parts[pr.partId].onHand += pr.qty;
                    pr.status = 'DONE';
                }
            }
        });
    }
};

async function run() {
    log("--- 시뮬레이션 시작 ---");
    for (let day = 0; day < 60; day++) {
        // 1. Check Safety Stock (Daily)
        Object.values(mockDb.parts).filter(p => p.class === 'Product').forEach(p => {
            if (p.onHand + Biz.getIncomingQty(p.id) < p.safetyStock) {
                Biz.ensureSupply(p.id, p.safetyStock);
            }
        });

        // 2. Sales Orders
        if (day === 10) { log("[영업] 소규모 오더 (10EA)"); Biz.ensureSupply('PROD-A', mockDb.parts['PROD-A'].onHand + 10); }
        if (day === 30) { log("[영업] 대규모 오더 발생!! (80EA) - 자재 부족 유도"); Biz.ensureSupply('PROD-A', mockDb.parts['PROD-A'].onHand + 80); }

        Biz.processDaily();
        currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(mockDb.timeline.join('\n'));
    console.log("\n--- 최종 재고 현황 ---");
    Object.values(mockDb.parts).forEach(p => console.log(`${p.name}: ${p.onHand} EA`));
}

run();
