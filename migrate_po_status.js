
import { db, collection, getDocs, query, where, updateDoc, doc } from './src/firebase.js';

async function migrateDraftToRfqSent() {
    console.log('Starting migration: DRAFT -> RFQ_SENT...');
    try {
        const q = query(collection(db, 'purchasing'), where('Status', '==', 'DRAFT'));
        const snap = await getDocs(q);
        
        console.log(`Found ${snap.size} documents in DRAFT status.`);
        
        const promises = snap.docs.map(d => {
            console.log(`Updating ${d.id} (${d.data().PRNumber})...`);
            return updateDoc(doc(db, 'purchasing', d.id), { Status: 'RFQ_SENT' });
        });
        
        await Promise.all(promises);
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateDraftToRfqSent();
