import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('.env.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const snap = await getDocs(query(collection(db, 'quotations'), limit(3)));
  snap.forEach(d => console.log(d.id, d.data()));
  process.exit(0);
}
run().catch(console.error);
