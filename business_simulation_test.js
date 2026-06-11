
/**
 * 2-Month Business Sequence Simulation Test
 * Covers: Purchasing -> Receiving -> Inspection -> Inventory -> Production -> Quality -> Sales -> Delivery
 */

const mockDb = {
    parts: {
        'PROD-A': { id: 'PROD-A', name: '완제품 A', class: 'Product', safetyStock: 20, onHand: 0 },
        'ASSY-01': { id: 'ASSY-01', name: '반제품 01', class: 'Assembly', onHand: 0 },
        'PART-01': { id: 'PART-01', name: '원자재 01', class: 'Part', onHand: 0, leadTime: 3 } // 3 days
    },
    bom: [
        { parentId: 'PROD-A', childId: 'ASSY-01', qty: 1 },
        { parentId: 'ASSY-01', childId: 'PART-01', qty: 2 }
    ],
    purchaseOrders: [],
    receiving: [],
    productionRequests: [],
    qualityInspections: [],
    salesOrders: [],
    timeline: []
};

let currentDate = new Date('2026-06-11');

function logTimeline(msg) {
    const dateStr = currentDate.toISOString().split('T')[0];
    mockDb.timeline.push(`[${dateStr}] ${msg}`);
}

function advanceDay(days = 1) {
    currentDate.setDate(currentDate.getDate() + days);
}

// --- Simulation Modules ---

const Simulation = {
    // 1. Purchasing & Receiving Flow
    processPurchasing: (partId, qty) => {
        logTimeline(`[구매] ${partId} 견적 요청 (이메일 발송 시뮬레이션)`);
        logTimeline(`[구매] ${partId} 견적 회신 완료 및 기안서 작성`);
        logTimeline(`[구매] ${partId} 결재 승인 및 발주(PO) 진행 (수량: ${qty})`);
        
        const po = { id: `PO-${Date.now()}`, partId, qty, eta: new Date(currentDate) };
        po.eta.setDate(po.eta.getDate() + mockDb.parts[partId].leadTime);
        mockDb.purchaseOrders.push(po);
    },

    checkArrivedGoods: () => {
        const arrived = mockDb.purchaseOrders.filter(po => po.eta <= currentDate && !po.arrived);
        arrived.forEach(po => {
            po.arrived = true;
            logTimeline(`[입고] ${po.partId} 입고 완료 (수량: ${po.qty}). 검사 대기열 추가.`);
            mockDb.receiving.push({ id: `REC-${po.id}`, partId: po.partId, qty: po.qty, status: 'WAITING_INSPECTION' });
        });
    },

    // 2. Inspection & Inventory
    processInspections: () => {
        const pending = mockDb.receiving.filter(r => r.status === 'WAITING_INSPECTION');
        pending.forEach(r => {
            r.status = 'INSPECTION_COMPLETE';
            const part = mockDb.parts[r.partId];
            part.onHand += r.qty;
            logTimeline(`[검사] ${r.partId} 입고 검사 합격 및 창고 적재 완료. (현재고: ${part.onHand})`);
        });
    },

    // 3. Production Flow
    requestProduction: (partId, qty, source = 'Internal') => {
        logTimeline(`[생산] ${partId} 생산 의뢰 생성 (수량: ${qty}, 원인: ${source})`);
        const pr = { id: `PR-${Date.now()}`, partId, qty, status: 'PLANNING' };
        
        // Material Check
        const needed = [];
        const bomItems = mockDb.bom.filter(b => b.parentId === partId);
        let hasMaterials = true;
        
        bomItems.forEach(b => {
            const req = b.qty * qty;
            if (mockDb.parts[b.childId].onHand < req) {
                hasMaterials = false;
                needed.push({ id: b.childId, short: req - mockDb.parts[b.childId].onHand });
            }
        });

        if (hasMaterials) {
            pr.status = 'IN_PRODUCTION';
            logTimeline(`[생산] ${partId} 자재 확인 완료. 생산 시작.`);
            bomItems.forEach(b => mockDb.parts[b.childId].onHand -= (b.qty * qty));
        } else {
            logTimeline(`[생산] ${partId} 자재 부족. 구매 요청 전송.`);
            needed.forEach(n => Simulation.processPurchasing(n.id, n.short + 20)); // Extra safety
        }
        mockDb.productionRequests.push(pr);
    },

    completeProduction: () => {
        const active = mockDb.productionRequests.filter(p => p.status === 'IN_PRODUCTION');
        active.forEach(p => {
            p.status = 'WAITING_QA';
            logTimeline(`[생산] ${p.partId} 생산 완료. 품질 검사(QA) 요청.`);
        });
    },

    // 4. Final Quality & Shipping
    processFinalQA: () => {
        const pending = mockDb.productionRequests.filter(p => p.status === 'WAITING_QA');
        pending.forEach(p => {
            // Simulate 10% defect rate
            const isDefect = Math.random() < 0.1;
            if (isDefect) {
                logTimeline(`[품질] ${p.partId} 불량 발생! 폐기 및 재생산 결정.`);
                p.status = 'IN_PRODUCTION'; // Re-work loop
            } else {
                p.status = 'COMPLETED';
                mockDb.parts[p.partId].onHand += p.qty;
                logTimeline(`[품질] ${p.partId} 최종 합격. 재고 가용. (현재고: ${mockDb.parts[p.partId].onHand})`);
            }
        });
    }
};

// --- Execution of 2 Month Simulation ---
async function runSimulation() {
    console.log(">>> Starting 2-Month Business Sequence Simulation <<<\n");

    for (let day = 0; day < 60; day++) {
        // A. Daily Checks
        Simulation.checkArrivedGoods();
        Simulation.processInspections();
        Simulation.completeProduction();
        Simulation.processFinalQA();

        // B. Business Logic
        // 1. Safety Stock Management (Check every 7 days)
        if (day % 7 === 0) {
            Object.values(mockDb.parts).filter(p => p.class === 'Product').forEach(p => {
                if (p.onHand < p.safetyStock) {
                    Simulation.requestProduction(p.id, p.safetyStock - p.onHand, 'Safety Stock Target');
                }
            });
        }

        // 2. Random Sales Orders
        if (day % 15 === 0 && day > 0) {
            const qty = day === 30 ? 100 : Math.floor(Math.random() * 30) + 10; // Large order on day 30
            logTimeline(`[영업] 신규 수주 발생: 완제품 A (수량: ${qty})`);
            Simulation.requestProduction('PROD-A', qty, 'Customer Order');
        }

        advanceDay(1);
    }

    // Output Results
    console.log("--- TIMELINE LOG ---");
    mockDb.timeline.forEach(l => console.log(l));

    console.log("\n--- FINAL INVENTORY ---");
    Object.values(mockDb.parts).forEach(p => {
        console.log(`${p.name} (${p.id}): ${p.onHand} EA`);
    });

    console.log("\n>>> Simulation Completed <<<");
}

runSimulation();
