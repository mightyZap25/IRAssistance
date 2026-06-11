import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, updateDoc, query, where, serverTimestamp, Timestamp } from "firebase/firestore";

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

// 시뮬레이션 상태 저장용 객체
const state = {
    purchases: [], // { id, partId, qty, status, stepDay }
    productions: [], // { id, partId, targetQty, actualQty, status, stepDay, reworked: bool }
    inventory: {},
    bom: {},
    parts: {},
    currentDate: new Date('2026-06-11'),
    mainProduct: 'IRMAA0039'
};

async function initData() {
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
    iSnap.forEach(d => state.inventory[d.data().PartID] = (state.inventory[d.data().PartID] || 0) + (d.data().Quantity || 0));
}

const getNeededMaterials = (partId, qty) => {
    let reqs = {};
    const items = state.bom[partId] || [];
    if (items.length === 0) return { [partId]: qty };
    items.forEach(item => {
        const childReqs = getNeededMaterials(item.ChildID, qty * item.Quantity);
        for (let [id, amount] of Object.entries(childReqs)) {
            reqs[id] = (reqs[id] || 0) + amount;
        }
    });
    return reqs;
};

async function updateDbInventory(partId, change, reason) {
    state.inventory[partId] = (state.inventory[partId] || 0) + change;
    const q = query(collection(db, 'inventory'), where('PartID', '==', partId));
    const snap = await getDocs(q);
    if (!snap.empty) {
        await updateDoc(doc(db, 'inventory', snap.docs[0].id), { Quantity: state.inventory[partId], UpdatedAt: state.currentDate });
    } else {
        await addDoc(collection(db, 'inventory'), { PartID: partId, Quantity: state.inventory[partId], UpdatedAt: state.currentDate });
    }
    await addDoc(collection(db, 'inventory_transactions'), {
        PartID: partId, ChangeQty: change, FinalQty: state.inventory[partId], Reason: reason, Date: state.currentDate
    });
}

async function run() {
    await initData();
    console.log(`>>> 시뮬레이션 시작: 대상 ${state.mainProduct} <<<`);

    for (let day = 0; day <= 60; day++) {
        const dateStr = state.currentDate.toISOString().split('T')[0];
        console.log(`\n[DAY ${day}] ${dateStr}`);

        // --- 1. 생산 의뢰 발생 (안전재고 or 수주) ---
        if (day % 14 === 0 || day === 10 || day === 30) {
            let orderQty = 20; // 기본 안전재고 채우기용
            let type = 'SAFETY_STOCK';
            if (day === 10) { orderQty = 10; type = 'SALES_ORDER_SMALL'; }
            if (day === 30) { orderQty = 100; type = 'SALES_ORDER_LARGE'; }

            const currentStock = state.inventory[state.mainProduct] || 0;
            const inProgress = state.productions.filter(p => p.partId === state.mainProduct && p.status !== 'SHIPPED').reduce((s, p) => s + p.targetQty, 0);
            
            if (currentStock + inProgress < (type === 'SAFETY_STOCK' ? 20 : orderQty)) {
                const target = Math.max(orderQty, 20 - (currentStock + inProgress));
                console.log(`[영업/생산] 신규 의뢰 발생: ${state.mainProduct} (수량: ${target}, 사유: ${type})`);
                const prRef = doc(collection(db, 'production_requests'));
                const prData = { 
                    PRNumber: `PR-${dateStr}-${day}-${Date.now()}`,
                    PartID: state.mainProduct, TargetQty: target, Status: 'PLANNING', CreatedAt: state.currentDate, Type: type
                };
                await setDoc(prRef, prData);
                state.productions.push({ id: prRef.id, ...prData, stepDay: day });
            }
        }

        // --- 2. 구매 프로세스 처리 (State Machine) ---
        for (let pur of state.purchases) {
            if (pur.status === 'RFQ_SENT' && day >= pur.stepDay + 1) {
                console.log(`[구매] ${pur.partId} 견적 회신 완료 -> 기안서(DRAFT) 작성`);
                pur.status = 'DRAFT_CREATED';
                pur.stepDay = day;
            } else if (pur.status === 'DRAFT_CREATED' && day >= pur.stepDay + 1) {
                console.log(`[구매] ${pur.partId} 결재 승인 완료 -> 발주(PO) 진행`);
                pur.status = 'ORDERED';
                pur.stepDay = day;
                await addDoc(collection(db, 'purchase_orders'), { 
                    PONumber: `PO-${pur.id}`, PartID: pur.partId, Qty: pur.qty, Status: 'ORDERED', CreatedAt: state.currentDate 
                });
            } else if (pur.status === 'ORDERED' && day >= pur.stepDay + 5) { // Lead time 5 days
                console.log(`[입고] ${pur.partId} 자재 현장 도착 -> 입고검사 대기`);
                pur.status = 'ARRIVED';
                pur.stepDay = day;
                await addDoc(collection(db, 'receiving'), { PartID: pur.partId, Qty: pur.qty, Status: 'PENDING', ReceivedAt: state.currentDate });
            } else if (pur.status === 'ARRIVED' && day >= pur.stepDay + 1) {
                console.log(`[품질] ${pur.partId} 입고검사 합격 -> 창고 적재`);
                pur.status = 'STOCKED';
                await updateDbInventory(pur.partId, pur.qty, `구매입고 (${pur.id})`);
            }
        }

        // --- 3. 생산 프로세스 처리 (State Machine) ---
        for (let pr of state.productions) {
            if (pr.status === 'PLANNING') {
                const reqs = getNeededMaterials(pr.partId, pr.targetQty);
                let shortage = false;
                for (let [mid, mqty] of Object.entries(reqs)) {
                    if ((state.inventory[mid] || 0) < mqty) {
                        shortage = true;
                        // 구매 요청 생성 (중복 방지 생략)
                        console.log(`[생산/구매] 자재 부족(${mid}). 구매 시퀀스 시작.`);
                        const purId = `PUR-${Date.now()}-${mid}`;
                        state.purchases.push({ id: purId, partId: mid, qty: mqty + 50, status: 'RFQ_SENT', stepDay: day });
                    }
                }
                if (!shortage) {
                    console.log(`[생산] ${pr.PRNumber} 자재 확보 완료 -> 생산 착수`);
                    for (let [mid, mqty] of Object.entries(reqs)) {
                        await updateDbInventory(mid, -mqty, `생산투입 (${pr.PRNumber})`);
                    }
                    pr.status = 'IN_PRODUCTION';
                    pr.stepDay = day;
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'IN_PRODUCTION' });
                } else {
                    pr.status = 'WAITING_PARTS';
                }
            } else if (pr.status === 'WAITING_PARTS') {
                // 자재가 STOCKED 되었는지 재체크
                const reqs = getNeededMaterials(pr.partId, pr.targetQty);
                if (Object.entries(reqs).every(([mid, mqty]) => (state.inventory[mid] || 0) >= mqty)) {
                    pr.status = 'PLANNING'; // 다시 플래닝으로 보내서 투입 처리
                }
            } else if (pr.status === 'IN_PRODUCTION' && day >= pr.stepDay + 3) { // 생산 3일 소요
                console.log(`[생산] ${pr.PRNumber} 생산 완료 -> 출하검사 대기`);
                pr.status = 'QA_WAITING';
                pr.stepDay = day;
                await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'QA_WAITING' });
            } else if (pr.status === 'QA_WAITING' && day >= pr.stepDay + 1) {
                // 불량률 15% 시뮬레이션
                if (Math.random() < 0.15 && !pr.reworked) {
                    const defectQty = Math.floor(pr.targetQty * 0.2) + 1;
                    console.log(`[품질] ${pr.PRNumber} 불량 발생! (불량: ${defectQty}). 재생산 지시.`);
                    pr.actualQty = pr.targetQty - defectQty;
                    pr.reworked = true;
                    pr.status = 'IN_PRODUCTION'; // 다시 생산으로 (단순화)
                    pr.stepDay = day;
                    await addDoc(collection(db, 'qa_shipping_inspections'), { PRNumber: pr.PRNumber, Result: 'Fail', DefectQty: defectQty, CreatedAt: state.currentDate });
                } else {
                    console.log(`[품질] ${pr.PRNumber} 출하검사 합격 -> 완제품 입고`);
                    const finalQty = pr.actualQty || pr.targetQty;
                    await updateDbInventory(pr.partId, finalQty, `생산완료 (${pr.PRNumber})`);
                    pr.status = 'SHIPPED';
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'COMPLETED', CompletedAt: state.currentDate });
                    await addDoc(collection(db, 'qa_shipping_inspections'), { PRNumber: pr.PRNumber, Result: 'Pass', CreatedAt: state.currentDate });
                }
            }
        }

        state.currentDate.setDate(state.currentDate.getDate() + 1);
    }

    console.log("\n>>> 시뮬레이션 종료 <<<");
    console.log("최종 완제품 재고:", state.inventory[state.mainProduct]);
    process.exit(0);
}

run();
