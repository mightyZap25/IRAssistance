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
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION_NAME = 'issues';

/**
 * 특정 프로젝트의 모든 이슈를 가져옵니다.
 */
export async function getIssuesByProject(projectId) {
    try {
        if (!projectId) return [];
        const q = query(
            collection(db, COLLECTION_NAME),
            where('projectId', '==', projectId),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate()
        }));
    } catch (error) {
        console.error("Error getting issues by project:", error);
        throw error;
    }
}

/**
 * 새 이슈를 생성합니다 (서브태스크 초기화 포함).
 */
export async function createIssue(issueData) {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...issueData,
            columnId: issueData.columnId || 'todo',
            priority: issueData.priority || 'medium',
            subtasks: issueData.subtasks || [], // [{ id, text, department, assignedTo, status, order }]
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error adding issue: ", error);
        throw error;
    }
}

/**
 * 이슈 정보를 업데이트합니다 (상태 변경 및 서브태스크 수정 포함).
 */
export async function updateIssue(issueId, updateData) {
    try {
        const issueRef = doc(db, COLLECTION_NAME, issueId);
        await updateDoc(issueRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error updating issue: ", error);
        throw error;
    }
}

/**
 * 이슈를 삭제합니다.
 */
export async function deleteIssue(issueId) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, issueId));
    } catch (error) {
        console.error("Error deleting issue: ", error);
        throw error;
    }
}

/**
 * 특정 부품과 관련된 이슈를 필터링하여 가져옵니다.
 */
export async function getIssuesByPart(partId) {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('relatedPartId', '==', partId),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error getting issues by part: ", error);
        throw error;
    }
}
