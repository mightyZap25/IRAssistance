import pg from 'pg';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db_config.json'), 'utf8'));

// Initialize Postgres Client
const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
});

// Helper functions for Database mimicking mockFirebase
async function getDocs(collectionName) {
    const res = await pool.query(`SELECT data FROM "${collectionName}"`);
    return res.rows.map(r => r.data);
}

async function setDoc(collectionName, id, data) {
    const finalData = { ...data, id };
    await pool.query(
        `INSERT INTO "${collectionName}" (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = $2`,
        [id, JSON.stringify(finalData)]
    );
}

async function addDoc(collectionName, data) {
    const id = 'auto_' + Math.random().toString(36).substr(2, 9);
    const finalData = { ...data, id };
    await pool.query(
        `INSERT INTO "${collectionName}" (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = $2`,
        [id, JSON.stringify(finalData)]
    );
    return { id, ...data };
}

async function updateDoc(collectionName, id, data) {
    const res = await pool.query(`SELECT data FROM "${collectionName}" WHERE id = $1`, [id]);
    const existing = res.rows.length > 0 ? res.rows[0].data : {};
    const finalData = { ...existing, ...data };
    await pool.query(
        `INSERT INTO "${collectionName}" (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = $2`,
        [id, JSON.stringify(finalData)]
    );
}

async function runSimulation() {
    console.log(">>> [PostgreSQL] 로깅 시스템 탑재 2개월 종합 비즈니스 시뮬레이션 시작 <<<");
    const simulationLogs = [];

    const logEvent = (level, day, dateStr, message, detail = {}) => {
        const logMsg = `[Day ${day} | ${dateStr}] [${level}] ${message}`;
        console.log(logMsg);
        simulationLogs.push({
            timestamp: new Date(),
            day,
            date: dateStr,
            level,
            message,
            detail
        });
    };

    let currentDate = new Date('2026-06-11');
    const prQueue = [];
    const poQueue = [];
    const receivingQueue = [];
    const qaShipQueue = [];

    // Load Initial Data
    const partsList = await getDocs('parts');
    const bomList = await getDocs('bom');
    const inventoryList = await getDocs('inventory');

    const parts = {};
    partsList.forEach(p => parts[p.PartID] = p);

    const bom = {}; // ParentID -> Array of { ChildID, Quantity }
    const childSet = new Set();
    bomList.forEach(b => {
        const parentID = b.ParentID;
        if (!bom[parentID]) bom[parentID] = [];
        bom[parentID].push(b);
        childSet.add(b.ChildID);
    });

    const inventory = {}; // PartID -> Qty
    inventoryList.forEach(i => {
        inventory[i.PartID] = (inventory[i.PartID] || 0) + (i.OnHand || i.Quantity || 0);
    });

    // Find main product
    let finishedGoods = Object.keys(bom).filter(p => !childSet.has(p));
    if (finishedGoods.length === 0) {
        finishedGoods = Object.keys(bom);
    }
    const mainProduct = finishedGoods[0];
    
    if (!mainProduct) {
        console.error("테스트할 부품/BOM이 없습니다. DB 상태를 확인하세요.");
        process.exit(1);
    }
    logEvent("SYSTEM", 0, '2026-06-11', `대상 완제품 선정 완료: ${mainProduct} (${parts[mainProduct]?.Name || 'Unknown'})`);

    const updateInventory = async (partId, changeQty, reason) => {
        const oldQty = inventory[partId] || 0;
        inventory[partId] = oldQty + changeQty;
        
        // DB 반영
        const res = await pool.query(`SELECT id, data FROM "inventory"`);
        const targetRow = res.rows.find(r => r.data.PartID === partId);
        
        if (targetRow) {
            const updatedData = { ...targetRow.data, OnHand: inventory[partId], LastUpdated: new Date(currentDate) };
            await pool.query(`UPDATE "inventory" SET data = $1 WHERE id = $2`, [JSON.stringify(updatedData), targetRow.id]);
        } else {
            const newId = 'auto_' + Math.random().toString(36).substr(2, 9);
            await pool.query(
                `INSERT INTO "inventory" (id, data) VALUES ($1, $2)`,
                [newId, JSON.stringify({ PartID: partId, OnHand: inventory[partId], LastUpdated: new Date(currentDate) })]
            );
        }

        // 트랜잭션 기록
        await addDoc('transactions', {
            PartID: partId,
            Type: changeQty > 0 ? 'IN' : 'OUT',
            Qty: Math.abs(changeQty),
            Reason: reason,
            Date: new Date(currentDate)
        });

        logEvent("INVENTORY", dayCounter, currentDate.toISOString().split('T')[0], 
            `[재고 변동] 품목 ${partId}: ${oldQty} -> ${inventory[partId]} (${changeQty > 0 ? '+' : ''}${changeQty} EA, 사유: ${reason})`, 
            { partId, oldQty, newQty: inventory[partId], changeQty, reason }
        );
    };

    const calculateRequirements = (partId, qty) => {
        let reqs = {};
        const items = bom[partId] || [];
        if (items.length === 0) {
            reqs[partId] = qty;
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

    let dayCounter = 0;
    // Simulation Loop (60 Days)
    for (dayCounter = 0; dayCounter <= 60; dayCounter++) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // A. 안전 재고 체크 (완제품당 20EA)
        if (dayCounter % 7 === 0) {
            const currentStock = inventory[mainProduct] || 0;
            const inProgressPR = prQueue.filter(p => p.PartID === mainProduct && p.Status !== 'COMPLETED').reduce((sum, p) => sum + p.TargetQty, 0);
            
            if (currentStock + inProgressPR < 20) {
                const needed = 20 - (currentStock + inProgressPR);
                const prNumber = `PR-INT-${dayCounter}-${Date.now()}`;
                logEvent("PLANNING", dayCounter, dateStr, `안전재고 부족 감지 (현재고: ${currentStock}, 진행중: ${inProgressPR}). 생산의뢰 ${prNumber} 생성 (+${needed} EA)`);
                
                const newId = 'auto_pr_' + Math.random().toString(36).substr(2, 9);
                const prData = {
                    PRNumber: prNumber,
                    PartID: mainProduct,
                    PartName: parts[mainProduct]?.Name || 'Product',
                    TargetQty: needed,
                    Status: 'WAITING_FOR_PARTS',
                    Urgent: false,
                    Type: 'Internal',
                    CreatedAt: new Date(currentDate)
                };
                await setDoc('production_requests', newId, prData);
                prQueue.push({ id: newId, ...prData });
            }
        }

        // B. 영업 부서 수주 (Random Orders)
        if (dayCounter === 10) {
            const prNumber = `PR-SALES-10-${Date.now()}`;
            logEvent("SALES", dayCounter, dateStr, `신규 고객사(Simulated Corp A) 소량 주문 접수. 생산의뢰 ${prNumber} 발행 (수량: 5 EA)`);
            const newId = 'auto_pr_' + Math.random().toString(36).substr(2, 9);
            const prData = {
                PRNumber: prNumber,
                PartID: mainProduct,
                PartName: parts[mainProduct]?.Name || 'Product',
                TargetQty: 5,
                CustomerName: 'Simulated Corp A',
                Status: 'WAITING_FOR_PARTS',
                CreatedAt: new Date(currentDate)
            };
            await setDoc('production_requests', newId, prData);
            prQueue.push({ id: newId, ...prData });
        }

        if (dayCounter === 30) {
            const prNumber = `PR-SALES-30-${Date.now()}`;
            logEvent("SALES", dayCounter, dateStr, `신규 고객사(Simulated Big Corp) 대량 주문 접수. 생산의뢰 ${prNumber} 발행 (수량: 100 EA, 재고 부족 유발 시나리오)`);
            const newId = 'auto_pr_' + Math.random().toString(36).substr(2, 9);
            const prData = {
                PRNumber: prNumber,
                PartID: mainProduct,
                PartName: parts[mainProduct]?.Name || 'Product',
                TargetQty: 100,
                CustomerName: 'Simulated Big Corp',
                Status: 'WAITING_FOR_PARTS',
                CreatedAt: new Date(currentDate)
            };
            await setDoc('production_requests', newId, prData);
            prQueue.push({ id: newId, ...prData });
        }

        // C. 구매 입고 확인 및 QA 검사 대기
        for (let i = poQueue.length - 1; i >= 0; i--) {
            const po = poQueue[i];
            if (po.Status === 'ORDERING' && dayCounter > po.orderDay + 1) {
                logEvent("PURCHASING", dayCounter, dateStr, `발주서 ${po.PONumber} 기안 승인 완료 및 이메일 모의 전송 (Status -> WAITING_DELIVERY)`);
                po.Status = 'WAITING_DELIVERY';
                await updateDoc('purchasing', po.id, { Status: 'WAITING_DELIVERY', ApprovedAt: new Date(currentDate) });
            } else if (po.Status === 'WAITING_DELIVERY' && dayCounter >= po.etaDay) {
                logEvent("WAREHOUSE", dayCounter, dateStr, `발주품 자재(품번: ${po.PartID}, 수량: ${po.Qty} EA) 현장 입고 완료. 입고 검사(QA) 대기열 이송.`);
                const recRes = await addDoc('receiving', { PartID: po.PartID, ReceivedQty: po.Qty, Status: 'PENDING', ReceivedAt: new Date(currentDate) });
                receivingQueue.push({ id: recRes.id, PartID: po.PartID, Qty: po.Qty, inspectDay: dayCounter + 1 });
                po.Status = 'COMPLETED';
                await updateDoc('purchasing', po.id, { Status: 'COMPLETED' });
            }
        }

        // D. 입고 검사 (QA)
        for (let i = receivingQueue.length - 1; i >= 0; i--) {
            const rec = receivingQueue[i];
            if (dayCounter >= rec.inspectDay) {
                logEvent("QA", dayCounter, dateStr, `자재 수입 검사 통과: ${rec.PartID} (${rec.Qty} EA). 창고 적재 및 원장 재고 입고 갱신.`);
                await updateInventory(rec.PartID, rec.Qty, '입고 적재');
                await updateDoc('receiving', rec.id, { Status: 'PASSED', InspectedAt: new Date(currentDate) });
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
                    logEvent("PRODUCTION", dayCounter, dateStr, `생산 의뢰 ${pr.PRNumber} 자재 확보 성공. 원자재 출고 차감 후 생산라인 투입 (Status -> IN_PRODUCTION)`);
                    for (let [partId, qty] of Object.entries(reqs)) {
                        await updateInventory(partId, -qty, `생산 투입 (${pr.PRNumber})`);
                    }
                    pr.Status = 'IN_PRODUCTION';
                    pr.finishDay = dayCounter + 3; // 3일 소요
                    await updateDoc('production_requests', pr.id, { Status: 'IN_PRODUCTION' });
                } else {
                    if (!pr.ordered) {
                        logEvent("PLANNING", dayCounter, dateStr, `생산 의뢰 ${pr.PRNumber} 자재 부족 발생. 부족량에 따른 구매 조달 발주 기안 작성.`);
                        pr.ordered = true;
                        for (let s of shortages) {
                            const orderQty = s.short + 50; // 여유분 포함
                            const poNumber = `PO-${dayCounter}-${Date.now()}`;
                            logEvent("PURCHASING", dayCounter, dateStr, `[BOM 부족 자재 조달] 발주서 ${poNumber} 작성 (품목: ${s.partId}, 수량: ${orderQty} EA)`);
                            
                            const poRes = await addDoc('purchasing', {
                                PONumber: poNumber,
                                PartID: s.partId,
                                PartName: parts[s.partId]?.Name || 'Component',
                                Qty: orderQty,
                                Status: 'ORDERING',
                                orderDay: dayCounter,
                                etaDay: dayCounter + 5,
                                CreatedAt: new Date(currentDate)
                            });
                            poQueue.push({ id: poRes.id, ...poRes, orderDay: dayCounter, etaDay: dayCounter + 5 });
                        }
                    }
                }
            } else if (pr.Status === 'IN_PRODUCTION' && dayCounter >= pr.finishDay) {
                logEvent("PRODUCTION", dayCounter, dateStr, `생산 의뢰 ${pr.PRNumber} 제조 조립 공정 완료. 완제품 출하 검사(QA) 대기열 이송.`);
                pr.Status = 'QA_WAITING';
                await updateDoc('production_requests', pr.id, { Status: 'QA_WAITING' });
                qaShipQueue.push({ ...pr, inspectDay: dayCounter + 1 });
            }
        }

        // F. 출하 / 최종 품질 검사 (QA)
        for (let i = qaShipQueue.length - 1; i >= 0; i--) {
            const qa = qaShipQueue[i];
            if (dayCounter >= qa.inspectDay) {
                if (Math.random() < 0.15 && !qa.reworked) {
                    const defectQty = Math.floor(qa.TargetQty * 0.2) + 1;
                    logEvent("QA", dayCounter, dateStr, `출하 검사 중 품질 부적합 검출 (${qa.PRNumber}). 불량 수량: ${defectQty} EA. 생산 부서에 재작업/보완 지시.`);
                    
                    qa.ActualQty = qa.TargetQty - defectQty;
                    qa.reworked = true;
                    qa.inspectDay = dayCounter + 2;
                    
                    await updateDoc('production_requests', qa.id, { 
                        DefectQty: defectQty, 
                        ActualQty: qa.ActualQty,
                        DefectReason: '시뮬레이션 불량 (치수 오류)'
                    });
                    await addDoc('qa_shipping_inspections', {
                        PRNumber: qa.PRNumber,
                        Result: 'Fail',
                        DefectQty: defectQty,
                        CreatedAt: new Date(currentDate)
                    });
                } else {
                    const finalQty = qa.ActualQty || qa.TargetQty;
                    logEvent("QA", dayCounter, dateStr, `출하 검사 적합 판정 (${qa.PRNumber}). 완제품 적재 승인 (수량: ${finalQty} EA)`);
                    await updateInventory(qa.PartID, finalQty, `생산 완료 (${qa.PRNumber})`);
                    
                    const prToUpdate = prQueue.find(p => p.id === qa.id);
                    if (prToUpdate) prToUpdate.Status = 'COMPLETED';
                    
                    await updateDoc('production_requests', qa.id, { Status: 'COMPLETED', CompletedAt: new Date(currentDate) });
                    await addDoc('qa_shipping_inspections', {
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

    logEvent("SYSTEM", dayCounter, currentDate.toISOString().split('T')[0], `시뮬레이션 정상 완료. 최종 완제품 재고량: ${inventory[mainProduct] || 0} EA`);
    
    // 시뮬레이션 로그 파일 저장
    fs.writeFileSync(
        path.join(process.cwd(), 'scratch', 'simulation_detailed_log.json'), 
        JSON.stringify(simulationLogs, null, 4), 
        'utf8'
    );
    console.log(`[완료] 시뮬레이션 실행 로그 저장 완료 (위치: scratch/simulation_detailed_log.json)`);

    await pool.end();
    process.exit(0);
}

runSimulation();
