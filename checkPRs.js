
import { db } from './src/firebase.js';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

async function checkPRs() {
    console.log("Fetching production_requests...");
    try {
        const q = query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        
        console.log(`Found ${snap.docs.length} recent requests:`);
        snap.docs.forEach(d => {
            const data = d.data();
            console.log(`- [${data.PRNumber}] ${data.PartName} | Status: ${data.Status} | CreatedAt: ${data.CreatedAt?.toDate?.()}`);
        });
    } catch (e) {
        console.error("Error fetching PRs:", e);
    }
}

checkPRs();
