import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch } from "firebase/firestore";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Config (Same as src/firebase.js)
const firebaseConfig = {
    apiKey: "AIzaSyDgbTFSfrqBCL0KqfWURmTDuGZJF8FNIRo",
    authDomain: "irerp-b0977.firebaseapp.com",
    projectId: "irerp-b0977",
    storageBucket: "irerp-b0977.firebasestorage.app",
    messagingSenderId: "602256994765",
    appId: "1:602256994765:web:95f5d748ea50b481081484",
    measurementId: "G-L10Z73Y1T8"
};

// 2. Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 3. Resolve Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_DIR = path.resolve(__dirname, '../src/json');

console.log(`[Migration] Reading data from: ${SOURCE_DIR}`);

// 4. Migration Logic
async function migrateCollection(fileName, collectionName, idField) {
    const filePath = path.join(SOURCE_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        console.warn(`[Skip] File not found: ${fileName}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`[Processing] ${collectionName}: ${data.length} records found.`);

    // Batch writes (max 500 per batch)
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;

    for (const item of data) {
        // Doc ID Strategy: Use provided ID field, or clean PartID, or fallback to auto-ID (ref)
        let docId = item[idField];

        // Clean ID if necessary (Firestore doesn't like /, ., etc in IDs sometimes, but generally OK)
        if (!docId) {
            // Generate a ref if no ID
            const ref = doc(collection(db, collectionName));
            currentBatch.set(ref, item);
        } else {
            // Ensure string
            docId = String(docId);
            const ref = doc(db, collectionName, docId);
            currentBatch.set(ref, item);
        }

        count++;
        if (count % 450 === 0) {
            batches.push(currentBatch.commit());
            currentBatch = writeBatch(db);
        }
    }

    // Commit remaining
    if (count % 450 !== 0) {
        batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
    console.log(`[Done] ${collectionName}: ${count} records uploaded.`);
}

async function runMigration() {
    try {
        await migrateCollection('Parts.json', 'parts', 'PartID');
        await migrateCollection('Inventory.json', 'inventory', 'PartID');
        await migrateCollection('BOM.json', 'bom', null); // BOM is a relation table, maybe auto-ID is better or Composite Key? 
        // For BOM, let's just use Auto-ID for now as it's a link table (ParentID, ChildID)

        await migrateCollection('Vendors.json', 'vendors', 'VendorID');
        await migrateCollection('Customers.json', 'customers', 'CustomerID');
        await migrateCollection('Transactions.json', 'transactions', 'TxID');

        console.log("Migration Complete!");
        process.exit(0);
    } catch (e) {
        console.error("Migration Failed", e);
        process.exit(1);
    }
}

runMigration();
