import { db, collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs } from '../firebase';

/**
 * 품질 공정 관리(QA) 통합 서비스
 */
export const qualityService = {
    /**
     * 새로운 검사 요청을 생성합니다. (수입, 중간, 출하)
     * @param {Object} requestData - { Type: 'INCOMING'|'MIDDLE'|'FINAL', RefPRID, PartID, PartName, Qty, ... }
     */
    requestInspection: async (requestData) => {
        try {
            const date = new Date();
            const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const inspectionID = `INS-${dateStr}-${randomSuffix}`;
            const timestamp = serverTimestamp();
            
            let collectionName = 'quality_inspections'; // Fallback
            
            if (requestData.Type === 'FINAL') {
                collectionName = 'qa_shipping_inspections';
            } else if (requestData.Type === 'MIDDLE') {
                collectionName = 'qa_middle_inspections';
            } else if (requestData.Type === 'INCOMING') {
                collectionName = 'receiving';
            }

            const payload = {
                ...requestData,
                ID: inspectionID,
                Status: 'WAITING_INSPECTION', 
                CreatedAt: timestamp,
                createdAt: timestamp,
                ReceivedAt: timestamp,
                result: 'Pending'
            };

            const docRef = await addDoc(collection(db, collectionName), payload);
            return { success: true, id: docRef.id, inspectionID };
        } catch (error) {
            console.error("QA Request Error:", error);
            return { success: false, error };
        }
    },

    /**
     * 검사 결과를 기록하고 관련 시스템(재고, 발주 등)에 반영합니다.
     */
    completeInspection: async (docId, resultData) => {
        try {
            const { Result, Inspector, Notes, PassQty, FailQty } = resultData;
            const inspRef = doc(db, 'quality_inspections', docId);
            
            // 1. 검사 결과 업데이트
            await updateDoc(inspRef, {
                Status: Result, // PASS or FAIL
                Inspector,
                Notes,
                PassQty,
                FailQty,
                CompletedAt: serverTimestamp()
            });

            // 2. 합격 시 재고 반영 (수입검사인 경우)
            // (이 로직은 실제 페이지에서 inventoryService와 연동하여 호출)
            
            return { success: true };
        } catch (error) {
            console.error("QA Completion Error:", error);
            return { success: false, error };
        }
    }
};
