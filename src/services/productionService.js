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
     * 여러 품목을 순차적으로 차감하며 전체 가용성을 체크합니다.
     * @param {Array} items - 생산 요청 제품 목록 [{ PartID, TargetQty, ... }]
     * @param {Object} inventory - 현재고 맵
     * @param {Object} reservedMap - 타 공정 예약 맵
     * @param {Object} bomMap - BOM 데이터 맵
     */
    checkMultiItemAvailability: (items, inventory, reservedMap, bomMap) => {
        // 1. 가상 가용 재고 맵 생성 (OnHand - Reserved)
        const virtualInventory = {};
        Object.keys(inventory).forEach(id => {
            virtualInventory[id] = Math.max(0, Number(inventory[id] || 0) - Number(reservedMap[id] || 0));
        });

        // 2. 자재 소요량을 재귀적으로 계산하고 가상 재고에서 차감하는 내부 함수
        const deductMaterials = (partID, qty, currentInv) => {
            const available = Number(currentInv[partID] || 0);
            const useFromStock = Math.min(available, qty);
            
            // 현재고 차감
            currentInv[partID] = available - useFromStock;
            const remainingNeeded = qty - useFromStock;

            // 재고로 모두 충당된 경우
            if (remainingNeeded <= 0) return [];

            const bomItems = bomMap[partID] || [];
            
            // BOM이 없는 경우 (최하위 부품인데 재고가 부족한 상태)
            if (bomItems.length === 0) {
                return [{ 
                    id: partID, 
                    req: qty, 
                    has: available, 
                    short: remainingNeeded 
                }];
            }

            // 조립품인 경우 부족한 수량(remainingNeeded)만큼 하위로 전파
            const shortages = [];
            bomItems.forEach(bom => {
                const childID = bom.ChildID;
                const unitQty = Number(bom.Quantity || bom.qty || 1);
                const totalChildNeeded = remainingNeeded * unitQty;
                const childShorts = deductMaterials(childID, totalChildNeeded, currentInv);
                shortages.push(...childShorts);
            });

            return shortages;
        };

        // 3. 아이템별 순차 처리
        const results = items.map(item => {
            // 현재 아이템 생산 시도 전의 가상 재고 복사본으로 가용성 판단 (이전 단계들에서 차감된 상태임)
            const shortages = deductMaterials(item.PartID, item.TargetQty, virtualInventory);
            
            return {
                ...item,
                ok: shortages.length === 0,
                shortages: shortages
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
