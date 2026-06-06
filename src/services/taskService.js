import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    serverTimestamp 
} from '../firebase';
import { db } from '../firebase';

const COLLECTION_NAME = 'personal_tasks';

/**
 * 특정 사용자의 개인 할 일을 가져옵니다.
 */
export async function getPersonalTasks(uid) {
    try {
        if (!uid) return [];
        const q = query(
            collection(db, COLLECTION_NAME),
            where('ownerUid', '==', uid)
        );
        const querySnapshot = await getDocs(q);
        const tasks = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate(),
            dueDate: doc.data().dueDate ? (doc.data().dueDate.toDate ? doc.data().dueDate.toDate() : new Date(doc.data().dueDate)) : null
        }));

        // 인덱스 생성 전까지 메모리에서 정렬 처리 (createdAt 내림차순)
        return tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (error) {
        console.error("Error getting personal tasks:", error);
        throw error;
    }
}

/**
 * 새 개인 할 일을 생성합니다.
 */
export async function createPersonalTask(uid, taskData) {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...taskData,
            ownerUid: uid,
            status: taskData.status || 'todo', // todo, in_progress, completed
            priority: taskData.priority || 'medium', // low, medium, high, urgent
            subtasks: taskData.subtasks || [], // [{ id, text, completed }]
            alarmEnabled: taskData.alarmEnabled || false,
            alarmSent: false,
            recurring: taskData.recurring || 'none', // none, daily, weekly
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error adding personal task: ", error);
        throw error;
    }
}

/**
 * 개인 할 일 정보를 업데이트합니다.
 */
export async function updatePersonalTask(taskId, updateData) {
    try {
        const taskRef = doc(db, COLLECTION_NAME, taskId);
        await updateDoc(taskRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error updating personal task: ", error);
        throw error;
    }
}

/**
 * 개인 할 일을 삭제합니다.
 */
export async function deletePersonalTask(taskId) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, taskId));
    } catch (error) {
        console.error("Error deleting personal task: ", error);
        throw error;
    }
}
