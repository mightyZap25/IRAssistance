import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

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
const firestore = getFirestore(app);

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db_config.json'), 'utf8'));
const activeProfile = config.currentProfile || 'local';
const activeConfig = config[activeProfile];

const pool = new pg.Pool({
    host: activeConfig.host,
    port: parseInt(activeConfig.port) || 15432,
    user: activeConfig.user,
    password: activeConfig.password,
    database: activeConfig.database
});

const ensureTableExists = async (tableName) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "${tableName}" (
            id VARCHAR(255) PRIMARY KEY,
            data JSONB NOT NULL
        )
    `);
};

async function sync() {
    console.log(">>> Firebase Firestore -> PostgreSQL 매출 데이터(quotations, billing) 동기화 시작 <<<");
    try {
        // 1. quotations 동기화
        await ensureTableExists('quotations');
        const qSnap = await getDocs(collection(firestore, 'quotations'));
        console.log(`[Firebase] Quotations에서 ${qSnap.size}건 로드 완료.`);
        
        let qCount = 0;
        for (const doc of qSnap.docs) {
            const id = doc.id;
            const data = doc.data();
            const serializedData = {};
            for (const [key, value] of Object.entries(data)) {
                if (value && typeof value.toDate === 'function') {
                    serializedData[key] = value.toDate().toISOString();
                } else {
                    serializedData[key] = value;
                }
            }
            const itemData = { ...serializedData, id };
            await pool.query(
                `INSERT INTO "quotations" (id, data) VALUES ($1, $2)
                 ON CONFLICT (id) DO UPDATE SET data = $2`,
                [id, JSON.stringify(itemData)]
            );
            qCount++;
        }
        console.log(`[PostgreSQL] Quotations 테이블에 ${qCount}건 동기화 완료.`);

        // 2. billing 동기화
        await ensureTableExists('billing');
        const bSnap = await getDocs(collection(firestore, 'billing'));
        console.log(`[Firebase] Billing에서 ${bSnap.size}건 로드 완료.`);
        
        let bCount = 0;
        for (const doc of bSnap.docs) {
            const id = doc.id;
            const data = doc.data();
            const serializedData = {};
            for (const [key, value] of Object.entries(data)) {
                if (value && typeof value.toDate === 'function') {
                    serializedData[key] = value.toDate().toISOString();
                } else {
                    serializedData[key] = value;
                }
            }
            const itemData = { ...serializedData, id };
            await pool.query(
                `INSERT INTO "billing" (id, data) VALUES ($1, $2)
                 ON CONFLICT (id) DO UPDATE SET data = $2`,
                [id, JSON.stringify(itemData)]
            );
            bCount++;
        }
        console.log(`[PostgreSQL] Billing 테이블에 ${bCount}건 동기화 완료.`);

        console.log(">>> 동기화 완료! <<<");
    } catch (err) {
        console.error("동기화 실패:", err);
    } finally {
        await pool.end();
    }
}

sync();
