import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";

// 1. Config (From existing migrate.js)
const firebaseConfig = {
    apiKey: "AIzaSyDgbTFSfrqBCL0KqfWURmTDuGZJF8FNIRo",
    authDomain: "irerp-b0977.firebaseapp.com",
    projectId: "irerp-b0977",
    storageBucket: "irerp-b0977.firebasestorage.app",
    messagingSenderId: "602256994765",
    appId: "1:602256994765:web:95f5d748ea50b481081484",
    measurementId: "G-L10Z73Y1T8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixEcns() {
    console.log("[Fix] Starting ECN Data Alignment...");
    try {
        const snap = await getDocs(collection(db, 'ecns'));
        console.log(`[Fix] Found ${snap.docs.length} ECN records.`);

        const batch = writeBatch(db);
        let count = 0;

        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            let needsUpdate = false;
            const updatePayload = {};

            // 1. Ensure Changes field exists as an array
            if (!data.Changes || !Array.isArray(data.Changes)) {
                needsUpdate = true;
                // Try to infer from ModifiedFields
                const changes = [];
                if (data.ModifiedFields && Array.isArray(data.ModifiedFields)) {
                    data.ModifiedFields.forEach(field => {
                        if (field === 'BOM Structure') changes.push("[이전 기록] BOM 구조 수정 내역");
                        else if (field === 'Spec') changes.push("[이전 기록] 사양 정보 수정 내역");
                        else if (field === 'Remarks') changes.push("[이전 기록] 비고 정보 수정 내역");
                        else if (field === 'Manual Revision Information Update') changes.push("[이전 기록] 매뉴얼 리비전 업데이트 내역");
                        else if (field === 'Part Metadata Update') changes.push("[이전 기록] 부품 메타데이터 수정 내역");
                    });
                }

                if (changes.length === 0) {
                    changes.push("[이전 기록] 데이터 변경 내역");
                }
                updatePayload.Changes = changes;
            }

            // 2. Clear out any potential nulls or garbage in Changes if it existed
            if (data.Changes && Array.isArray(data.Changes)) {
                const cleanChanges = data.Changes.filter(c => c && typeof c === 'string');
                if (cleanChanges.length !== data.Changes.length) {
                    needsUpdate = true;
                    updatePayload.Changes = cleanChanges;
                }
            }

            if (needsUpdate) {
                batch.update(docSnap.ref, updatePayload);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`[Success] Updated ${count} ECN records.`);
        } else {
            console.log("[Skip] No records needed fixing.");
        }

        process.exit(0);
    } catch (e) {
        console.error("[Error] Fix failed:", e);
        process.exit(1);
    }
}

fixEcns();
