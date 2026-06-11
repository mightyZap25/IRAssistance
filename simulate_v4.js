import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, updateDoc, query, where, limit } from "firebase/firestore";

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
    console.log("--- 데이터 초기화 시작 ---");
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

    console.log(`로드된 Parts: ${Object.keys(state.parts).length}개`);
    console.log(`로드된 BOM 관계: ${Object.keys(state.bom).length}개 그룹`);
    console.log(`대상 제품(${state.mainProduct}) 하위 구성요소: ${state.bom[state.mainProduct]?.length || 0}개`);
}

function getNeededMaterials(partId, qty) {
    let reqs = {};
    const children = state.bom[partId] || [];
    if (children.length === 0) return { [partId]: qty };
    for (const child of children) {
        const childReqs = getNeededMaterials(child.ChildID, qty * Number(child.Quantity || 1));
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
    console.log(`    [재고] ${partId}: ${oldQty} -> ${newQty} (${reason})`);
}

async function runSimulation() {
    await init();
    
    for (let day = 0; day <= 60; day++) {
        const dateStr = state.currentDate.toISOString().split('T')[0];
        console.log(`\n[DAY ${day}] ${dateStr}`);

        // A. 수요 발생 (영업 오더 / 안전재고)
        if (day % 14 === 0 || day === 10 || day === 30) {
            let targetQty = (day === 30) ? 100 : (day === 10 ? 15 : 20);
            const currentTotal = (state.inventory[state.mainProduct] || 0) + 
                                 state.productions.filter(p => p.partId === state.mainProduct && p.status !== 'COMPLETED').reduce((s, p) => s + p.targetQty, 0);
            
            if (currentTotal < targetQty) {
                const diff = targetQty - currentTotal;
                console.log(`[영업] ${state.mainProduct} 신규 생산의뢰 생성 (수량: ${diff})`);
                const prRef = doc(collection(db, 'production_requests'));
                const prData = {
                    PRNumber: `PR-${day}-${Date.now()}`,
                    PartID: state.mainProduct, TargetQty: diff, Status: 'PLANNING', CreatedAt: state.currentDate
                };
                await setDoc(prRef, prData);
                state.productions.push({ ...prData, id: prRef.id, stepDay: day });
            }
        }

        // B. 구매 프로세스 (견적 -> 기안 -> 결재 -> 발주 -> 입고)
        for (let pur of state.purchases) {
            if (pur.status === 'RFQ_SENT' && day >= pur.stepDay + 1) {
                console.log(`[구매] ${pur.partId} 견적회신 완료 -> 기안서 작성`);
                pur.status = 'DRAFT'; pur.stepDay = day;
            } else if (pur.status === 'DRAFT' && day >= pur.stepDay + 1) {
                console.log(`[구매] ${pur.partId} 결재 승인 -> 발주서(PO) 발송`);
                pur.status = 'ORDERED'; pur.stepDay = day;
                await addDoc(collection(db, 'purchase_orders'), { PartID: pur.partId, Qty: pur.qty, Status: 'ORDERED', CreatedAt: state.currentDate });
            } else if (pur.status === 'ORDERED' && day >= pur.stepDay + 5) {
                console.log(`[입고] ${pur.partId} 자재 도착 -> 검사 대기`);
                pur.status = 'ARRIVED'; pur.stepDay = day;
            } else if (pur.status === 'ARRIVED' && day >= pur.stepDay + 1) {
                console.log(`[품질] ${pur.partId} 입고검사 통과 -> 적재`);
                pur.status = 'STOCKED';
                await updateInventory(pur.partId, pur.qty, '구매 입고');
            }
        }

        // C. 생산 프로세스 (자재체크 -> 생산 -> 출하검사)
        for (let pr of state.productions) {
            if (pr.status === 'PLANNING') {
                const reqs = getNeededMaterials(pr.partId, pr.targetQty);
                let canStart = true;
                for (const [mid, mqty] of Object.entries(reqs)) {
                    if ((state.inventory[mid] || 0) < mqty) {
                        canStart = false;
                        if (!state.purchases.find(p => p.partId === mid && p.status !== 'STOCKED')) {
                            console.log(`[구매요청] 자재 부족(${mid}): 견적 요청 발송`);
                            state.purchases.push({ partId: mid, qty: mqty + 50, status: 'RFQ_SENT', stepDay: day });
                        }
                    }
                }
                if (canStart) {
                    console.log(`[생산] ${pr.PRNumber} 자재 확보 완료 -> 생산 시작`);
                    for (const [mid, mqty] of Object.entries(reqs)) {
                        await updateInventory(mid, -mqty, `생산투입(${pr.PRNumber})`);
                    }
                    pr.status = 'IN_PRODUCTION'; pr.stepDay = day;
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'IN_PRODUCTION' });
                }
            } else if (pr.status === 'IN_PRODUCTION' && day >= pr.stepDay + 3) {
                console.log(`[품질] ${pr.PRNumber} 생산 완료 -> 출하검사 실시`);
                pr.status = 'QA'; pr.stepDay = day;
            } else if (pr.status === 'QA' && day >= pr.stepDay + 1) {
                if (Math.random() < 0.15 && !pr.reworked) {
                    console.log(`[품질] ${pr.PRNumber} 불량 검출! 재생산 지시`);
                    pr.status = 'IN_PRODUCTION'; pr.stepDay = day; pr.reworked = true;
                } else {
                    console.log(`[완료] ${pr.PRNumber} 최종 합격 -> 완제품 재고 반영`);
                    await updateInventory(pr.partId, pr.targetQty, `생산완료(${pr.PRNumber})`);
                    pr.status = 'COMPLETED';
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'COMPLETED', CompletedAt: state.currentDate });
                }
            }
        }

        state.currentDate.setDate(state.currentDate.getDate() + 1);
    }

    console.log("\n--- 시뮬레이션 최종 결과 ---");
    console.log(`완제품(${state.mainProduct}) 재고: ${state.inventory[state.mainProduct] || 0}`);
    process.exit(0);
}

runSimulation();
