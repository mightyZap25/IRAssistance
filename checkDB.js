import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
    const bomSnap = await getDocs(collection(db, 'bom'));
    const partsSnap = await getDocs(collection(db, 'parts'));
    console.log(`Total BOM links: ${bomSnap.size}`);
    console.log(`Total Parts: ${partsSnap.size}`);
    if (bomSnap.size > 0) {
        console.log("Sample BOM link:", bomSnap.docs[0].data());
    }
    process.exit(0);
}
check();
