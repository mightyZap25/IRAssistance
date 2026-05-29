import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch, query, where, deleteDoc } from "firebase/firestore";

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

async function cleanup() {
    console.log("[Cleanup] Starting DB Purification...");
    try {
        const batch = writeBatch(db);
        let partCount = 0;
        let bomCount = 0;

        // 1. Clean Parts with NaN or null PartID
        const partsSnap = await getDocs(collection(db, 'parts'));
        for (const d of partsSnap.docs) {
            const data = d.data();
            if (!data.PartID || data.PartID.includes('NaN') || data.PartID.includes('null')) {
                console.log(`[Cleanup] Deleting invalid part: ${d.id} (${data.PartID})`);
                batch.delete(d.ref);
                partCount++;
            }
        }

        // 2. Clean BOM links with NaN or null in IDs
        const bomSnap = await getDocs(collection(db, 'bom'));
        for (const d of bomSnap.docs) {
            const data = d.data();
            if (!data.ParentID || data.ParentID.includes('NaN') || !data.ChildID || data.ChildID.includes('NaN')) {
                console.log(`[Cleanup] Deleting invalid BOM link: ${d.id}`);
                batch.delete(d.ref);
                bomCount++;
            }
        }

        // 3. Fix MasterPartID missing
        // (Just in case, though usually handled by creation logic)
        for (const d of partsSnap.docs) {
            const data = d.data();
            if (data.PartID && !data.PartID.includes('NaN') && !data.MasterPartID) {
                const inferredMaster = data.PartID.split('-')[0];
                console.log(`[Cleanup] Fixing MasterPartID for ${data.PartID} -> ${inferredMaster}`);
                batch.update(d.ref, { MasterPartID: inferredMaster });
            }
        }

        if (partCount > 0 || bomCount > 0) {
            await batch.commit();
            console.log(`[Success] Deleted ${partCount} parts and ${bomCount} BOM links.`);
        } else {
            console.log("[Skip] No invalid records found.");
        }

        console.log("[Cleanup] Finished.");
        process.exit(0);
    } catch (e) {
        console.error("[Error] Cleanup failed:", e);
        process.exit(1);
    }
}

cleanup();
