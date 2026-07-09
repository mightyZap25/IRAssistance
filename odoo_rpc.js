import xmlrpc from 'xmlrpc';

/**
 * Odoo XML-RPC / JSON-RPC Client Wrapper
 */
class OdooClient {
    constructor(url, db, username, password, sessionId = null) {
        this.url = url;
        this.db = db;
        this.username = username;
        this.password = password;
        this.sessionId = sessionId;
        this.uid = null;
        
        const parsedUrl = new URL(url);
        this.clientOptions = {
            host: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: '/xmlrpc/2/common',
            https: parsedUrl.protocol === 'https:'
        };
        this.objectOptions = {
            ...this.clientOptions,
            path: '/xmlrpc/2/object'
        };
    }

    authenticate() {
        return new Promise((resolve, reject) => {
            if (this.sessionId) {
                // sessionId가 제공되면 별도 인증 없이 통과 (JSON-RPC에서 처리)
                this.uid = 'session_auth';
                return resolve(this.uid);
            }
            const client = this.clientOptions.https ? xmlrpc.createSecureClient(this.clientOptions) : xmlrpc.createClient(this.clientOptions);
            client.methodCall('authenticate', [this.db, this.username, this.password, {}], (error, value) => {
                if (error) {
                    reject(error);
                } else if (!value) {
                    reject(new Error('Authentication failed'));
                } else {
                    this.uid = value;
                    resolve(value);
                }
            });
        });
    }

    execute_kw(model, method, args, kwargs = {}) {
        return new Promise((resolve, reject) => {
            if (!this.uid && !this.sessionId) {
                return reject(new Error('Not authenticated'));
            }

            if (this.sessionId) {
                // JSON-RPC 방식 (session_id 쿠키 사용)
                const payload = {
                    jsonrpc: '2.0',
                    method: 'call',
                    id: Math.floor(Math.random() * 1000000),
                    params: { model, method, args, kwargs }
                };
                
                const attemptFetch = async (retries = 3) => {
                    try {
                        const res = await fetch(`${this.url}/web/dataset/call_kw`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Cookie': `session_id=${this.sessionId}`
                            },
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        if (data.error) {
                            reject(new Error(data.error.data?.message || data.error.message));
                        } else {
                            resolve(data.result);
                        }
                    } catch (err) {
                        if (retries > 0 && err.message.includes('fetch failed')) {
                            console.log(`[Odoo] fetch failed, retrying... (${retries} retries left)`);
                            setTimeout(() => attemptFetch(retries - 1), 1000); // 1초 대기 후 재시도
                        } else {
                            reject(err);
                        }
                    }
                };
                
                attemptFetch();
            } else {
                // XML-RPC 방식
                const client = this.objectOptions.https ? xmlrpc.createSecureClient(this.objectOptions) : xmlrpc.createClient(this.objectOptions);
                client.methodCall('execute_kw', [this.db, this.uid, this.password, model, method, args, kwargs], (error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value);
                    }
                });
            }
        });
    }
}

export default OdooClient;
