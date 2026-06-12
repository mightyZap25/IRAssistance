const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// 기존 db_config.json 혹은 환경 변수가 없으므로, 프로젝트 루트의 firebase.json 등을 참고하거나 
// 여기서는 일반적인 스크립트 실행 환경을 가정합니다.
// 실제 환경에서는 서비스 계정 키가 필요하지만, CLI 환경에서 제공된 도구를 활용해 직접 처리할 수 없으므로 
// 브라우저에서 실행 가능한 형태의 '데이터 보정용 임시 UI' 혹은 '관리자용 스크립트'를 제안해야 합니다.

/* 
  사용자님, 서버 데이터를 직접 건드리기 위해 임시 복구 스크립트를 작성했습니다. 
  이 스크립트는 '수입검사'에 잘못 들어간 생산 데이터를 '출하검사'로 옮겨줍니다.
*/

async function migrateWrongData(db) {
    const receivingRef = db.collection('receiving');
    const shippingRef = db.collection('qa_shipping_inspections');
    
    // 1. 잘못 들어간 생산 데이터 찾기 (SourceType이 PRODUCTION인 것)
    const snapshot = await receivingRef.where('SourceType', '==', 'PRODUCTION').get();
    
    if (snapshot.empty) {
        console.log('이관할 데이터가 없습니다.');
        return;
    }

    const batch = db.batch();
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const newId = `MIG-${doc.id}`;
        
        // 2. 출하검사 컬렉션으로 복사 (필드 매핑)
        const newData = {
            PR_ID: data.PR_ID || '',
            PRNumber: data.PRNumber || '',
            RefPRID: data.PRNumber || '',
            PartID: data.PartID || '',
            PartName: data.PartName || '',
            Qty: data.Qty || 0,
            Status: 'WAITING_INSPECTION',
            createdAt: data.ReceivedAt || FieldValue.serverTimestamp(),
            ScheduleIdx: data.ScheduleIdx !== undefined ? data.ScheduleIdx : null,
            migratedFrom: 'receiving'
        };
        
        const newDocRef = shippingRef.doc(newId);
        batch.set(newDocRef, newData);
        
        // 3. 기존 수입검사 데이터 삭제
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`${snapshot.size}건의 데이터가 출하검사로 정상 이관되었습니다.`);
}
