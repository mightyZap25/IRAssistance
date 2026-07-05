import xmlrpc from 'xmlrpc';

/**
 * Odoo XML-RPC Client Wrapper
 */
class OdooClient {
    constructor(url, db, username, password) {
        this.url = url;
        this.db = db;
        this.username = username;
        this.password = password;
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
            if (!this.uid) {
                return reject(new Error('Not authenticated'));
            }
            const client = this.objectOptions.https ? xmlrpc.createSecureClient(this.objectOptions) : xmlrpc.createClient(this.objectOptions);
            client.methodCall('execute_kw', [this.db, this.uid, this.password, model, method, args, kwargs], (error, value) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(value);
                }
            });
        });
    }
}

export default OdooClient;
