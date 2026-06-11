ㄴ 텟mport { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";

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
    try {
        console.log("--- Checking specific documents by ID ---");
        const list = [
            "IREAB0002", "IREIB0002",
            "IREAB0003", "IREIB0003",
            "IREAB0004", "IREIB0004",
            "IREAB0008", "IREIB0008",
            "IREAB0009", "IREIB0009",
            "IREAB0010", "IREIB0010",
            "IREAB0011", "IREIB0011",
            "IREAB0012", "IREIB0012",
            "IREAB0013", "IREIB0013",
            "IREAB1007", "IREIB1007",
            "IREAB1014", "IREIB1014"
        ];

        for (const id of list) {
            const ref = doc(db, 'parts', id);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                console.log(`Document [${id}] EXISTS: Name=${snap.data().Name}, Class=${snap.data().Class}`);
            } else {
                console.log(`Document [${id}] does NOT exist`);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
