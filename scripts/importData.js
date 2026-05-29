import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { readFile } from 'fs/promises';

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

// Absolute paths to data files
const MANUFACTURERS_PATH = "d:/test/erp/src/json/Manufacturers.json";
const VENDORS_PATH = "d:/test/erp/src/json/Vendors.json";

async function importManufacturers() {
    console.log(`[Manufacturers] Reading from ${MANUFACTURERS_PATH}...`);
    try {
        const rawData = await readFile(MANUFACTURERS_PATH, 'utf-8');
        const manufacturers = JSON.parse(rawData);
        console.log(`[Manufacturers] Found ${manufacturers.length} items.`);

        const collectionRef = collection(db, 'manufacturers');
        let addedCount = 0;
        let skippedCount = 0;

        for (const m of manufacturers) {
            try {
                // Check for duplicates (Simple check by Name)
                const q = query(collectionRef, where("Name", "==", m.Name));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    await addDoc(collectionRef, {
                        ...m,
                        ImportedAt: new Date()
                    });
                    process.stdout.write('+'); // Progress indicator
                    addedCount++;
                } else {
                    process.stdout.write('.'); // Skip indicator
                    skippedCount++;
                }
            } catch (err) {
                console.error(`\n[Manufacturers] Error adding ${m.Name}:`, err.message);
            }
        }
        console.log(`\n[Manufacturers] Done. Added: ${addedCount}, Skipped: ${skippedCount}`);
    } catch (error) {
        console.error("\n[Manufacturers] Fatal Error:", error);
    }
}

async function importVendors() {
    console.log(`[Vendors] Reading from ${VENDORS_PATH}...`);
    try {
        const rawData = await readFile(VENDORS_PATH, 'utf-8');
        const vendors = JSON.parse(rawData);
        console.log(`[Vendors] Found ${vendors.length} items.`);

        const collectionRef = collection(db, 'vendors');
        let addedCount = 0;
        let skippedCount = 0;

        for (const v of vendors) {
            try {
                const q = query(collectionRef, where("Name", "==", v.Name));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    await addDoc(collectionRef, {
                        ...v,
                        ImportedAt: new Date()
                    });
                    process.stdout.write('+');
                    addedCount++;
                } else {
                    process.stdout.write('.');
                    skippedCount++;
                }
            } catch (err) {
                console.error(`\n[Vendors] Error adding ${v.Name}:`, err.message);
            }
        }
        console.log(`\n[Vendors] Done. Added: ${addedCount}, Skipped: ${skippedCount}`);
    } catch (error) {
        console.error("\n[Vendors] Fatal Error:", error);
    }
}

async function main() {
    try {
        console.log("Starting Data Import...");
        await importManufacturers();
        await importVendors();
        console.log("All imports finished successfully.");
        process.exit(0);
    } catch (e) {
        console.error("Script failed:", e);
        process.exit(1);
    }
}

main();
