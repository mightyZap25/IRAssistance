// Use native fetch

async function fixReceiving() {
    try {
        console.log("Fetching receiving collection...");
        const res = await fetch('http://localhost:5050/api/db/quality_inspections');
        if (!res.ok) {
            console.error("Failed to fetch:", res.status, await res.text());
            return;
        }
        
        const items = await res.json();
        console.log(`Found ${items.length} items in receiving.`);
        
        let fixedCount = 0;
        for (const item of items) {
            if (item.CreatedAt && !item.createdAt) {
                console.log(`Fixing item ${item.ID || item.id}`);
                item.createdAt = item.CreatedAt;
                item.ReceivedAt = item.CreatedAt;
                
                const updateRes = await fetch(`http://localhost:5050/api/db/quality_inspections/${item.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item)
                });
                
                if (updateRes.ok) {
                    console.log(`Fixed ${item.id}`);
                    fixedCount++;
                } else {
                    console.error(`Failed to update ${item.id}`);
                }
            }
        }
        console.log(`Fixed ${fixedCount} items successfully.`);
    } catch (e) {
        console.error(e);
    }
}

fixReceiving();
