import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

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

async function check() {
    const cols = ['parts', 'bom', 'production_requests', 'purchase_orders', 'sales_orders', 'qa_inspections', 'inventory_transactions'];
    for (const colName of cols) {
        try {
            const snap = await getDocs(query(collection(db, colName), limit(1)));
            if (!snap.empty) {
                console.log(`\nCollection: ${colName}`);
                console.log(snap.docs[0].data());
            } else {
                console.log(`\nCollection: ${colName} is empty or does not exist.`);
            }
        } catch (e) {
            console.log(`\nError reading ${colName}:`, e.message);
        }
    }
    process.exit(0);
}
check();
