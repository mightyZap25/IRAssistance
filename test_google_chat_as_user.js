import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const jsonPath = 'c:\\Users\\park sungyong\\Downloads\\odooapi-501907-ad0f75e22803.json';
const senderEmail = 'vs4647vs@mightyzap.com';
const recipientEmail = 'jogak@mightyzap.com'; 

async function getJwt(serviceAccount, scopes, sub = null) {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimObj = {
        iss: serviceAccount.client_email,
        scope: scopes.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        exp: exp,
        iat: iat
    };
    if (sub) {
        claimObj.sub = sub;
    }
    const claim = Buffer.from(JSON.stringify(claimObj)).toString('base64url');
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
    if (data.error) throw new Error(data.error_description || data.error);
    return data.access_token;
}

async function run() {
    const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`Getting User token (impersonating SENDER: ${senderEmail})...`);
    try {
        const userToken = await getJwt(serviceAccount, ['https://www.googleapis.com/auth/chat.spaces', 'https://www.googleapis.com/auth/chat.messages'], senderEmail);
        console.log("User token obtained!");
        
        console.log(`Setting up DM with ${recipientEmail} via spaces:setup with User Auth...`);
        const setupRes = await fetch('https://chat.googleapis.com/v1/spaces:setup', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                space: { spaceType: "DIRECT_MESSAGE" },
                memberships: [{ member: { name: `users/${recipientEmail}`, type: "HUMAN" } }]
            })
        });
        const setupData = await setupRes.json();
        if (setupData.error) {
            console.log("Setup failed:", setupData.error);
            return;
        }
        console.log(`DM Space setup successful: ${setupData.name}`);
        
        console.log(`Sending message AS ${senderEmail}...`);
        const msgRes = await fetch(`https://chat.googleapis.com/v1/${setupData.name}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: "다이나믹 발송자 테스트: 승빈이가 조각님에게 보내는 알림!" })
        });
        const msgData = await msgRes.json();
        console.log(msgData.error ? `Message failed: ${msgData.error}` : "Message sent successfully!");
    } catch (e) {
        console.error(e);
    }
}
run();
