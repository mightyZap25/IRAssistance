import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const jsonPath = 'c:\\Users\\park sungyong\\Downloads\\odooapi-501907-ad0f75e22803.json';
const testRecipient = 'vs4647vs@mightyzap.com';
const adminEmail = 'jogak@mightyzap.com'; // assuming user is admin

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
    console.log(`Getting User token (impersonating admin: ${adminEmail})...`);
    try {
        const userToken = await getJwt(serviceAccount, ['https://www.googleapis.com/auth/chat.spaces', 'https://www.googleapis.com/auth/chat.messages'], adminEmail);
        console.log("User token obtained!");
        
        console.log(`Looking up numeric ID for ${testRecipient} via Chat API users.get...`);
        const userRes = await fetch(`https://chat.googleapis.com/v1/users/${testRecipient}`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        const userData = await userRes.json();
        if (userData.error) {
            console.log("User lookup failed:", userData.error);
            return;
        }
        const numericIdStr = userData.name;
        console.log(`Numeric ID found: ${numericIdStr}`);
        
        console.log("Getting Bot token...");
        const botToken = await getJwt(serviceAccount, ['https://www.googleapis.com/auth/chat.bot']);
        console.log("Bot token obtained!");
        
        console.log("Setting up DM with Bot using App Auth...");
        const setupRes = await fetch('https://chat.googleapis.com/v1/spaces:setup', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                space: { spaceType: "DIRECT_MESSAGE", singleUserBotDm: true },
                memberships: [{ member: { name: numericIdStr, type: "HUMAN" } }]
            })
        });
        const setupData = await setupRes.json();
        if (setupData.error) {
            console.log("Setup failed:", setupData.error);
            return;
        }
        console.log(`DM Space setup successful: ${setupData.name}`);
        
        console.log("Sending message via Bot...");
        const msgRes = await fetch(`https://chat.googleapis.com/v1/${setupData.name}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: "Test message from the Bot using numeric ID lookup!" })
        });
        const msgData = await msgRes.json();
        console.log(msgData.error ? `Message failed: ${msgData.error}` : "Message sent successfully!");
    } catch (e) {
        console.error(e);
    }
}
run();
