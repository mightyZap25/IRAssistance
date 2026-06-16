import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import fs from 'fs';

// Read firebase config from src/firebase.js
const firebaseCode = fs.readFileSync('src/firebase.js', 'utf8');
const configMatch = firebaseCode.match(/const firebaseConfig = ({[\s\S]*?});/);
if (!configMatch) {
    console.error("Could not find firebase config");
    process.exit(1);
}
const firebaseConfig = eval('(' + configMatch[1] + ')');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkDB() {
    console.log("Fetching today's transactions...");
    const txSnap = await getDocs(collection(db, 'transactions'));
    const allTx = txSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const todayTx = allTx.filter(tx => {
        if (!tx.Timestamp) return false;
        let d;
        if (tx.Timestamp.toDate) d = tx.Timestamp.toDate();
        else if (tx.Timestamp.seconds) d = new Date(tx.Timestamp.seconds * 1000);
        else d = new Date(tx.Timestamp);
        return d >= today;
    });

    console.log(`Found ${todayTx.length} transactions today.`);
    
    const qaIn = todayTx.filter(t => t.Reason === '완제품 출하검사 합격 입고');
    const prodIn = todayTx.filter(t => t.Reason === '생산 완료 (완제품 입고)');
    const shipOut = todayTx.filter(t => t.Reason === '완제품 출하');
    
    console.log(`QA In (Old Logic): ${qaIn.length}`);
    console.log(`Prod In (New Logic): ${prodIn.length}`);
    console.log(`Ship Out (New Logic): ${shipOut.length}`);
    
    qaIn.forEach(t => console.log(`  [QA In] ${t.id}: ${t.PartID} +${t.Quantity} (Ref: ${t.RefDoc})`));
    
    console.log("\nFetching SHIPPED PRs...");
    const prSnap = await getDocs(query(collection(db, 'production_requests'), where('Status', '==', 'SHIPPED')));
    const shippedPRs = prSnap.docs.map(d => ({id: d.id, ...d.data()}));
    console.log(`Found ${shippedPRs.length} SHIPPED PRs.`);
    
    shippedPRs.forEach(pr => {
        console.log(`  [SHIPPED PR] ${pr.id}: ${pr.PartID || 'Multi'} Qty: ${pr.TargetQty}`);
        // Check if there is an OUT transaction for this PR
        const hasOut = allTx.some(t => t.RefDoc === (pr.PRNumber || pr.id) && t.Type === 'Out' && t.Reason === '완제품 출하');
        console.log(`    Has Ship Out Tx: ${hasOut}`);
    });
    
    process.exit(0);
}

checkDB().catch(console.error);
