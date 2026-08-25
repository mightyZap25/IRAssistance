import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const jsonPath = 'c:\\Users\\park sungyong\\Downloads\\odooapi-501907-ad0f75e22803.json';
const testRecipient = 'jogak@mightyzap.com'; // 테스트 수신자 이메일

async function getGoogleChatAccessToken(serviceAccount) {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/chat.spaces https://www.googleapis.com/auth/chat.messages https://www.googleapis.com/auth/chat.bot',
        aud: 'https://oauth2.googleapis.com/token',
        exp: exp,
        iat: iat
    })).toString('base64url');
    
    const signatureInput = `${header}.${claim}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');
    const jwt = `${signatureInput}.${signature}`;
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    
    const data = await response.json();
    if (data.error) {
        throw new Error(`OAuth Token Exchange Failed: ${data.error_description || data.error}`);
    }
    return data.access_token;
}

async function runTest() {
    console.log(`Loading JSON key from: ${jsonPath}`);
    if (!fs.existsSync(jsonPath)) {
        console.error("Error: JSON file does not exist at specified path!");
        return;
    }

    try {
        const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        console.log("Generating access token...");
        const token = await getGoogleChatAccessToken(serviceAccount);
        console.log("Access token generated successfully.");

        console.log(`Finding 1:1 DM space with: ${testRecipient}`);
        const setupResponse = await fetch(`https://chat.googleapis.com/v1/spaces:findDirectMessage?name=users/${testRecipient}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const setupData = await setupResponse.json();
        if (setupData.error) {
            console.error("\n❌ Find Direct Message Failed:");
            console.error(JSON.stringify(setupData.error, null, 2));
            return;
        }

        const spaceName = setupData.name;
        console.log(`Space resolved: ${spaceName}. Sending test message...`);

        const msgResponse = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify({
                text: "🔔 [mightyONE 연동 테스트] 구글 챗 API가 정상적으로 작동하고 있습니다!"
            })
        });

        const msgData = await msgResponse.json();
        if (msgData.error) {
            console.error("\n❌ Message Sending Failed:");
            console.error(JSON.stringify(msgData.error, null, 2));
            return;
        }

        console.log("\n✅ SUCCESS! Google Chat DM sent successfully.");
        console.log(JSON.stringify(msgData, null, 2));

    } catch (e) {
        console.error("\n❌ Script execution failed with exception:");
        console.error(e);
    }
}

runTest();
