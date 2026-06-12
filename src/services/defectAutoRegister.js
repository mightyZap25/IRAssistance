import { db, collection, doc, setDoc, getDocs } from '../firebase';

/**
 * 불량 발생 시 새로운 불량 유형이 들어오면 qa_defect_codes 마스터에 자동 등록합니다.
 */
export const autoRegisterDefect = async (name, category = 'Receiving') => {
    if (!name) return null;
    
    try {
        // 1. 이름으로 이미 존재하는지 확인 - Mock 환경 호환성을 위해 전체 조회 후 필터링
        const snap = await getDocs(collection(db, 'qa_defect_codes'));
        let existing = null;
        
        snap.forEach(d => {
            const data = d.data();
            if (data.name === name && data.category === category) {
                existing = { id: d.id, ...data };
            }
        });
        
        if (existing) {
            return existing;
        }

        // 2. 존재하지 않으면 신규 등록
        const cleanName = name.replace(/[^a-zA-Z0-9가-힣]/g, '_').toUpperCase();
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const code = `DF_${cleanName}_${randomSuffix}`;
        
        const newDefect = {
            code,
            name,
            category,
            AutoRegistered: true,
            CreatedAt: new Date()
        };

        await setDoc(doc(db, 'qa_defect_codes', code), newDefect);
        console.info(`[DefectAutoReg] New defect registered: ${name} (${code}) in ${category}`);
        
        return { id: code, ...newDefect };
    } catch (error) {
        console.error("[DefectAutoReg] Error:", error);
        return null;
    }
};
