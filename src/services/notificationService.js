import { db, collection, addDoc, serverTimestamp, doc, getDoc } from '../database';

/**
 * 전역 알림 생성 서비스
 * @param {string} targetUid - 수신자 UID
 * @param {string} title - 알림 제목
 * @param {string} message - 알림 내용
 * @param {string} link - 클릭 시 이동할 링크 (선택사항)
 * @param {string[]} targetDepts - 대상 부서/역할 (선택사항)
 */
export async function createNotification(targetUid, title, message, link = '', targetDepts = []) {
    try {
        let userEmail = '';
        if (targetUid) {
            const userSnap = await getDoc(doc(db, 'users', targetUid));
            if (userSnap.exists()) {
                userEmail = userSnap.data().email;
            }
        }

        await addDoc(collection(db, 'notifications'), {
            userEmail,
            title,
            message,
            link,
            targetDepts,
            read: false,
            createdAt: serverTimestamp()
        });
        console.log(`Notification sent to ${userEmail || 'Departments: ' + targetDepts.join(',')}`);
    } catch (err) {
        console.error("Failed to create notification:", err);
    }
}

/**
 * 특정 라우트(페이지)에 접근 권한이 있는 모든 역할에게 알림을 전송합니다.
 * @param {string} routePath - 대상 페이지 라우트 경로 (예: '/parts')
 * @param {string} title - 알림 제목
 * @param {string} message - 알림 내용
 * @param {string} link - 이동 링크
 */
export async function createNotificationByRoute(routePath, title, message, link = '') {
    const routeRoleMap = {
        '/parts': ['admin', 'engineer'],
        '/bom': ['admin', 'engineer'],
        '/customers': ['admin', 'sales', 'manager'],
        '/prod-requests': ['admin', 'sales', 'production', 'manager'],
        '/prod-execution': ['admin', 'production'],
        '/purchasing': ['admin', 'production', 'manager'],
        '/outsourcing': ['admin', 'production', 'manager'],
        '/inventory': ['admin', 'engineer', 'sales', 'qa', 'production', 'manager'],
        '/transactions': ['admin', 'engineer', 'qa', 'production', 'manager'],
        '/qa/config': ['admin', 'qa', 'manager'],
        '/qa/process': ['admin', 'qa', 'manager'],
        '/qa/dashboard': ['admin', 'engineer', 'qa', 'manager'],
        '/qa/dev-testing': ['admin', 'engineer', 'qa', 'manager'],
        '/manufacturers': ['admin', 'manager'],
        '/vendors': ['admin', 'production', 'manager'],
        '/ecn': ['admin', 'engineer', 'manager'],
        '/hr/attendance': ['admin', 'engineer', 'sales', 'qa', 'production', 'manager', 'viewer'],
        '/project/dashboard': ['admin', 'engineer', 'manager'],
        '/project/issues': ['admin', 'engineer', 'manager'],
        '/project/management': ['admin', 'engineer', 'sales', 'qa', 'production', 'manager', 'viewer'],
        '/project/tasks': ['admin', 'engineer', 'sales', 'qa', 'production', 'manager', 'viewer'],
        '/project/task-calendar': ['admin', 'engineer', 'sales', 'qa', 'production', 'manager', 'viewer'],
        '/sales/dashboard': ['admin', 'sales', 'manager'],
        '/sales/billing': ['admin', 'sales', 'manager']
    };

    const targetDepts = routeRoleMap[routePath] || ['admin'];
    await createNotification('', title, message, link, targetDepts);
}
