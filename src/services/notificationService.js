import { db, collection, addDoc, serverTimestamp, doc, getDoc } from '../firebase';

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
