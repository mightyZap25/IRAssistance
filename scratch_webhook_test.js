const https = require('https');

const data = JSON.stringify({
    app_name: "TestApp",
    record_name: "TestRecord001",
    csv_data: "col1,col2\nval1,val2\n"
});

const options = {
    hostname: 'script.google.com',
    port: 443,
    path: '/macros/s/AKfycbwEqEIkheWEg3SoFq9A7hyA92dvWH4tuxIYDXHYGRSOE4BcfTg1yLvAyhuIumkhSda0gg/exec',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    console.log(`statusCode: ${res.statusCode}`);
    
    // Handle redirect for GAS
    if (res.statusCode === 302) {
        console.log("Redirecting to: " + res.headers.location);
        https.get(res.headers.location, (redirectRes) => {
            redirectRes.on('data', d => process.stdout.write(d));
        });
        return;
    }

    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(data);
req.end();
