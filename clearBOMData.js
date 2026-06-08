// clearBOMData.js - BOM 및 완제품/조립품 데이터만 선택적으로 삭제
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch } from "firebase/firestore";

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

async function deleteDocs(docs, label) {
    if (docs.length === 0) {
        console.log(`[Skip] No documents found for '${label}'.`);
        return;
    }

    let batch = writeBatch(db);
    let count = 0;

    for (const docSnapshot of docs) {
        batch.delete(docSnapshot.ref);
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            console.log(`[Delete] Committed batch of 400 for '${label}'.`);
            batch = writeBatch(db);
        }
    }

    if (count % 400 !== 0) {
        await batch.commit();
    }

    console.log(`[Success] Deleted ${count} documents from '${label}'.`);
}

async function main() {
    try {
        // 1. bom 컬렉션 전체 삭제
        console.log("\n[Step 1] Deleting all documents in 'bom' collection...");
        const bomSnap = await getDocs(collection(db, 'bom'));
        await deleteDocs(bomSnap.docs, 'bom');

        // 2. parts에서 완제품(IRP) / 조립품(IRA) 삭제
        console.log("\n[Step 2] Loading all parts...");
        const partsSnap = await getDocs(collection(db, 'parts'));

        const productDocs = partsSnap.docs.filter(d => {
            const pid = d.data().PartID || '';
            const cls = (d.data().Class || '').toLowerCase();
            return pid.startsWith('IRP') || cls.includes('product');
        });
        console.log(`[Step 2a] Found ${productDocs.length} Product parts (IRP...) to delete.`);
        await deleteDocs(productDocs, 'parts (Products)');

        const assemblyDocs = partsSnap.docs.filter(d => {
            const pid = d.data().PartID || '';
            const cls = (d.data().Class || '').toLowerCase();
            return pid.startsWith('IRA') || cls.includes('assembly');
        });
        console.log(`[Step 2b] Found ${assemblyDocs.length} Assembly parts (IRA...) to delete.`);
        await deleteDocs(assemblyDocs, 'parts (Assemblies)');

        console.log("\n[Completed] BOM 및 완제품/조립품 데이터가 모두 삭제되었습니다.");
        console.log("(일반 부품 데이터는 그대로 유지됩니다.)");
        process.exit(0);
    } catch (error) {
        console.error("[Error] Deletion failed:", error);
        process.exit(1);
    }
}

main();
