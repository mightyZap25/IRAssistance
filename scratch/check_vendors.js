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
    
    console.log("Sample parts data:");
    parts.slice(0, 10).forEach(p => {
        console.log(`PartID: ${p.PartID}, Name: ${p.Name}, Maker: ${p.Maker}, Manufacturer: ${p.Manufacturer}, VendorID: ${p.VendorID}`);
    });
    
    // check vendors
    const vendorSnap = await getDocs(collection(db, 'vendors'));
    console.log("\nSample vendors data:");
    vendorSnap.docs.slice(0, 5).forEach(v => {
        console.log(`VendorID: ${v.id}, Name: ${v.data().Name}`);
    });
    process.exit(0);
}
check();
