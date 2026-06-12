import pg from 'pg';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db_config.json'), 'utf8'));

async function clearTestHistory() {
    console.log(">>> [PostgreSQL] 테스트 데이터 완전 초기화 시작 <<<");
    const client = new pg.Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    });

    try {
        await client.connect();
        
        // 1. 테스트 히스토리 테이블 비우기
        const tablesToClear = [
            'transactions',
            'production_requests',
            'purchasing',
            'receiving',
            'qa_shipping_inspections',
            'notifications'
        ];

        for (const table of tablesToClear) {
            await client.query(`TRUNCATE TABLE "${table}"`);
            console.log(`[초기화 완료] 테이블 "${table}"의 모든 행이 삭제되었습니다.`);
        }

        // 2. 완제품 및 반제품 식별을 위해 parts 로드
        const partsRes = await client.query('SELECT data FROM "parts"');
        const parts = partsRes.rows.map(r => r.data);

        // 완제품 (P) 또는 반제품 (A) 조건에 맞는 PartID 필터링
        // Class가 "Product (P)" 혹은 "Assembly (A)"이거나 Category 및 PartID 접두사 매핑
        const targetPartIDs = parts.filter(p => {
            const cls = (p.Class || '').toUpperCase();
            return cls.includes('PRODUCT') || cls.includes('ASSEMBLY');
        }).map(p => p.PartID);

        console.log(`[식별 완료] 완제품/반제품 파트 개수: ${targetPartIDs.length}개`);

        // 3. inventory 테이블에서 해당 파트들의 OnHand 수량을 0으로 초기화
        const invRes = await client.query('SELECT id, data FROM "inventory"');
        let resetCount = 0;

        for (const row of invRes.rows) {
            const invData = row.data;
            if (targetPartIDs.includes(invData.PartID)) {
                const updatedData = { ...invData, OnHand: 0, LastUpdated: new Date() };
                await client.query('UPDATE "inventory" SET data = $1 WHERE id = $2', [JSON.stringify(updatedData), row.id]);
                resetCount++;
            }
        }

        console.log(`[완료] 총 ${resetCount}개 완제품/반제품 파트의 현재고 수량이 0으로 재설정되었습니다.`);
        console.log(">>> 모든 테스트 데이터가 초기화되고 준비가 완료되었습니다. <<<");

    } catch (err) {
        console.error("초기화 과정 중 에러 발생:", err);
    } finally {
        await client.end();
    }
}

clearTestHistory();
