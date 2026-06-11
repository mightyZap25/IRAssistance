
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

/**
 * 품질 기준 설정 및 불량 코드 관리 서비스
 */
export const qaService = {
    /**
     * 특정 부품의 품질 검사 기준 로드
     */
    async getQaStandard(partId) {
        if (!partId) return null;
        try {
            const docRef = doc(db, 'qa_target_parts', partId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                return { id: snap.id, isTarget: true, ...snap.data() };
            }
            return { isTarget: false, inspectionItems: [] };
        } catch (error) {
            console.error("Error fetching QA standard:", error);
            throw error;
        }
    },

    /**
     * 품질 검사 기준 저장 또는 업데이트
     */
    async saveQaStandard(partId, partData, settings) {
        if (!partId) throw new Error("Part ID is required");
        try {
            const docRef = doc(db, 'qa_target_parts', partId);
            if (!settings.isTarget) {
                await deleteDoc(docRef);
                return { success: true, action: 'deleted' };
            }

            const dataToSave = {
                partId: partData.PartID || partId,
                partName: partData.Name,
                spec: partData.Spec || '',
                useDocument: settings.useDocument || false,
                inspectionItems: settings.inspectionItems || [],
                updatedAt: new Date()
            };

            await setDoc(docRef, dataToSave);
            return { success: true, action: 'saved', data: dataToSave };
        } catch (error) {
            console.error("Error saving QA standard:", error);
            throw error;
        }
    },

    /**
     * 불량 코드 마스터 조회
     */
    async getDefectCodes(category = 'Receiving') {
        try {
            const q = query(collection(db, 'qa_defect_codes'), where('category', '==', category));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            return list;
        } catch (error) {
            console.error("Error fetching defect codes:", error);
            throw error;
        }
    }
};
