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

const COLLECTION_NAME = 'projects';

/**
 * 모든 프로젝트 목록을 가져옵니다.
 */
export async function getProjects() {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate()
        }));
    } catch (error) {
        console.error("Error getting projects:", error);
        throw error;
    }
}

/**
 * 새 프로젝트를 생성합니다 (기본 컬럼 포함).
 */
export async function createProject(projectData) {
    try {
        const defaultColumns = [
            { id: 'todo', title: 'To Do', order: 0, color: 'bg-slate-100' },
            { id: 'in_progress', title: 'In Progress', order: 1, color: 'bg-blue-50' },
            { id: 'done', title: 'Done', order: 2, color: 'bg-emerald-50' }
        ];

        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            name: projectData.name,
            description: projectData.description || '',
            owner: projectData.owner,
            columns: projectData.columns || defaultColumns,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating project:", error);
        throw error;
    }
}

/**
 * 프로젝트 정보를 업데이트합니다 (컬럼 구성 변경 등).
 */
export async function updateProject(projectId, updateData) {
    try {
        const projectRef = doc(db, COLLECTION_NAME, projectId);
        await updateDoc(projectRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error updating project:", error);
        throw error;
    }
}

/**
 * 프로젝트를 삭제합니다.
 */
export async function deleteProject(projectId) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, projectId));
    } catch (error) {
        console.error("Error deleting project:", error);
        throw error;
    }
}
