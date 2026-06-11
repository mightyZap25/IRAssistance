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
    mainProduct: 'IRMAA0039'
};

async function init() {
    console.log("--- 시스템 데이터 로드 시작 ---");
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
    console.log(`- 완제품 ${state.mainProduct} 재고: ${state.inventory[state.mainProduct] || 0} EA`);
}

function getNeededMaterials(partId, qty, depth = 0) {
    if (depth > 10) return {}; // 순환 참조 방지
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
    await addDoc(collection(db, 'inventory_transactions'), {
        PartID: partId, ChangeQty: change, FinalQty: newQty, Reason: reason, Date: state.currentDate
    });
    console.log(`    [재고변경] ${partId}: ${oldQty} -> ${newQty} (${reason})`);
}

async function run() {
    await init();
    for (let day = 0; day <= 60; day++) {
        const dateStr = state.currentDate.toISOString().split('T')[0];
        console.log(`\n[Day ${day}] ${dateStr}`);

        // 1. 수요 발생
        if (day % 14 === 0 || day === 10 || day === 30) {
            let target = (day === 30) ? 100 : (day === 10 ? 15 : 20);
            const currentTotal = (state.inventory[state.mainProduct] || 0) + 
                                 state.productions.filter(p => p.Status !== 'COMPLETED').reduce((s, p) => s + p.TargetQty, 0);
            if (currentTotal < target) {
                const diff = target - currentTotal;
                console.log(`[영업] ${state.mainProduct} 신규 생산의뢰 (수량: ${diff})`);
                const prRef = doc(collection(db, 'production_requests'));
                const prData = { PRNumber: `PR-${day}-${Date.now()}`, PartID: state.mainProduct, TargetQty: diff, Status: 'PLANNING', CreatedAt: state.currentDate };
                await setDoc(prRef, prData);
                state.productions.push({ ...prData, id: prRef.id, stepDay: day });
            }
        }

        // 2. 구매 시퀀스 (RFQ -> DRAFT -> APPROVING -> ORDERED -> ARRIVED -> STOCKED)
        for (let pur of state.purchases) {
            if (pur.Status === 'RFQ_SENT' && day >= pur.stepDay + 1) {
                console.log(`[구매] ${pur.PartID} 견적회신 완료 -> 기안서(DRAFT) 작성`);
                pur.Status = 'DRAFT'; pur.stepDay = day;
            } else if (pur.Status === 'DRAFT' && day >= pur.stepDay + 1) {
                console.log(`[관리] ${pur.PartID} 구매 기안 상신 -> 결재 대기 중`);
                pur.Status = 'APPROVING'; pur.stepDay = day;
            } else if (pur.Status === 'APPROVING' && day >= pur.stepDay + 1) {
                console.log(`[관리] ${pur.PartID} 결재 승인 완료 -> 발주(ORDERED)`);
                pur.Status = 'ORDERED'; pur.stepDay = day;
                await addDoc(collection(db, 'purchase_orders'), { PartID: pur.PartID, Qty: pur.Qty, Status: 'ORDERED', CreatedAt: state.currentDate });
            } else if (pur.Status === 'ORDERED' && day >= pur.stepDay + 5) {
                console.log(`[입고] ${pur.PartID} 자재 현장 도착 -> 검사 대기`);
                pur.Status = 'ARRIVED'; pur.stepDay = day;
            } else if (pur.Status === 'ARRIVED' && day >= pur.stepDay + 1) {
                console.log(`[품질] ${pur.PartID} 입고검사 합격 -> 적재 완료`);
                pur.Status = 'STOCKED';
                await updateInventory(pur.PartID, pur.Qty, '구매 입고');
            }
        }

        // 3. 생산 시퀀스 (PLANNING -> IN_PRODUCTION -> QA -> COMPLETED)
        for (let pr of state.productions) {
            if (pr.Status === 'PLANNING') {
                const reqs = getNeededMaterials(pr.PartID, pr.TargetQty);
                let shortage = false;
                for (const [mid, mqty] of Object.entries(reqs)) {
                    if ((state.inventory[mid] || 0) < mqty) {
                        shortage = true;
                        if (!state.purchases.find(p => p.PartID === mid && p.Status !== 'STOCKED')) {
                            console.log(`[구매요청] 자재 부족(${mid}): 견적 요청 발송`);
                            state.purchases.push({ PartID: mid, Qty: mqty + 50, Status: 'RFQ_SENT', stepDay: day });
                        }
                    }
                }
                if (!shortage) {
                    console.log(`[생산] ${pr.PRNumber} 자재 확보 완료 -> 생산 공정 투입`);
                    for (const [mid, mqty] of Object.entries(reqs)) {
                        await updateInventory(mid, -mqty, `생산투입(${pr.PRNumber})`);
                    }
                    pr.Status = 'IN_PRODUCTION'; pr.stepDay = day;
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'IN_PRODUCTION' });
                }
            } else if (pr.Status === 'IN_PRODUCTION' && day >= pr.stepDay + 3) {
                console.log(`[품질] ${pr.PRNumber} 생산 공정 완료 -> 출하검사 대기`);
                pr.Status = 'QA'; pr.stepDay = day;
            } else if (pr.Status === 'QA' && day >= pr.stepDay + 1) {
                if (Math.random() < 0.15 && !pr.Reworked) {
                    console.log(`[품질] ${pr.PRNumber} 불량 발생!! 재생산(Rework) 루프 진입`);
                    pr.Status = 'IN_PRODUCTION'; pr.stepDay = day; pr.Reworked = true;
                } else {
                    console.log(`[판매/물류] ${pr.PRNumber} 최종 합격 -> 출하 및 재고 적재`);
                    await updateInventory(pr.PartID, pr.TargetQty, `생산완료(${pr.PRNumber})`);
                    pr.Status = 'COMPLETED';
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'COMPLETED', CompletedAt: state.currentDate });
                }
            }
        }
        state.currentDate.setDate(state.currentDate.getDate() + 1);
    }
    console.log("\n--- 시뮬레이션 완료 ---");
    console.log(`최종 완제품(${state.mainProduct}) 재고: ${state.inventory[state.mainProduct]} EA`);
    process.exit(0);
}

run();
