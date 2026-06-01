import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    doc, 
    updateDoc, 
    deleteDoc,
    serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION_NAME = 'metadata_fields';

/**
 * 모듈별(예: 'parts', 'projects') 커스텀 필드 목록 조회
 */
export async function getCustomFields(moduleName) {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('moduleName', '==', moduleName),
            where('isActive', '==', true)
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching custom fields:", error);
        throw error;
    }
}

/**
 * 신규 커스텀 필드 추가
 * fieldType: 'text', 'number', 'checkbox', 'date', 'link', 'memo', 'select'
 */
export async function createCustomField(moduleName, fieldData) {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            moduleName,
            label: fieldData.label,
            fieldType: fieldData.fieldType || 'text',
            description: fieldData.description || '',
            isActive: true,
            isVisible: fieldData.isVisible !== undefined ? fieldData.isVisible : true,
            order: fieldData.order || 0,
            group: fieldData.group || 'General',
            isRequired: fieldData.isRequired || false,
            options: fieldData.options || [], // For 'select' type
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating custom field:", error);
        throw error;
    }
}

/**
 * 커스텀 필드 정보 업데이트
 */
export async function updateCustomField(fieldId, updateData) {
    try {
        const ref = doc(db, COLLECTION_NAME, fieldId);
        await updateDoc(ref, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error updating custom field:", error);
        throw error;
    }
}

/**
 * 커스텀 필드 삭제 (비활성화)
 */
export async function deactivateCustomField(fieldId) {
    try {
        const ref = doc(db, COLLECTION_NAME, fieldId);
        await updateDoc(ref, {
            isActive: false,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error deactivating custom field:", error);
        throw error;
    }
}
