import OdooClient from './odoo_rpc.js';
import dotenv from 'dotenv';
dotenv.config();

const ODOO_URL = 'http://100.67.238.32:8069';
const ODOO_DB = 'odoo';
const ODOO_USER = 'jogak@mightyzap.com';
const ODOO_PASS = 'jogak0622#';

async function analyzeBOMsRPC() {
    try {
        if (!ODOO_USER || !ODOO_PASS) {
            console.error('ODOO_USER와 ODOO_API_KEY가 .env에 설정되어 있지 않습니다.');
            return;
        }

        const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
        console.log('Odoo 서버에 접속 중...');
        await odoo.authenticate();
        console.log('인증 성공! BOM 데이터 다운로드 중...');

        // 전체 BOM 가져오기
        const boms = await odoo.execute_kw('mrp.bom', 'search_read', [[], ['id', 'product_tmpl_id', 'product_id']]);
        const bomMap = {}; // BOM ID -> { tmpl_id, prod_id }
        boms.forEach(b => {
            bomMap[b.id] = { tmpl_id: b.product_tmpl_id[0], name: b.product_tmpl_id[1] };
        });

        // 전체 BOM 라인(구성요소) 가져오기
        const lines = await odoo.execute_kw('mrp.bom.line', 'search_read', [[], ['id', 'bom_id', 'product_id', 'product_tmpl_id']]);
        
        const adjList = {}; // Parent Template ID -> Set of Child Template IDs
        const nameMap = {};

        lines.forEach(line => {
            const parentBomId = line.bom_id[0];
            const parentBom = bomMap[parentBomId];
            if (!parentBom) return;

            const parentTmplId = parentBom.tmpl_id;
            nameMap[parentTmplId] = parentBom.name;

            // 라인의 하위 품목 정보
            // product_id[0]는 product.product, product_tmpl_id[0]는 product.template
            let childTmplId = null;
            let childName = null;
            if (line.product_tmpl_id) {
                childTmplId = line.product_tmpl_id[0];
                childName = line.product_tmpl_id[1];
            } else if (line.product_id) {
                // fall back, assuming product_id text contains the name
                childTmplId = `prod_${line.product_id[0]}`;
                childName = line.product_id[1];
            }

            if (!childTmplId) return;
            nameMap[childTmplId] = childName;

            if (!adjList[parentTmplId]) adjList[parentTmplId] = new Set();
            adjList[parentTmplId].add(childTmplId);
        });

        console.log('순환 참조(Circular Dependency) 탐색 중...');
        
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
                            const name = nameMap[n] || 'Unknown';
                            const prefix = idx === 0 ? '시작: ' : ' └──> ';
                            console.log(`${prefix}${name} (ID: ${n})`);
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
            const node = isNaN(nodeStr) ? nodeStr : parseInt(nodeStr);
            if (!visited.has(node)) {
                if (dfs(node, [])) break;
            }
        }

        if (!cycleFound) {
            console.log('✅ Odoo API 분석 결과, 순환 참조가 발견되지 않았습니다.');
        } else {
            console.log('\n💡 해결법: 위 출력된 "문제의 BOM 구조" 중 하나에 접속하여, 자식 자재를 삭제하세요.');
        }

    } catch (e) {
        console.error('분석 중 오류 발생:', e);
    }
}

analyzeBOMsRPC();
