import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

// Odoo DB에 연결
const client = new Client({
    host: process.env.PGHOST || '192.168.0.7',
    port: process.env.PGPORT || 15432,
    user: process.env.PGUSER || 'irerp',
    password: process.env.PGPASSWORD || 'irerp060705!',
    database: 'irerp', // 실제 Odoo DB명
});

async function analyzeBOMs() {
    try {
        await client.connect();
        console.log('DB 연결 성공, BOM 데이터 조회 중...');

        // 1. 제품(템플릿) 정보 가져오기
        const tmplRes = await client.query('SELECT id, name->>\'en_US\' as name_en, name->>\'ko_KR\' as name_ko FROM product_template');
        const tmplMap = {};
        tmplRes.rows.forEach(r => {
            tmplMap[r.id] = r.name_ko || r.name_en || `Template ${r.id}`;
        });

        // 2. 제품(변형) 정보 가져오기 -> 템플릿 매핑
        const prodRes = await client.query('SELECT id, product_tmpl_id, default_code FROM product_product');
        const prodMap = {};
        prodRes.rows.forEach(r => {
            prodMap[r.id] = { tmpl_id: r.product_tmpl_id, code: r.default_code };
        });

        // 3. BOM 헤더 가져오기 (어떤 제품/템플릿을 만드는 BOM인지)
        const bomRes = await client.query('SELECT id, product_tmpl_id, product_id FROM mrp_bom');
        const bomMap = {};
        bomRes.rows.forEach(r => {
            bomMap[r.id] = { tmpl_id: r.product_tmpl_id, prod_id: r.product_id };
        });

        // 4. BOM 라인 가져오기 (어떤 부품이 필요한지)
        const lineRes = await client.query('SELECT bom_id, product_id FROM mrp_bom_line');
        const adjList = {}; // tmpl_id -> Set of child tmpl_ids

        lineRes.rows.forEach(row => {
            const parentBom = bomMap[row.bom_id];
            if (!parentBom) return;
            
            const parentTmplId = parentBom.tmpl_id;
            const childProd = prodMap[row.product_id];
            if (!childProd) return;
            
            const childTmplId = childProd.tmpl_id;

            if (!adjList[parentTmplId]) adjList[parentTmplId] = new Set();
            adjList[parentTmplId].add(childTmplId);
        });

        console.log('순환 참조(Circular Dependency) 탐색 중...');

        // DFS 기반 순환 참조 탐지
        const visited = new Set();
        const recursionStack = new Set();
        let cycleFound = false;

        function dfs(node, path) {
            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            if (adjList[node]) {
                for (const child of adjList[node]) {
                    if (!visited.has(child)) {
                        if (dfs(child, path)) return true;
                    } else if (recursionStack.has(child)) {
                        // 순환 발견!
                        const cycleStartIndex = path.indexOf(child);
                        const cyclePath = path.slice(cycleStartIndex);
                        cyclePath.push(child); // 루프 완성
                        
                        console.log('\n🚨 순환 참조 발견!!!');
                        console.log('--------------------------------------------------');
                        console.log('문제의 BOM 구조:');
                        cyclePath.forEach((n, idx) => {
                            const name = tmplMap[n] || 'Unknown';
                            // prodMap에서 default_code 찾기
                            const prod = Object.values(prodMap).find(p => p.tmpl_id === n);
                            const code = prod ? prod.code : 'NoCode';
                            
                            const prefix = idx === 0 ? '시작: ' : ' └──> ';
                            console.log(`${prefix}[${code}] ${name} (ID: ${n})`);
                        });
                        console.log('--------------------------------------------------');
                        cycleFound = true;
                        return true;
                    }
                }
            }

            recursionStack.delete(node);
            path.pop();
            return false;
        }

        for (const nodeStr of Object.keys(adjList)) {
            const node = parseInt(nodeStr);
            if (!visited.has(node)) {
                if (dfs(node, [])) break; // 첫 번째 순환만 찾고 종료
            }
        }

        if (!cycleFound) {
            console.log('✅ BOM 내에 순환 참조가 발견되지 않았습니다. 다른 원인일 수 있습니다.');
        } else {
            console.log('\n💡 해결법: 위 출력된 "문제의 BOM 구조" 중 하나에 접속하여, 자신이나 자신의 상위 항목을 하위 자재로 추가한 부분을 삭제하세요.');
        }

    } catch (e) {
        console.error('분석 중 오류 발생:', e);
    } finally {
        await client.end();
    }
}

analyzeBOMs();
