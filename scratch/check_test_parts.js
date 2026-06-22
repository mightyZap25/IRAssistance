async function run() {
    try {
        const res = await fetch('http://localhost:5050/api/db/parts');
        const parts = await res.json();
        
        console.log("Current 'test' parts:");
        for (const part of parts) {
            const name = (part.Name || '').toLowerCase();
            const partId = (part.PartID || '').toLowerCase();
            if (name.includes('test') || partId.includes('test') || part.PartID === 'IRMU0001') {
                console.log(`PartID: ${part.PartID}, Name: ${part.Name}`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
