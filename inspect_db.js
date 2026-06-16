import pg from 'pg';
import fs from 'fs';

const config = {
    host: "100.67.238.32",
    port: 15432,
    user: "irerp",
    password: "irerp060705!",
    database: "postgres"
};

async function inspect() {
    const pool = new pg.Pool(config);
    try {
        console.log("--- Production Requests ---");
        const prs = await pool.query('SELECT data FROM "production_requests"');
        const sortedPRs = prs.rows.map(r => r.data).sort((a, b) => {
            const timeA = a.CreatedAt?.seconds ? a.CreatedAt.seconds * 1000 : new Date(a.CreatedAt || 0).getTime();
            const timeB = b.CreatedAt?.seconds ? b.CreatedAt.seconds * 1000 : new Date(b.CreatedAt || 0).getTime();
            return timeA - timeB;
        });

        sortedPRs.forEach(pr => {
            console.log(`[${pr.PRNumber || pr.id}] ${pr.PartName} | Qty: ${pr.TargetQty} | Created: ${pr.CreatedAt?.seconds ? new Date(pr.CreatedAt.seconds*1000).toISOString() : pr.CreatedAt}`);
            if (pr.Items) {
                pr.Items.forEach(item => {
                    console.log(`  - Item: ${item.PartID} (${item.PartName}) | Target: ${item.TargetQty}`);
                });
            }
        });

        console.log("\n--- Critical Inventory (Commonly used in PRs) ---");
        const inv = await pool.query('SELECT data FROM "inventory"');
        // Let's filter for parts that appear in the PRs
        const usedParts = new Set();
        sortedPRs.forEach(pr => {
            if (pr.Items) pr.Items.forEach(i => usedParts.add(i.PartID));
            else if (pr.PartID) usedParts.add(pr.PartID);
        });

        inv.rows.forEach(r => {
            if (usedParts.has(r.data.PartID)) {
                console.log(`- ${r.data.PartID}: OnHand: ${r.data.OnHand}`);
            }
        });

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

inspect();
