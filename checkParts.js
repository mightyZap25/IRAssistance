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
    const partsSnap = await getDocs(collection(db, 'parts'));
    const parts = partsSnap.docs.map(d => d.data());
    
    const ireabParts = parts.filter(p => p.PartID && p.PartID.startsWith('IREAB'));
    const ireibParts = parts.filter(p => p.PartID && p.PartID.startsWith('IREIB'));
    
    console.log(`Total Parts: ${parts.length}`);
    console.log(`IREAB Parts: ${ireabParts.length}`);
    console.log(`IREIB Parts: ${ireibParts.length}`);
    
    if (ireabParts.length > 0) {
        console.log("Sample IREAB Parts (first 5):", ireabParts.slice(0, 5).map(p => ({ PartID: p.PartID, Name: p.Name, Class: p.Class })));
    }
    if (ireibParts.length > 0) {
        console.log("Sample IREIB Parts (first 5):", ireibParts.slice(0, 5).map(p => ({ PartID: p.PartID, Name: p.Name, Class: p.Class })));
    }
    process.exit(0);
}
check();
