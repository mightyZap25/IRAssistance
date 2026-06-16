import { db, collection, getDocs, query, where, orderBy } from '../firebase';

/**
 * 전사 자재 가용성 및 예약 로직 통합 서비스
 */
export const productionService = {
    /**
     * 현재 진행 중인 모든 생산 의뢰로부터 자재별 예약 수량을 계산합니다.
     * 상위 어셈블리 재고가 있는 경우 하위 자재 예약에서 제외합니다.
     * @param {string} excludePRId - 계산에서 제외할 PR ID (상세 페이지용)
     */
    fetchReservedMap: async (excludePRId = null) => {
        try {
            // 예약 대상 상태 확대: 의뢰확정(CONFIRMED) ~ 출하준비(SHIP_READY)
            const activeStatuses = [
                'CONFIRMED', 'WAITING_FOR_PARTS', 'PROD_WAITING', 
                'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 
                'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'
            ];

            const [prSnap, bomSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'production_requests'), where('Status', 'in', activeStatuses))),
                getDocs(collection(db, 'bom')),
                getDocs(collection(db, 'inventory'))
            ]);

            const bomMap = {};
            bomSnap.docs.forEach(d => {
                const data = d.data();
                const parentID = (data.ParentID || '').trim().toUpperCase();
                if (!bomMap[parentID]) bomMap[parentID] = [];
                bomMap[parentID].push({
                    ...data,
                    ChildID: (data.ChildID || '').trim().toUpperCase()
                });
            });

            const inventory = {};
            invSnap.docs.forEach(d => { 
                const partID = (d.data().PartID || '').trim().toUpperCase();
                inventory[partID] = Number(d.data().OnHand || 0); 
            });

            const prs = prSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(pr => pr.id !== excludePRId);

            return productionService.calculateReservedMap(prs, bomMap, inventory);
        } catch (error) {
            console.error("Error calculating reserved map:", error);
            return {};
        }
    },

    /**
     * 주어진 PR 목록과 BOM, 재고 데이터를 바탕으로 예약 수량을 계산합니다. (계산형)
     * 상위 품목의 재고를 먼저 소진하고, 부족한 수량에 대해서만 하위 BOM을 전개합니다.
     */
    calculateReservedMap: (prs, bomMap, inventory) => {
        const reserved = {};
        const virtualInv = {};
        
        // 초기 가상 재고 설정 (ID 정규화)
        Object.entries(inventory).forEach(([id, qty]) => {
            virtualInv[id.toUpperCase()] = Number(qty || 0);
        });
        
        const processRequirement = (parentID, qty) => {
            const pid = (parentID || '').trim().toUpperCase();
            if (qty <= 0 || !pid) return;

            const availableInInv = Number(virtualInv[pid] || 0);
            const takenFromInv = Math.min(availableInInv, qty);
            
            // 1. 현재고에서 가능한 만큼 예약 (가상 차감)
            if (takenFromInv > 0) {
                virtualInv[pid] -= takenFromInv;
                reserved[pid] = (reserved[pid] || 0) + takenFromInv;
            }
            
            const remainingToProduce = qty - takenFromInv;
            
            // 2. 재고가 부족하여 생산이 필요한 경우에만 하위 BOM 전개
            if (remainingToProduce > 0) {
                const children = bomMap[pid] || [];
                children.forEach(child => {
                    const childID = (child.ChildID || '').trim().toUpperCase();
                    const unitQty = Number(child.Quantity || child.qty || 1);
                    const totalChildNeeded = unitQty * remainingToProduce;
                    processRequirement(childID, totalChildNeeded);
                });
            }
        };

        // 주문일(CreatedAt) 순서로 정렬하여 선입선출식 재고 할당 시뮬레이션
        const sortedPRs = [...prs].sort((a, b) => {
            const timeA = a.CreatedAt?.toMillis?.() || 0;
            const timeB = b.CreatedAt?.toMillis?.() || 0;
            return timeA - timeB;
        });

        sortedPRs.forEach(pr => {
            const items = pr.Items && Array.isArray(pr.Items) ? pr.Items : [{ PartID: pr.PartID, TargetQty: pr.TargetQty || pr.qty }];
            items.forEach(item => {
                processRequirement(item.PartID, Number(item.TargetQty || 0));
            });
        });

        return reserved;
    },

    /**
     * 특정 부품의 전체 계층적 BOM 트리를 생성합니다.
     */
    buildBOMTree: (rootPartID, bomDataByParent, partsFullMap) => {
        const buildNode = (parentID) => {
            const pid = (parentID || '').trim().toUpperCase();
            const partInfo = partsFullMap[pid] || { PartID: pid, Name: pid };
            const children = bomDataByParent[pid] || [];
            return {
                ...partInfo,
                PartID: pid,
                Name: partInfo.Name || pid,
                Quantity: 1,
                Children: children.map(child => {
                    const childNode = buildNode(child.ChildID);
                    return {
                        ...childNode,
                        Quantity: Number(child.Quantity || child.qty || 1)
                    };
                })
            };
        };
        return buildNode(rootPartID);
    },

    /**
     * 재귀적으로 생산 가능 여부와 부족 자재를 체크합니다.
     */
    checkProductionStatus: (partID, targetQty, inventory, reservedMap, bomMap) => {
        const stock = Number(inventory[partID] || 0);
        const reserved = Number(reservedMap[partID] || 0);
        const availableStock = Math.max(0, stock - reserved);

        const neededToMake = Math.max(0, targetQty - availableStock);
        
        if (neededToMake === 0) {
            return { ok: true, canMake: targetQty, shortage: 0, shortages: [] };
        }

        const bomItems = bomMap[partID] || [];
        if (bomItems.length === 0) {
            return { 
                ok: false, 
                canMake: availableStock, 
                shortage: neededToMake, 
                shortages: [{ id: partID, req: targetQty, has: availableStock }] 
            };
        }

        let maxCanMakeFromComponents = Infinity;
        let childShortages = [];

        bomItems.forEach(bom => {
            const childID = bom.ChildID;
            const qtyPerParent = Number(bom.Quantity || bom.qty || 1);
            const totalChildNeeded = neededToMake * qtyPerParent;
            
            const childStatus = productionService.checkProductionStatus(childID, totalChildNeeded, inventory, reservedMap, bomMap);
            const possibleParents = Math.floor(childStatus.canMake / qtyPerParent);
            maxCanMakeFromComponents = Math.min(maxCanMakeFromComponents, possibleParents);
            
            if (!childStatus.ok) {
                childShortages.push(...childStatus.shortages);
            }
        });

        const actualMade = Math.min(neededToMake, maxCanMakeFromComponents);
        const totalCanFulfill = availableStock + actualMade;
        const finalShortage = targetQty - totalCanFulfill;

        const uniqueShortages = [];
        const sMap = {};
        childShortages.forEach(s => {
            if (!sMap[s.id]) {
                sMap[s.id] = { ...s };
                uniqueShortages.push(sMap[s.id]);
            } else {
                sMap[s.id].req += s.req;
            }
        });

        return {
            ok: finalShortage === 0,
            canMake: totalCanFulfill,
            shortage: finalShortage,
            shortages: uniqueShortages
        };
    },

    /**
     * 전사 생산 대기열을 시뮬레이션하여 특정 PR의 위치와 전체 누적 부족분을 산출합니다.
     * @param {string} targetPRId - 상세 정보를 확인할 PR ID
     */
    getQueueSimulation: async (targetPRId = null) => {
        try {
            const activeStatuses = [
                'CONFIRMED', 'WAITING_FOR_PARTS', 'PROD_WAITING', 
                'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 
                'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'
            ];

            const [prSnap, bomSnap, invSnap, partsSnap] = await Promise.all([
                getDocs(query(collection(db, 'production_requests'), where('Status', 'in', activeStatuses))),
                getDocs(collection(db, 'bom')),
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'parts'))
            ]);

            const bomMap = {};
            bomSnap.docs.forEach(d => {
                const data = d.data();
                const pid = (data.ParentID || '').toUpperCase();
                if (!bomMap[pid]) bomMap[pid] = [];
                bomMap[pid].push({ ...data, ChildID: (data.ChildID || '').toUpperCase() });
            });

            const inventory = {};
            invSnap.docs.forEach(d => { inventory[(d.data().PartID || '').toUpperCase()] = Number(d.data().OnHand || 0); });

            const partsFullMap = {};
            partsSnap.docs.forEach(d => { partsFullMap[(d.data().PartID || '').toUpperCase()] = d.data(); });

            const prs = prSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // 등록일 순서 정렬 (FIFO)
            const sortedPRs = prs.sort((a, b) => {
                const timeA = a.CreatedAt?.toMillis?.() || (a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0);
                const timeB = b.CreatedAt?.toMillis?.() || (b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0);
                return timeA - timeB;
            });

            const currentInv = { ...inventory };
            const globalCumulativeShortages = {}; // 전사 누적 부족분 { PartID: qty }
            
            let targetPRResult = null;

            // 대기열 순차 처리 시뮬레이션
            sortedPRs.forEach(pr => {
                const prItems = pr.Items && Array.isArray(pr.Items) ? pr.Items : [{
                    PartID: pr.PartID,
                    PartName: pr.PartName,
                    TargetQty: pr.TargetQty || 0
                }];

                // 해당 PR의 품목들을 납기 스케줄 포함하여 펼침
                const flattened = [];
                prItems.forEach(item => {
                    const schedules = item.Schedules && item.Schedules.length > 0 
                        ? item.Schedules 
                        : [{ qty: item.TargetQty || 0 }];
                    schedules.forEach(s => {
                        flattened.push({ ...item, TargetQty: Number(s.qty || 0) });
                    });
                });

                // 자재 가용성 체크 (현재 남은 재고 currentInv에서 차감)
                const result = productionService.checkMultiItemAvailability(flattened, currentInv, {}, bomMap, partsFullMap);
                
                // 전사 누적 부족분 업데이트 (원자재 레벨)
                result.items.forEach(res => {
                    res.shortages.forEach(s => {
                        const sid = s.id.toUpperCase();
                        globalCumulativeShortages[sid] = (globalCumulativeShortages[sid] || 0) + s.short;
                    });
                });

                // 만약 우리가 찾는 PR이라면 시뮬레이션 결과 저장
                if (pr.id === targetPRId) {
                    targetPRResult = {
                        ...pr,
                        simulationItems: result.items
                    };
                }
            });

            return {
                targetPR: targetPRResult,
                globalShortages: globalCumulativeShortages,
                inventorySnapshot: inventory // 초기 재고 상태
            };
        } catch (error) {
            console.error("Queue simulation error:", error);
            return null;
        }
    },

    /**
     * 여러 품목을 순차적으로 차감하며 전체 가용성을 체크합니다.
     * @param {Array} items - 생산 요청 제품 목록 [{ PartID, TargetQty, ... }]
     * @param {Object} inventory - 현재고 맵
     * @param {Object} reservedMap - 타 공정 예약 맵
     * @param {Object} bomMap - BOM 데이터 맵
     */
    checkMultiItemAvailability: (items, inventory, reservedMap, bomMap, partsFullMap = {}) => {
        // 1. 가상 가용 재고 맵 생성 (OnHand - Reserved)
        const virtualInventory = {};
        Object.keys(inventory).forEach(id => {
            virtualInventory[id] = Math.max(0, Number(inventory[id] || 0) - Number(reservedMap[id] || 0));
        });

        // 2. 자재 소요량을 전체 트리 형태로 구성하며 가상 재고에서 차감하는 함수
        const buildFullAvailabilityTree = (partID, qty, currentInv) => {
            const partInfo = partsFullMap[partID] || { PartID: partID, Name: partID };
            const available = Number(currentInv[partID] || 0);
            
            // 현재 품목에서 재고 사용 (상위 품목일 경우)
            const useFromStock = Math.min(available, qty);
            currentInv[partID] = available - useFromStock;
            const remainingNeeded = qty - useFromStock;

            const bomItems = bomMap[partID] || [];
            let children = [];

            if (bomItems.length > 0) {
                children = bomItems.map(bom => {
                    const childID = bom.ChildID;
                    const unitQty = Number(bom.Quantity || bom.qty || 1);
                    // 상위에서 부족한 만큼만 하위 자재가 필요함
                    const totalChildNeeded = remainingNeeded * unitQty;
                    const childNode = buildFullAvailabilityTree(childID, totalChildNeeded, currentInv);
                    return {
                        ...childNode,
                        Quantity: unitQty
                    };
                });
            }

            return {
                ...partInfo,
                PartID: partID,
                Name: partInfo.Name || partID,
                Quantity: 1, // 부모 노드에서 덮어씌움
                Children: children,
                RequiredQty: qty,
                AvailableStock: available,
                Shortage: remainingNeeded
            };
        };

        // 3. 아이템별 순차 처리
        const results = items.map(item => {
            // 처리 전 인벤토리 스냅샷 (UI에서 해당 시점의 재고를 보여주기 위함)
            const inventorySnapshot = { ...virtualInventory };
            
            const bomTree = buildFullAvailabilityTree(item.PartID, item.TargetQty, virtualInventory);
            
            // 단층 부족분 리스트 추출 (노티 및 상태 결정용)
            const flatShortages = [];
            const collectShortages = (node) => {
                if (!node) return;
                // 하위 자재가 없는 '원자재' 레벨에서 실제 부족분 체크
                if (node.Shortage > 0 && (!node.Children || node.Children.length === 0)) {
                    flatShortages.push({
                        id: node.PartID,
                        req: node.RequiredQty,
                        has: node.AvailableStock,
                        short: node.Shortage
                    });
                }
                if (node.Children) {
                    node.Children.forEach(collectShortages);
                }
            };
            collectShortages(bomTree);

            return {
                ...item,
                ok: flatShortages.length === 0,
                shortages: flatShortages,
                bomTree: bomTree,
                inventorySnapshot: inventorySnapshot
            };
        });

        return {
            ok: results.every(r => r.ok),
            items: results
        };
    },

    /**
     * 완제품/조립품 생산을 위해 '구매'가 필요한 부품 리스트를 산출합니다.
     * (가용 재고를 우선 차감한 후 부족분에 대해 BOM 전개)
     */
    calculatePurchaseNeeds: async (partID, targetQty, db) => {
        const { getDocs, collection } = await import('../firebase');
        
        const [invSnap, allBomSnap, partsSnap] = await Promise.all([
            getDocs(collection(db, 'inventory')),
            getDocs(collection(db, 'bom')),
            getDocs(collection(db, 'parts'))
        ]);

        const inventory = {};
        invSnap.docs.forEach(d => { inventory[d.data().PartID] = d.data().OnHand || 0; });

        const bomDataByParent = {};
        allBomSnap.docs.forEach(d => {
            const data = d.data();
            if (!bomDataByParent[data.ParentID]) bomDataByParent[data.ParentID] = [];
            bomDataByParent[data.ParentID].push(data);
        });

        const partsMap = {};
        partsSnap.docs.forEach(d => { partsMap[d.data().PartID] = d.data(); });

        const purchaseNeeds = []; 
        const virtualInv = { ...inventory };

        const analyze = (id, req) => {
            const part = partsMap[id];
            const onHand = virtualInv[id] || 0;
            const useFromStock = Math.min(onHand, req);
            
            virtualInv[id] -= useFromStock;
            const remaining = req - useFromStock;

            if (remaining > 0) {
                const children = bomDataByParent[id];
                // 조립품이거나 생산 방식인 경우 더 전개 (구매 방식이 아닌 경우)
                if (children && children.length > 0 && part?.ProcessType !== 'Purchase') {
                    children.forEach(child => {
                        analyze(child.ChildID, child.Quantity * remaining);
                    });
                } else {
                    const existing = purchaseNeeds.find(n => n.PartID === id);
                    if (existing) {
                        existing.Qty += remaining;
                    } else {
                        purchaseNeeds.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                            PartID: id,
                            PartName: part?.Name || id,
                            Qty: remaining,
                            UnitPrice: part?.UnitPrice || 0,
                            VendorID: part?.Maker || part?.Manufacturer || ''
                        });
                    }
                }
            }
        };

        analyze(partID, targetQty);
        return purchaseNeeds;
    },

    /**
     * 부족 재고(안전재고 미달) 품목 리스트를 반환합니다.
     */
    getShortageItems: async (db) => {
        const { getDocs, collection } = await import('../firebase');
        const [invSnap, partsSnap] = await Promise.all([
            getDocs(collection(db, 'inventory')),
            getDocs(collection(db, 'parts'))
        ]);

        const inventory = {};
        invSnap.docs.forEach(d => { inventory[d.data().PartID] = d.data().OnHand || 0; });

        const shortages = [];
        partsSnap.docs.forEach(d => {
            const p = d.data();
            const onHand = inventory[p.PartID] || 0;
            const safety = p.SafetyStock || 0;
            
            if (onHand < safety) {
                shortages.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    PartID: p.PartID,
                    PartName: p.Name,
                    Qty: safety - onHand,
                    UnitPrice: p.UnitPrice || 0,
                    VendorID: p.Maker || p.Manufacturer || ''
                });
            }
        });
        return shortages;
    },

    /**
     * 외주 가공을 위해 업체로 '보내야 할' 자재 리스트를 산출합니다.
     * (BOM 상의 직계 하위 자재들)
     */
    /**
     * 설정된 완제품 목표 및 부품별 기준을 바탕으로 전체 부품의 '동적 안전재고'를 계산합니다.
     * @param {Array} fgSettings - 완제품 설정 [{PartID, Threshold}]
     * @param {Object} partSettings - 개별 부품 설정 {PartID: Threshold}
     * @param {Object} db - Firestore 인스턴스
     */
    calculateDynamicSafetyStock: async (fgSettings, partSettings, db) => {
        const { getDocs, collection } = await import('../firebase');
        const allBomSnap = await getDocs(collection(db, 'bom'));

        const bomMap = {};
        allBomSnap.docs.forEach(d => {
            const data = d.data();
            if (!bomMap[data.ParentID]) bomMap[data.ParentID] = [];
            bomMap[data.ParentID].push(data);
        });

        const dynamicSafetyMap = { ...partSettings };

        const calculateRecursive = (id, targetQty) => {
            const children = bomMap[id] || [];
            children.forEach(child => {
                const childID = child.ChildID;
                const needed = (child.Quantity || 1) * targetQty;
                dynamicSafetyMap[childID] = Math.max(dynamicSafetyMap[childID] || 0, needed);
                calculateRecursive(childID, needed);
            });
        };

        fgSettings.forEach(fg => {
            calculateRecursive(fg.PartID, fg.Threshold);
        });

        return dynamicSafetyMap;
    },
};
