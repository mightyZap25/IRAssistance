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

async function runSimulation() {
    console.log(">>> 2개월 종합 비즈니스 시뮬레이션 시작 <<<");

    let currentDate = new Date('2026-06-11');
    const logs = [];
    const prQueue = [];
    const poQueue = [];
    const receivingQueue = [];
    const qaShipQueue = [];

    // 1. Load Data
    const partsSnap = await getDocs(collection(db, 'parts'));
    const bomSnap = await getDocs(collection(db, 'bom'));
    const inventorySnap = await getDocs(collection(db, 'inventory'));

    const parts = {};
    partsSnap.forEach(d => parts[d.data().PartID] = d.data());

    const bom = {}; // ParentID -> Array of { ChildID, Quantity }
    const childSet = new Set();
    bomSnap.forEach(d => {
        const data = d.data();
        if (!bom[data.ParentID]) bom[data.ParentID] = [];
        bom[data.ParentID].push(data);
        childSet.add(data.ChildID);
    });

    const inventory = {}; // PartID -> Qty
    inventorySnap.forEach(d => {
        const data = d.data();
        inventory[data.PartID] = (inventory[data.PartID] || 0) + (data.Quantity || 0);
    });

    // Find a Top Level Product (Parent, but not a Child)
    let finishedGoods = Object.keys(bom).filter(p => !childSet.has(p));
    if (finishedGoods.length === 0) {
        console.log("BOM 트리에 최상위 완제품이 없습니다. 첫번째 ParentID를 완제품으로 간주합니다.");
        finishedGoods = Object.keys(bom);
    }
    const mainProduct = finishedGoods[0];
    
    if (!mainProduct) {
        console.error("테스트할 부품/BOM이 없습니다. DB 상태를 확인하세요.");
        process.exit(1);
    }
    console.log(`대상 완제품: ${mainProduct} (Name: ${parts[mainProduct]?.Name || 'Unknown'})`);

    const updateInventory = async (partId, changeQty, reason) => {
        inventory[partId] = (inventory[partId] || 0) + changeQty;
        // DB 반영
        const q = query(collection(db, 'inventory'), where('PartID', '==', partId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, 'inventory', snap.docs[0].id), { Quantity: inventory[partId] });
        } else {
            await addDoc(collection(db, 'inventory'), { PartID: partId, Quantity: inventory[partId], UpdatedAt: new Date(currentDate) });
        }
        await addDoc(collection(db, 'inventory_transactions'), {
            PartID: partId, ChangeQty: changeQty, FinalQty: inventory[partId], Reason: reason, Date: new Date(currentDate)
        });
        console.log(`[재고 갱신] ${partId}: ${changeQty > 0 ? '+' : ''}${changeQty} => ${inventory[partId]} (${reason})`);
    };

    // Calculate BOM requirements recursively
    const calculateRequirements = (partId, qty) => {
        let reqs = {};
        const items = bom[partId] || [];
        if (items.length === 0) {
            reqs[partId] = qty; // 원자재
            return reqs;
        }
        items.forEach(item => {
            const childReqs = calculateRequirements(item.ChildID, qty * item.Quantity);
            for (let [id, amount] of Object.entries(childReqs)) {
                reqs[id] = (reqs[id] || 0) + amount;
            }
        });
        return reqs;
    };

    // Simulation Loop (60 Days)
    for (let day = 0; day <= 60; day++) {
        console.log(`\n--- Day ${day} : ${currentDate.toISOString().split('T')[0]} ---`);

        // A. 안전 재고 체크 (완제품당 20EA)
        if (day % 7 === 0) {
            const currentStock = inventory[mainProduct] || 0;
            const inProgressPR = prQueue.filter(p => p.PartID === mainProduct && p.Status !== 'COMPLETED').reduce((sum, p) => sum + p.TargetQty, 0);
            
            if (currentStock + inProgressPR < 20) {
                const needed = 20 - (currentStock + inProgressPR);
                console.log(`[생산계획] ${mainProduct} 안전재고 부족. 생산의뢰 생성 (+${needed})`);
                const prRef = doc(collection(db, 'production_requests'));
                const prData = {
                    PRNumber: `PR-INT-${day}-${Date.now()}`,
                    PartID: mainProduct,
                    TargetQty: needed,
                    Status: 'WAITING_FOR_PARTS',
                    Urgent: false,
                    Type: 'Internal',
                    CreatedAt: new Date(currentDate)
                };
                await setDoc(prRef, prData);
                prQueue.push({ id: prRef.id, ...prData });
            }
        }

        // B. 영업 부서 수주 (Random Orders)
        if (day === 10) {
            console.log(`[영업] 신규 고객사 수주 (소량): 5 EA`);
            const prRef = doc(collection(db, 'production_requests'));
            const prData = {
                PRNumber: `PR-SALES-10-${Date.now()}`,
                PartID: mainProduct,
                TargetQty: 5,
                CustomerName: 'Simulated Corp A',
                Status: 'WAITING_FOR_PARTS',
                CreatedAt: new Date(currentDate)
            };
            await setDoc(prRef, prData);
            prQueue.push({ id: prRef.id, ...prData });
        }

        if (day === 30) {
            console.log(`[영업] 신규 고객사 수주 (대량 - 재고 부족 유발): 100 EA`);
            const prRef = doc(collection(db, 'production_requests'));
            const prData = {
                PRNumber: `PR-SALES-30-${Date.now()}`,
                PartID: mainProduct,
                TargetQty: 100,
                CustomerName: 'Simulated Big Corp',
                Status: 'WAITING_FOR_PARTS',
                CreatedAt: new Date(currentDate)
            };
            await setDoc(prRef, prData);
            prQueue.push({ id: prRef.id, ...prData });
        }

        // C. 구매 입고 확인 및 QA 검사 대기
        for (let i = poQueue.length - 1; i >= 0; i--) {
            const po = poQueue[i];
            if (po.Status === 'ORDERING' && day > po.orderDay + 1) { // 1일 뒤 기안결재 완료
                console.log(`[구매] 발주 기안 승인 및 업체 전송 완료 (${po.PONumber})`);
                po.Status = 'WAITING_DELIVERY';
                await updateDoc(doc(db, 'purchase_orders', po.id), { Status: 'WAITING_DELIVERY', ApprovedAt: new Date(currentDate) });
            } else if (po.Status === 'WAITING_DELIVERY' && day >= po.etaDay) {
                console.log(`[입고] 자재 도착! 입고 검사 대기열 추가 (${po.PartID}, Qty: ${po.Qty})`);
                const recRef = doc(collection(db, 'receiving'));
                await setDoc(recRef, { PartID: po.PartID, ReceivedQty: po.Qty, Status: 'PENDING', ReceivedAt: new Date(currentDate) });
                receivingQueue.push({ id: recRef.id, PartID: po.PartID, Qty: po.Qty, inspectDay: day + 1 });
                po.Status = 'COMPLETED';
                await updateDoc(doc(db, 'purchase_orders', po.id), { Status: 'COMPLETED' });
            }
        }

        // D. 입고 검사 (QA)
        for (let i = receivingQueue.length - 1; i >= 0; i--) {
            const rec = receivingQueue[i];
            if (day >= rec.inspectDay) {
                console.log(`[입고검사] QA 합격. 재고 적재 완료 (${rec.PartID}, Qty: ${rec.Qty})`);
                await updateInventory(rec.PartID, rec.Qty, '입고 적재');
                await updateDoc(doc(db, 'receiving', rec.id), { Status: 'PASSED', InspectedAt: new Date(currentDate) });
                receivingQueue.splice(i, 1);
            }
        }

        // E. 생산 의뢰(PR) 자재 확인 및 진행
        for (let pr of prQueue) {
            if (pr.Status === 'WAITING_FOR_PARTS') {
                const reqs = calculateRequirements(pr.PartID, pr.TargetQty);
                let hasAll = true;
                const shortages = [];
                for (let [partId, qty] of Object.entries(reqs)) {
                    if ((inventory[partId] || 0) < qty) {
                        hasAll = false;
                        shortages.push({ partId, short: qty - (inventory[partId] || 0) });
                    }
                }

                if (hasAll) {
                    console.log(`[생산] ${pr.PRNumber} 자재 확보 완료. 재고 차감 및 생산 시작.`);
                    for (let [partId, qty] of Object.entries(reqs)) {
                        await updateInventory(partId, -qty, `생산 투입 (${pr.PRNumber})`);
                    }
                    pr.Status = 'IN_PRODUCTION';
                    pr.finishDay = day + 3; // 3일 소요
                    await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'IN_PRODUCTION' });
                } else {
                    // 자재 부족시 자동 발주 (최초 1회만)
                    if (!pr.ordered) {
                        console.log(`[생산/구매] ${pr.PRNumber} 자재 부족. 구매 부서에 견적/발주 요청!`);
                        pr.ordered = true;
                        for (let s of shortages) {
                            const orderQty = s.short + 50; // 여유분 포함
                            console.log(`[구매] ${s.partId} 견적 요청 및 발주 기안 작성 (수량: ${orderQty})`);
                            const poRef = doc(collection(db, 'purchase_orders'));
                            const poData = {
                                PONumber: `PO-${day}-${Date.now()}`,
                                PartID: s.partId,
                                Qty: orderQty,
                                Status: 'ORDERING',
                                orderDay: day,
                                etaDay: day + 5, // Lead time 5 days
                                CreatedAt: new Date(currentDate)
                            };
                            await setDoc(poRef, poData);
                            poQueue.push({ id: poRef.id, ...poData });
                        }
                    }
                }
            } else if (pr.Status === 'IN_PRODUCTION' && day >= pr.finishDay) {
                console.log(`[생산] ${pr.PRNumber} 생산 완료. 출하/최종 검사(QA) 대기.`);
                pr.Status = 'QA_WAITING';
                await updateDoc(doc(db, 'production_requests', pr.id), { Status: 'QA_WAITING' });
                qaShipQueue.push({ ...pr, inspectDay: day + 1 });
            }
        }

        // F. 출하 / 최종 품질 검사 (QA)
        for (let i = qaShipQueue.length - 1; i >= 0; i--) {
            const qa = qaShipQueue[i];
            if (day >= qa.inspectDay) {
                // 불량 시뮬레이션 (15%)
                if (Math.random() < 0.15 && !qa.reworked) {
                    const defectQty = Math.floor(qa.TargetQty * 0.2) + 1; // 20% 불량
                    console.log(`[출하검사] ${qa.PRNumber} 불량 발생! (불량수량: ${defectQty}). 폐기 및 재작업 지시.`);
                    
                    // 일부 폐기 (Inventory no change, materials lost)
                    // 일부 재작업으로 PR 수량 조정
                    qa.ActualQty = qa.TargetQty - defectQty;
                    qa.reworked = true;
                    qa.inspectDay = day + 2; // 2일 뒤 재검사
                    
                    await updateDoc(doc(db, 'production_requests', qa.id), { 
                        DefectQty: defectQty, 
                        ActualQty: qa.ActualQty,
                        DefectReason: '시뮬레이션 불량 (치수 오류)'
                    });
                    await addDoc(collection(db, 'qa_shipping_inspections'), {
                        PRNumber: qa.PRNumber,
                        Result: 'Fail',
                        DefectQty: defectQty,
                        CreatedAt: new Date(currentDate)
                    });
                } else {
                    const finalQty = qa.ActualQty || qa.TargetQty;
                    console.log(`[출하검사] ${qa.PRNumber} 최종 합격. (완제품 적재: ${finalQty} EA) => 출하 대기`);
                    await updateInventory(qa.PartID, finalQty, `생산 완료 (${qa.PRNumber})`);
                    
                    const prToUpdate = prQueue.find(p => p.id === qa.id);
                    if (prToUpdate) prToUpdate.Status = 'COMPLETED';
                    
                    await updateDoc(doc(db, 'production_requests', qa.id), { Status: 'COMPLETED', CompletedAt: new Date(currentDate) });
                    await addDoc(collection(db, 'qa_shipping_inspections'), {
                        PRNumber: qa.PRNumber,
                        Result: 'Pass',
                        PassedQty: finalQty,
                        CreatedAt: new Date(currentDate)
                    });
                    qaShipQueue.splice(i, 1);
                }
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log("\n>>> 시뮬레이션 종료 <<<");
    console.log("최종 완제품 재고:", inventory[mainProduct] || 0);
    process.exit(0);
}

runSimulation();
