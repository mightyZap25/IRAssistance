import OdooClient from '../odoo_rpc.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const ODOO_URL = process.env.ODOO_URL || 'http://100.67.238.32:8069';
const ODOO_DB = process.env.ODOO_DB || 'odoo';
const ODOO_USER = process.env.ODOO_USER || 'admin'; 
const ODOO_PASS = process.env.ODOO_API_KEY;

async function cleanup() {
    console.log('🔗 Odoo에 연결 중...');
    const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
    await odoo.authenticate();
    console.log('✅ Odoo 인증 성공!\n');

    try {
        console.log('🗑️ 테스트 결재 문서 삭제 중...');
        const approvalIds = await odoo.execute_kw('ir_approval.request', 'search', [[['name', '=', '[테스트] 연차 휴가 신청서']]]);
        if (approvalIds.length > 0) {
            await odoo.execute_kw('ir_approval.request', 'unlink', [approvalIds]);
            console.log(`✅ 결재 문서 ${approvalIds.length}건 삭제 완료!`);
        } else {
            console.log('✅ 삭제할 결재 문서가 없습니다.');
        }

        console.log('\n🗑️ 테스트 사용자 삭제 중...');
        const userIds = await odoo.execute_kw('res.users', 'search', [[['login', 'in', ['test_user_a@test.com', 'test_user_b@test.com', 'test_user_c@test.com']]]]);
        if (userIds.length > 0) {
            // 사용자 삭제 시 관련된 파트너 데이터 등 종속성이 있을 수 있지만 
            // 생성 직후에는 보통 무리없이 지워집니다.
            await odoo.execute_kw('res.users', 'unlink', [userIds]);
            console.log(`✅ 테스트 사용자 ${userIds.length}명 삭제 완료!`);
        } else {
            console.log('✅ 삭제할 테스트 사용자가 없습니다.');
        }

        console.log('\n✨ 깔끔하게 롤백(정리)되었습니다!');
    } catch (error) {
        console.error('❌ 삭제 중 오류 발생:', error);
    }
}

cleanup();
