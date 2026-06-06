import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch, getDocs } from "firebase/firestore";
// Native fetch is available in Node.js 18+

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

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1KdC0iI2jntpwhuYqYZ8w4iQturh5EdOWwWPwvwJam1k/export?format=csv";

// Simple CSV parser
function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];

        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') {
                i++;
            }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

async function restore() {
    try {
        console.log("[Restore] Fetching CSV from Google Sheet...");
        const res = await fetch(SHEET_CSV_URL);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const text = await res.text();
        
        console.log("[Restore] Parsing CSV...");
        const rows = parseCSV(text);
        if (rows.length < 2) {
            console.error("[Error] Empty or invalid CSV content.");
            return;
        }

        const headers = rows[0].map(h => h.trim());
        console.log("[Restore] Headers found:", headers);

        // Find column indices
        const idxMap = {
            id: headers.indexOf("ID"),
            name: headers.indexOf("Part Name"),
            category: headers.indexOf("Category"),
            revision: headers.indexOf("Revision"),
            owner: headers.indexOf("담당부서"),
            maker: headers.indexOf("공급사"),
            manufacturer: headers.indexOf("제조사"),
            mfn: headers.indexOf("MFN"),
            priceWon: headers.findIndex(h => h.includes("Unit price") && h.includes("Won")),
            priceUSD: headers.findIndex(h => h.includes("Unit price") && h.includes("USD")),
            processType: headers.indexOf("Process Type"),
            material: headers.indexOf("Material"),
            grade: headers.indexOf("Grade"),
            color: headers.indexOf("Color"),
            unit: headers.indexOf("UNIT"),
            ce: headers.indexOf("CE"),
            rohs: headers.indexOf("RoHS"),
            ul: headers.indexOf("UL"),
            kc: headers.indexOf("KC")
        };

        console.log("[Restore] Column indices resolved:", idxMap);

        const partsToUpload = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const partID = row[idxMap.id]?.trim();
            if (!partID || partID === "" || partID === "ID") continue;

            const name = row[idxMap.name]?.trim() || "";
            const categoryRaw = row[idxMap.category]?.trim() || "";
            // Normalize Category
            let category = "기구부품 (M)";
            if (categoryRaw.toLowerCase().includes("elec") || categoryRaw.includes("전자")) {
                category = "전자부품 (E)";
            } else if (categoryRaw.toLowerCase().includes("구매") || categoryRaw.toLowerCase().includes("other")) {
                category = "구매품 (O)";
            }

            const rawRev = row[idxMap.revision]?.trim() || "1.0";
            const rev = rawRev.includes(".") ? rawRev : `${rawRev}.0`;
            const masterPartID = partID;
            const fullPartID = `${masterPartID}-${rev}`;

            const owner = row[idxMap.owner]?.trim() || "";
            const maker = row[idxMap.maker]?.trim() || "";
            const manufacturer = row[idxMap.manufacturer]?.trim() || "";
            const mfn = row[idxMap.mfn]?.trim() || "";

            const rawPriceWon = row[idxMap.priceWon]?.replace(/[^0-9.-]+/g, "") || "0";
            const rawPriceUSD = row[idxMap.priceUSD]?.replace(/[^0-9.-]+/g, "") || "0";
            const price = Number(rawPriceWon) > 0 ? Number(rawPriceWon) : Number(rawPriceUSD);
            const currency = Number(rawPriceUSD) > 0 && Number(rawPriceWon) === 0 ? "USD" : "KRW";

            const processType = row[idxMap.processType]?.trim() || "";
            const material = row[idxMap.material]?.trim() || "";
            const grade = row[idxMap.grade]?.trim() || "";
            const color = row[idxMap.color]?.trim() || "";
            const unit = row[idxMap.unit]?.trim() || "EA";

            const safety = {
                CE: (row[idxMap.ce]?.trim() || "").toUpperCase() === "Y",
                ROHS: (row[idxMap.rohs]?.trim() || "").toUpperCase() === "Y",
                UL: (row[idxMap.ul]?.trim() || "").toUpperCase() === "Y",
                KC: (row[idxMap.kc]?.trim() || "").toUpperCase() === "Y",
                REACH: false
            };

            partsToUpload.push({
                PartID: fullPartID,
                MasterPartID: masterPartID,
                Name: name,
                Category: category,
                Class: partID.startsWith("IRP") || partID.startsWith("IRMAA") ? "Assembly (A)" : "Part (I)",
                Rev: rev,
                Owner: owner,
                Maker: maker,
                Manufacturer: manufacturer,
                MFN: mfn,
                UnitPrice: price,
                Currency: currency,
                ProcessType: processType,
                Material: material,
                Grade: grade,
                Color: color,
                Unit: unit,
                Safety: safety,
                SafetyLinks: { CE: "", ROHS: "", UL: "", KC: "", REACH: "" },
                IsLatestRevision: true,
                Lifecycle: "Active",
                CreatedAt: new Date(),
                LastModified: new Date()
            });
        }

        console.log(`[Restore] Prepared ${partsToUpload.length} parts for upload.`);

        // Batch upload
        let batch = writeBatch(db);
        let count = 0;

        for (const part of partsToUpload) {
            const docRef = doc(db, 'parts', part.PartID);
            batch.set(docRef, part);
            count++;

            if (count % 400 === 0) {
                await batch.commit();
                console.log(`[Restore] Committed batch of 400 parts...`);
                batch = writeBatch(db);
            }
        }

        if (count % 400 !== 0) {
            await batch.commit();
        }

        console.log(`[Success] Successfully restored ${count} parts into Firestore.`);
        process.exit(0);
    } catch (error) {
        console.error("[Error] Restoration failed:", error);
        process.exit(1);
    }
}

restore();
