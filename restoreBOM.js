import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch, query, where } from "firebase/firestore";

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

async function restoreBOM() {
    console.log("[Restore] Analyzing missing BOM links...");
    try {
        const partsSnap = await getDocs(collection(db, 'parts'));
        const bomSnap = await getDocs(collection(db, 'bom'));

        const allParts = partsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const allLinks = bomSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        const parentSet = new Set(allLinks.map(l => l.ParentID));
        const batch = writeBatch(db);
        let restoredCount = 0;

        // 1. Find Latest Assemblies with NO children
        const emptyLatestAssy = allParts.filter(p => {
            const isAssy = (p.Class || '').toLowerCase().includes('a') || (p.Class || '').toLowerCase().includes('p');
            return p.IsLatestRevision && isAssy && !parentSet.has(p.PartID);
        });

        console.log(`[Restore] Found ${emptyLatestAssy.length} empty latest assemblies.`);

        for (const target of emptyLatestAssy) {
            // 2. Find previous revision for this master
            const others = allParts.filter(p => p.MasterPartID === target.MasterPartID && p.PartID !== target.PartID);
            if (others.length === 0) continue;

            // Sort to get the most recent previous revision
            others.sort((a, b) => (b.Rev || '1.0').localeCompare(a.Rev || '1.0'));
            const source = others[0];

            console.log(`[Restore] Repairing ${target.PartID} using links from ${source.PartID}...`);

            // 3. Clone links
            const sourceLinks = allLinks.filter(l => l.ParentID === source.PartID);
            sourceLinks.forEach(link => {
                const newBomRef = doc(collection(db, 'bom'));
                batch.set(newBomRef, {
                    ...link,
                    id: undefined, // Don't copy doc ID
                    ParentID: target.PartID
                });
                restoredCount++;
            });
        }

        if (restoredCount > 0) {
            await batch.commit();
            console.log(`[Success] Restored ${restoredCount} BOM links.`);
        } else {
            console.log("[Skip] No links needed restoration.");
        }

        process.exit(0);
    } catch (e) {
        console.error("[Error] Restore failed:", e);
        process.exit(1);
    }
}

restoreBOM();
