import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDoc,
    getDocs, 
    query, 
    where, 
    orderBy, 
    serverTimestamp 
} from '../firebase';
import { db } from '../firebase';
import { syncTaskToGoogleCalendar, deleteTaskFromGoogleCalendar } from './calendarService';

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
        const tasks = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const safeDate = (val) => {
                if (!val) return null;
                if (typeof val.toDate === 'function') return val.toDate();
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
            };
            return {
                id: doc.id,
                ...data,
                createdAt: safeDate(data.createdAt),
                updatedAt: safeDate(data.updatedAt),
                dueDate: safeDate(data.dueDate)
            };
        });

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
        });
        
        // 구글 캘린더 백그라운드 동기화
        syncTaskToGoogleCalendar(docRef.id, taskData).then(googleEventId => {
            if (googleEventId) {
                updateDoc(docRef, { googleEventId }).catch(err => console.error("Failed to save googleEventId:", err));
            }
        }).catch(err => console.error("Calendar sync error:", err));
        
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
        
        // 기존 문서 가져오기 (전체 데이터 유지 및 googleTaskId, googleEventId 확인용)
        const taskSnap = await getDoc(taskRef);
        if (!taskSnap.exists()) return;
        const existingData = taskSnap.data();
        
        const mergedData = { ...existingData, ...updateData };

        await updateDoc(taskRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
        
        // 구글 캘린더 백그라운드 동기화
        syncTaskToGoogleCalendar(taskId, mergedData).then(googleEventId => {
            if (googleEventId && googleEventId !== existingData.googleEventId) {
                updateDoc(taskRef, { googleEventId }).catch(err => console.error("Failed to save googleEventId:", err));
            }
        }).catch(err => console.error("Calendar sync error:", err));
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
        const taskRef = doc(db, COLLECTION_NAME, taskId);
        
        // 삭제 전 데이터 조회 (googleTaskId 확인용)
        const taskSnap = await getDoc(taskRef);
        const googleEventId = taskSnap.exists() ? taskSnap.data().googleEventId : null;

        await deleteDoc(taskRef);
        
        // 구글 캘린더에서 항목 삭제
        if (googleEventId) {
            deleteTaskFromGoogleCalendar(taskId).catch(err => console.error("Calendar delete error:", err));
        }
    } catch (error) {
        console.error("Error deleting personal task: ", error);
        throw error;
    }
}
