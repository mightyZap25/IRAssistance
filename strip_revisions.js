import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch, setDoc, deleteDoc } from "firebase/firestore";

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

function normalizePartId(id) {
    if (!id) return '';
    let normalized = String(id).trim().toUpperCase();
    normalized = normalized.replace(/[-_]v?\d+\.\d+$/i, '');
    return normalized;
}

async function stripRevisions() {
    console.log("[Migration] Starting Revision Strip...");
    
    // 1. Process Parts
    const partsSnap = await getDocs(collection(db, 'parts'));
    let batch = writeBatch(db);
    let count = 0;
    
    const partsToDelete = [];
    const partsToCreate = [];
    const partsToUpdate = [];

    partsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const oldId = docSnap.id;
        const normId = normalizePartId(oldId);
        
        if (oldId !== normId) {
            console.log(`Part Migration: ${oldId} -> ${normId}`);
            const newData = { ...data, PartID: normId, MasterPartID: normId };
            
            partsToDelete.push(oldId);
            partsToCreate.push({ id: normId, data: newData });
        } else {
            let needsUpdate = false;
            if (data.PartID !== normId) { needsUpdate = true; }
            if (data.MasterPartID !== normId) { needsUpdate = true; }
            
            if (needsUpdate) {
                partsToUpdate.push({ id: oldId, PartID: normId, MasterPartID: normId });
            }
        }
    });

    for (const newPart of partsToCreate) {
        batch.set(doc(db, 'parts', newPart.id), newPart.data);
        count++;
        if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
    }
    
    for (const p of partsToUpdate) {
        batch.update(doc(db, 'parts', p.id), { PartID: p.PartID, MasterPartID: p.MasterPartID });
        count++;
        if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
    }

    for (const oldId of partsToDelete) {
        batch.delete(doc(db, 'parts', oldId));
        count++;
        if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
    }
    
    if (count > 0) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
    }
    console.log("[Migration] Parts processing completed.");

    // 2. Process BOM
    const bomSnap = await getDocs(collection(db, 'bom'));
    for (const docSnap of bomSnap.docs) {
        const data = docSnap.data();
        const oldParent = data.ParentID;
        const oldChild = data.ChildID;
        const normParent = normalizePartId(oldParent);
        const normChild = normalizePartId(oldChild);
        
        if (oldParent !== normParent || oldChild !== normChild) {
            console.log(`BOM Migration: ${oldParent}_${oldChild} -> ${normParent}_${normChild}`);
            batch.update(doc(db, 'bom', docSnap.id), {
                ParentID: normParent,
                ChildID: normChild
            });
            count++;
        }
        
        if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
        }
    }
    
    if (count > 0) {
        await batch.commit();
    }
    
    console.log("[Migration] BOM processing completed.");
    console.log("[Migration] ALL DONE!");
    process.exit(0);
}

stripRevisions().catch(err => {
    console.error(err);
    process.exit(1);
});
