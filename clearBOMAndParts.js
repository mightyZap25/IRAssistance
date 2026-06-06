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

async function deleteCollection(collectionName) {
    console.log(`[Delete] Fetching documents from '${collectionName}'...`);
    const querySnapshot = await getDocs(collection(db, collectionName));
    console.log(`[Delete] Found ${querySnapshot.size} documents in '${collectionName}'.`);
    
    if (querySnapshot.size === 0) return;

    let batch = writeBatch(db);
    let count = 0;
    
    for (const docSnapshot of querySnapshot.docs) {
        batch.delete(docSnapshot.ref);
        count++;
        
        // Commit every 400 documents (limit is 500)
        if (count % 400 === 0) {
            await batch.commit();
            console.log(`[Delete] Committed batch of 400 deletions for '${collectionName}'.`);
            batch = writeBatch(db);
        }
    }
    
    if (count % 400 !== 0) {
        await batch.commit();
        console.log(`[Delete] Committed final batch of deletions for '${collectionName}'.`);
    }
    
    console.log(`[Success] Deleted ${count} documents from '${collectionName}'.`);
}

async function main() {
    try {
        await deleteCollection('bom');
        await deleteCollection('parts');
        console.log("[Completed] All BOM and Parts data has been deleted.");
        process.exit(0);
    } catch (error) {
        console.error("[Error] Deletion failed:", error);
        process.exit(1);
    }
}

main();
