import xmlrpc from 'xmlrpc';

const HOST = '100.67.238.32';
const PORT = 8069;
const DB = 'odoo';
const UID = 2;
const PASSWORD = 'jogak0622#';

function execute_kw(model, method, args, kwargs = {}) {
    return new Promise((resolve, reject) => {
        const client = xmlrpc.createClient({ host: HOST, port: PORT, path: '/xmlrpc/2/object' });
        client.methodCall('execute_kw', [DB, UID, PASSWORD, model, method, args, kwargs], (error, value) => {
            if (error) reject(new Error(error.message));
            else resolve(value);
        });
    });
}

async function deleteAllProducts() {
    console.log('=== Odoo 품목 전체 삭제 시작 ===\n');

    // 1. 모든 product.template ID 조회
    console.log('[1/4] 모든 품목 ID 조회 중...');
    const products = await execute_kw('product.template', 'search_read', [
        [],
        ['id', 'name', 'default_code', 'bom_ids']
    ]);
    console.log(`    → 총 ${products.length}개 품목 발견\n`);
    if (products.length === 0) {
        console.log('삭제할 품목이 없습니다.');
        return;
    }

    // 2. 연결된 BOM 삭제
    const bomIds = new Set();
    for (const p of products) {
        if (p.bom_ids && p.bom_ids.length > 0) {
            p.bom_ids.forEach(id => bomIds.add(id));
        }
    }
    const bomArray = Array.from(bomIds);
    if (bomArray.length > 0) {
        console.log(`[2/4] 연결된 BOM ${bomArray.length}개 삭제 중...`);
        try {
            const delBoms = await execute_kw('mrp.bom', 'unlink', [bomArray]);
            console.log(`    → BOM 삭제 결과: ${delBoms}\n`);
        } catch (e) {
            console.warn(`    ⚠ BOM 삭제 실패 (무시하고 계속): ${e.message}\n`);
        }
    } else {
        console.log('[2/4] 연결된 BOM 없음, 건너뜀\n');
    }

    // 3. product.product (variant) 삭제 시도
    console.log('[3/4] product.product (변형 품목) 삭제 중...');
    try {
        const variantIds = await execute_kw('product.product', 'search', [[]], { limit: 0 });
        if (variantIds.length > 0) {
            const delVariants = await execute_kw('product.product', 'unlink', [variantIds]);
            console.log(`    → 변형 품목 ${variantIds.length}개 삭제 결과: ${delVariants}\n`);
        } else {
            console.log('    → 변형 품목 없음\n');
        }
    } catch (e) {
        console.warn(`    ⚠ 변형 품목 삭제 실패 (무시하고 계속): ${e.message}\n`);
    }

    // 4. product.template 전체 삭제 (배치로 처리)
    const allIds = products.map(p => p.id);
    const BATCH_SIZE = 100;
    console.log(`[4/4] product.template ${allIds.length}개 삭제 중... (배치 크기: ${BATCH_SIZE})`);

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        try {
            await execute_kw('product.template', 'unlink', [batch]);
            successCount += batch.length;
            process.stdout.write(`\r    → 진행: ${successCount + failCount}/${allIds.length} (성공: ${successCount}, 실패: ${failCount})`);
        } catch (e) {
            // 배치 실패 시 개별 삭제 시도
            for (const id of batch) {
                try {
                    await execute_kw('product.template', 'unlink', [[id]]);
                    successCount++;
                } catch (e2) {
                    failCount++;
                    console.log(`\n    ✗ ID ${id} 삭제 실패: ${e2.message}`);
                }
                process.stdout.write(`\r    → 진행: ${successCount + failCount}/${allIds.length} (성공: ${successCount}, 실패: ${failCount})`);
            }
        }
    }

    console.log(`\n\n=== 완료 ===`);
    console.log(`성공: ${successCount}개 / 실패: ${failCount}개`);
    if (failCount > 0) {
        console.log('⚠ 일부 품목은 판매주문/구매주문 등에 연결되어 삭제 불가합니다.');
    }
}

deleteAllProducts().catch(console.error);
