import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, updateDoc, query, where } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDgbTFSfrqBCL0KqfWURmTDuGZJF8FNIRo",
    authDomain: "irerp-b0977.firebaseapp.com",
    projectId: "irerp-b0977",
    storageBucket: "irerp-b0977.firebasestorage.app",
    messagingSenderId: "602256994765",
    appId: "1:602256994765:web:95f5d748ea50b481081484",
    measurementId: "G-L10Z73Y1T8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
    purchases: [],
    productions: [],
    inventory: {},
    bom: {},
    parts: {},
    currentDate: new Date('2026-06-11'),
    mainProduct: 'IRMAA0039',
    stats: {
        totalSalesOrders: 0,
        totalSafetyStockOrders: 0,
        totalProductionRequests: 0,
        totalPurchaseOrders: 0,
        totalDefectsDetected: 0,
        totalReworks: 0,
        totalShippedQty: 0
    }
};

async function init() {
    const [pSnap, bSnap, iSnap] = await Promise.all([
        getDocs(collection(db, 'parts')),
        getDocs(collection(db, 'bom')),
        getDocs(collection(db, 'inventory'))
    ]);
    pSnap.forEach(d => state.parts[d.data().PartID] = d.data());
    bSnap.forEach(d => {
        const data = d.data();
        if (!state.bom[data.ParentID]) state.bom[data.ParentID] = [];
        state.bom[data.ParentID].push(data);
    });
    iSnap.forEach(d => {
        const data = d.data();
        state.inventory[data.PartID] = Number(data.Quantity || 0);
    });
}

function getNeededMaterials(partId, qty, depth = 0) {
    if (depth > 10) return {};
    let reqs = {};
    const children = state.bom[partId] || [];
    if (children.length === 0) return { [partId]: qty };
    for (const child of children) {
        const childReqs = getNeededMaterials(child.ChildID, qty * Number(child.Quantity || 1), depth + 1);
        for (const [id, amount] of Object.entries(childReqs)) {
            reqs[id] = (reqs[id] || 0) + amount;
        }
    }
    return reqs;
}

async function updateInventory(partId, change, reason) {
    const oldQty = state.inventory[partId] || 0;
    const newQty = oldQty + change;
    state.inventory[partId] = newQty;
    const q = query(collection(db, 'inventory'), where('PartID', '==', partId));
    const snap = await getDocs(q);
    if (!snap.empty) {
        await updateDoc(doc(db, 'inventory', snap.docs[0].id), { Quantity: newQty, UpdatedAt: state.currentDate });
    } else {
        await addDoc(collection(db, 'inventory'), { PartID: partId, Quantity: newQty, UpdatedAt: state.currentDate });
    }
}

async function run() {
    await init();
    console.log(">>> 6개월 통합 시뮬레이션 시작 (Total 180 Days) <<<");

    for (let day = 0; day <= 180; day++) {
        const dateStr = state.currentDate.toISOString().split('T')[0];

        // 1. 수요 발생 (계절성 대량 주문 및 정기 소규모 주문)
        let orderType = null;
        let target = 0;

        if (day === 45 || day === 90 || day === 135) {
            target = 150; // 분기별 대규모 주문
            orderType = 'SALES_LARGE';
            state.stats.totalSalesOrders++;
        } else if (day % 15 === 0 && day !== 0) {
            target = Math.floor(Math.random() * 20) + 15; // 15~34 소규모 주문
            orderType = 'SALES_SMALL';
            state.stats.totalSalesOrders++;
        } else if (day % 14 === 0) {
            // 안전재고 체크
            target = 30; // 6개월 테스트에서는 안전재고 목표를 30으로 상향
            orderType = 'SAFETY_STOCK';
        }

        if (orderType) {
            const currentTotal = (state.inventory[state.mainProduct] || 0) + 
                                 state.productions.filter(p => p.Status !== 'COMPLETED').reduce((s, p) => s + p.TargetQty, 0);
            if (currentTotal < target) {
                const diff = target - currentTotal;
                const prRef = doc(collection(db, 'production_requests'));
                const prData = { PRNumber: `PR-6M-${day}-${Date.now()}`, PartID: state.mainProduct, TargetQty: diff, Status: 'PLANNING', CreatedAt: state.currentDate };
                await setDoc(prRef, prData);
                state.productions.push({ ...prData, id: prRef.id, stepDay: day });
                state.stats.totalProductionRequests++;
                if (orderType === 'SAFETY_STOCK') state.stats.totalSafetyStockOrders++;
            }
        }

        // 2. 구매 시퀀스
        for (let pur of state.purchases) {
            if (pur.Status === 'RFQ_SENT' && day >= pur.stepDay + 1) {
                pur.Status = 'DRAFT'; pur.stepDay = day;
            } else if (pur.Status === 'DRAFT' && day >= pur.stepDay + 1) {
                pur.Status = 'APPROVING'; pur.stepDay = day;
            } else if (pur.Status === 'APPROVING' && day >= pur.stepDay + 1) {
                pur.Status = 'ORDERED'; pur.stepDay = day;
                await addDoc(collection(db, 'purchase_orders'), { PartID: pur.PartID, Qty: pur.Qty, Status: 'ORDERED', CreatedAt: state.currentDate });
                state.stats.totalPurchaseOrders++;
            } else if (pur.Status === 'ORDERED' && day >= pur.stepDay + 5) {
                pur.Status = 'ARRIVED'; pur.stepDay = day;
            } else if (pur.Status === 'ARRIVED' && day >= pur.stepDay + 1) {
                pur.Status = 'STOCKED';
                await updateInventory(pur.PartID, pur.Qty, '구매 입고');
            }
        }

        // 3. 생산 시퀀스
        for (let pr of state.productions) {
            if (pr.Status === 'PLANNING') {
                const reqs = getNeededMaterials(pr.PartID, pr.TargetQty);
                let shortage = false;
                for (const [mid, mqty] of Object.entries(reqs)) {
                    if ((state.inventory[mid] || 0) < mqty) {
                        shortage = true;
                        if (!state.purchases.find(p => p.PartID === mid && p.Status !== 'STOCKED')) {
                            state.purchases.push({ PartID: mid, Qty: mqty + 100, Status: 'RFQ_SENT', stepDay: day });
                        }
                    }
                }
                if (!shortage) {
                    for (const [mid, mqty] of Object.entries(reqs)) {
                        await updateInventory(mid, -mqty, `생산투입`);
                    }
                    pr.Status = 'IN_PRODUCTION'; pr.stepDay = day;
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'IN_PRODUCTION' });
                }
            } else if (pr.Status === 'IN_PRODUCTION' && day >= pr.stepDay + 3) {
                pr.Status = 'QA'; pr.stepDay = day;
            } else if (pr.Status === 'QA' && day >= pr.stepDay + 1) {
                // 불량률 12% 로 시뮬레이션
                if (Math.random() < 0.12 && !pr.Reworked) {
                    pr.Status = 'IN_PRODUCTION'; pr.stepDay = day; pr.Reworked = true;
                    state.stats.totalDefectsDetected++;
                    state.stats.totalReworks++;
                } else {
                    await updateInventory(pr.PartID, pr.TargetQty, `생산완료`);
                    pr.Status = 'COMPLETED';
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'COMPLETED', CompletedAt: state.currentDate });
                    state.stats.totalShippedQty += pr.TargetQty;
                }
            }
        }

        if (day % 30 === 0) {
            console.log(`[진척도] ${day}/180 Days Completed... 완제품 재고: ${state.inventory[state.mainProduct] || 0}`);
        }

        state.currentDate.setDate(state.currentDate.getDate() + 1);
    }

    console.log("\n>>> 시뮬레이션 완료 통계 <<<");
    console.log(JSON.stringify(state.stats, null, 2));
    console.log(`최종 완제품 재고: ${state.inventory[state.mainProduct] || 0} EA`);
    process.exit(0);
}

run();
