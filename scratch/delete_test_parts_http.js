

async function run() {
    try {
        console.log('Fetching all parts...');
        const res = await fetch('http://localhost:5050/api/db/parts');
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const parts = await res.json();
        
        console.log(`Total parts found: ${parts.length}`);
        let deleted = 0;
        
        for (const part of parts) {
            const name = (part.Name || '').toLowerCase();
            const partId = (part.PartID || '').toLowerCase();
            const id = part.id;
            
            if (name.includes('test') || partId.includes('test')) {
                if (part.PartID === 'IRMU0001') {
                    console.log(`Keeping: ${part.PartID} - ${part.Name} (ID: ${id})`);
                } else {
                    console.log(`Deleting: ${part.PartID} - ${part.Name} (ID: ${id})`);
                    const delRes = await fetch(`http://localhost:5050/api/db/parts/${id}`, { method: 'DELETE' });
                    if (delRes.ok) {
                        console.log(` -> Deleted successfully.`);
                        deleted++;
                    } else {
                        console.log(` -> Failed to delete.`);
                    }
                }
            }
        }
        console.log(`Done! Deleted ${deleted} parts.`);
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
