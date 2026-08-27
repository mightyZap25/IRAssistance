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

async function runDemo() {
    console.log('🔗 Odoo에 연결 중...');
    const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
    await odoo.authenticate();
    console.log('✅ Odoo 인증 성공!\n');

    try {
        console.log('1️⃣ 실제 사용자 ID 검색 중 (이승빈, 박성용, Administrator)...');
        
        // 이름으로 사용자 ID 찾기
        const userA_search = await odoo.execute_kw('res.users', 'search_read', [[['name', 'ilike', '이승빈']], ['id', 'name']]);
        const userB_search = await odoo.execute_kw('res.users', 'search_read', [[['name', 'ilike', '박성용']], ['id', 'name']]);
        const userC_search = await odoo.execute_kw('res.users', 'search_read', [[['name', 'ilike', 'Administrator']], ['id', 'name']]);

        if (userA_search.length === 0) throw new Error('이승빈 사용자를 찾을 수 없습니다.');
        if (userB_search.length === 0) throw new Error('박성용 사용자를 찾을 수 없습니다.');
        if (userC_search.length === 0) throw new Error('Administrator 사용자를 찾을 수 없습니다.');

        const userA_id = userA_search[0].id;
        const userB_id = userB_search[0].id;
        const userC_id = userC_search[0].id;

        console.log(`✅ 사용자 찾기 완료!`);
        console.log(` - 기안자: ${userA_search[0].name} (ID: ${userA_id})`);
        console.log(` - 1차결재: ${userB_search[0].name} (ID: ${userB_id})`);
        console.log(` - 2차결재: ${userC_search[0].name} (ID: ${userC_id})\n`);

        console.log(`2️⃣ 기안 작성 및 상신 (${userA_search[0].name})...`);
        const approval_id = await odoo.execute_kw('ir_approval.request', 'create', [[{
            name: '[테스트 데모] 연차 휴가 신청서',
            requestor_id: userA_id,
            doc_type: 'GENERAL',
            retention_period: '3',
            description: '<p>테스트 시스템 시뮬레이션용 기안입니다.</p>',
            step_ids: [
                [0, 0, { approver_id: userB_id, sequence: 1 }],
                [0, 0, { approver_id: userC_id, sequence: 2 }]
            ]
        }]]);
        
        // 기안 상신 
        await odoo.execute_kw('ir_approval.request', 'action_submit', [[approval_id]]);
        console.log(`✅ 결재 문서 생성 및 상신 완료 (문서 ID: ${approval_id})\n`);
        
        let docState = await odoo.execute_kw('ir_approval.request', 'read', [[approval_id], ['status', 'current_step_idx']]);
        console.log(`📄 현재 문서 상태: ${docState[0].status} (현재 결재 단계 인덱스: ${docState[0].current_step_idx})\n`);

        console.log(`3️⃣ 1차 결재자(${userB_search[0].name})가 승인 처리 중...`);
        // 관리자 권한으로 인증했으므로 대신 승인 가능
        await odoo.execute_kw('ir_approval.request', 'action_approve', [[approval_id]]);
        console.log(`✅ 1차 결재 승인 완료! 최종 결재자(${userC_search[0].name})에게 알림이 발송되었습니다.\n`);

        docState = await odoo.execute_kw('ir_approval.request', 'read', [[approval_id], ['status', 'current_step_idx']]);
        console.log(`📄 현재 문서 상태: ${docState[0].status} (현재 결재 단계 인덱스: ${docState[0].current_step_idx})\n`);

        console.log(`4️⃣ 최종 결재자(${userC_search[0].name})가 반려 처리 중...`);
        await odoo.execute_kw('ir_approval.request', 'action_reject', [[approval_id]]);
        console.log(`✅ 최종 결재 반려 완료! 기안자(${userA_search[0].name})에게 반려 알림이 발송되었습니다.\n`);

        docState = await odoo.execute_kw('ir_approval.request', 'read', [[approval_id], ['status', 'current_step_idx']]);
        console.log(`📄 최종 결재 상태: ${docState[0].status}\n`);

        console.log('🎉 데모 시뮬레이션이 성공적으로 완료되었습니다!');
        console.log('Odoo 시스템에 접속하셔서 생성된 문서 및 알림 내역을 확인해 보세요.\n');

    } catch (error) {
        console.error('❌ 시뮬레이션 중 오류 발생:', error.message || error);
    }
}

runDemo();
