
/**
 * 고도화된 예약 재고 계산 로직 검증 테스트
 */

const productionService = {
    calculateReservedMap: (prs, bomMap, inventory) => {
        const reserved = {};
        const virtualInv = {};
        
        // 1. 초기 가상 재고 설정 (ID 정규화 및 중복 합산)
        Object.entries(inventory).forEach(([id, qty]) => {
            const normalizedID = (id || '').trim().toUpperCase();
            if (!normalizedID) return;
            virtualInv[normalizedID] = (virtualInv[normalizedID] || 0) + Number(qty || 0);
        });
        
        const processRequirement = (parentID, qty) => {
            const pid = (parentID || '').trim().toUpperCase();
            if (qty <= 0 || !pid) return;

            const availableInInv = Number(virtualInv[pid] || 0);
            const takenFromInv = Math.min(availableInInv, qty);
            
            // 현재고에서 가능한 만큼 예약 (가상 차감)
            if (takenFromInv > 0) {
                virtualInv[pid] -= takenFromInv;
                reserved[pid] = (reserved[pid] || 0) + takenFromInv;
            }
            
            const remainingToProduce = qty - takenFromInv;
            
            // 재고가 부족하여 생산이 필요한 경우에만 하위 BOM 전개
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

        // 주문일 순서 정렬
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
    }
};

// ────────────── 테스트 시나리오: 극한의 데이터 상황 ──────────────

const testBOM = {
    'IRPA001': [
        { ChildID: 'SUB-A', Quantity: 2 },
        { ChildID: 'PART-1', Quantity: 5 }
    ]
};

const testInventory = {
    'IRPA001': 300,        // 정확한 ID
    'irpa001 ': 200,       // 소문자 + 공백 (합쳐서 500이 되어야 함)
    'SUB-A': 100,
    'PART-1': 1000
};

const testPRs = [
    {
        id: 'PR-1',
        PartID: ' IRPA001', // 공백 포함 요청
        TargetQty: 10,
        CreatedAt: { toMillis: () => 100 }
    }
];

console.log("=== 예약 로직 정규화 테스트 시작 ===");
console.log(`[설정] 완제품 재고 조각들: 'IRPA001'(300), 'irpa001 '(200) -> 총 500 기대`);
console.log(`[설정] 생산 의뢰: ' IRPA001'(10)`);

const result = productionService.calculateReservedMap(testPRs, testBOM, testInventory);

console.log("\n[결과] 예약 내역:", result);

const irpaReserved = result['IRPA001'] || 0;
const subReserved = result['SUB-A'] || 0;

if (irpaReserved === 10 && subReserved === 0) {
    console.log("\n✅ 성공: ID 정규화 및 합산이 정상이며, 상위 재고 우선 사용이 완벽합니다.");
} else {
    console.log("\n❌ 실패: ");
    if (irpaReserved !== 10) console.log(` - 완제품 예약 오류 (결과: ${irpaReserved}, 기대: 10)`);
    if (subReserved !== 0) console.log(` - 하위 자재가 불필요하게 예약됨 (결과: ${subReserved}, 기대: 0)`);
    process.exit(1);
}
