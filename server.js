import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import odooRoutes from './odoo_routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Global Exception Handler to prevent server from crashing under DB connection failures
process.on('uncaughtException', (err) => {
    console.error('[Global Uncaught Exception] Server kept alive. Error:', err.message || err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global Unhandled Rejection] Server kept alive. Reason:', reason?.message || reason);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5050;

// OS별 안전한 AppData(사용자 폴더) 경로에 db_config.json 위치 설정 및 복사 초기화
const getDbConfigPath = () => {
    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library/Application Support') : path.join(process.env.HOME, '.config'));
    const configFolder = path.join(appData, 'IR-Assistant-ERP');
    if (!fs.existsSync(configFolder)) {
        fs.mkdirSync(configFolder, { recursive: true });
    }
    
    const userConfigFile = path.join(configFolder, 'db_config.json');
    
    // AppData 폴더에 db_config.json이 없는 경우, 템플릿 복사 시도
    if (!fs.existsSync(userConfigFile)) {
        const resourcesPath = process.env.ELECTRON_RESOURCES_PATH || process.cwd();
        const possibleResourcesPaths = [
            resourcesPath,
            path.join(resourcesPath, 'resources'),
            path.join(__dirname, '..', '..'),
            process.cwd()
        ];
        
        let templateCopied = false;
        for (const p of possibleResourcesPaths) {
            const templatePath = path.join(p, 'db_config.json');
            if (fs.existsSync(templatePath)) {
                try {
                    fs.copyFileSync(templatePath, userConfigFile);
                    console.log(`[DB Config] Initialized configuration template from: ${templatePath}`);
                    templateCopied = true;
                    break;
                } catch (e) {
                    console.error(`Failed to copy config template from ${templatePath}:`, e);
                }
            }
        }
        
        if (!templateCopied) {
            console.log('[DB Config] No database configuration template found. Fallback profile will be created.');
        }
    }
    
    return userConfigFile;
};

const CONFIG_FILE = getDbConfigPath();

// Helper: Load Database Configuration (JSON first, then .env)
const loadDbConfig = () => {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            // If it is in the new multi-profile format
            if (parsed.currentProfile && parsed[parsed.currentProfile]) {
                return parsed;
            } else {
                // Legacy format migration
                return {
                    currentProfile: 'local',
                    local: {
                        host: parsed.host || '192.168.0.7',
                        port: parsed.port || '15432',
                        user: parsed.user || 'postgres',
                        password: parsed.password || 'postgres',
                        database: parsed.database || 'ir_assistant'
                    },
                    remote: {
                        host: parsed.host || '192.168.0.7',
                        port: parsed.port || '15432',
                        user: parsed.user || 'postgres',
                        password: parsed.password || 'postgres',
                        database: parsed.database || 'ir_assistant'
                    }
                };
            }
        }
    } catch (err) {
        console.error("Failed to load db_config.json, falling back to environment variables:", err);
    }
    const defaultProfile = {
        host: process.env.PGHOST || '192.168.0.2',
        port: process.env.PGPORT || '15432',
        user: process.env.PGUSER || 'irerp',
        password: process.env.PGPASSWORD || 'IRERP060705!',
        database: process.env.PGDATABASE || 'postgres',
    };
    return {
        currentProfile: 'local',
        local: { ...defaultProfile },
        remote: { ...defaultProfile }
    };
};

let currentConfig = loadDbConfig();
let pool = null;

// Initialize or Reinitialize PostgreSQL Connection Pool
const initPgPool = (configObj) => {
    if (pool) {
        console.log('[PG Pool] Closing old connection pool...');
        pool.end().catch(err => console.error("Error closing PG pool:", err));
    }
    
    const activeProfile = configObj.currentProfile || 'local';
    const activeConfig = configObj[activeProfile];
    const pgPort = isNaN(parseInt(activeConfig.port)) ? 15432 : parseInt(activeConfig.port);
    
    pool = new pg.Pool({
        host: activeConfig.host,
        port: pgPort,
        user: activeConfig.user,
        password: activeConfig.password,
        database: activeConfig.database,
        connectionTimeoutMillis: 5000,
    });
    
    pool.on('error', (err) => {
        console.error('[PG Pool] Unexpected error on idle client:', err.message);
    });
    
    console.log(`[PG Pool] Initialized PG Pool for [${activeProfile}] ${activeConfig.user}@${activeConfig.host}:${pgPort}/${activeConfig.database}`);
};

// Start default connection pool
initPgPool(currentConfig);

// Helper: Validate table/collection name to prevent SQL injection
const validateCollection = (name) => {
    const pattern = /^[a-zA-Z0-9_]+$/;
    return pattern.test(name);
};

// Helper: Ensure a table exists for the given collection
const ensureTableExists = async (collection) => {
    if (!validateCollection(collection)) {
        throw new Error('Invalid collection name format');
    }
    const queryText = `
        CREATE TABLE IF NOT EXISTS "${collection}" (
            id VARCHAR(255) PRIMARY KEY,
            data JSONB NOT NULL
        )
    `;
    await pool.query(queryText);
};

// API: Get current DB Config with profiles (excluding sensitive password details completely or masking them)
app.get('/api/config/db', (req, res) => {
    // Hide passwords for security
    const safeConfig = {
        currentProfile: currentConfig.currentProfile || 'local',
        local: {
            host: currentConfig.local?.host || '',
            port: currentConfig.local?.port || '15432',
            user: currentConfig.local?.user || '',
            database: currentConfig.local?.database || '',
            hasPassword: !!currentConfig.local?.password
        },
        remote: {
            host: currentConfig.remote?.host || '',
            port: currentConfig.remote?.port || '15432',
            user: currentConfig.remote?.user || '',
            database: currentConfig.remote?.database || '',
            hasPassword: !!currentConfig.remote?.password
        }
    };
    res.json(safeConfig);
});

// API: Test a DB Config temporarily without saving it
app.post('/api/config/db/test', async (req, res) => {
    const { host, port, user, password, database, profileType } = req.body;
    
    // Fallback password if not supplied in test
    let effectivePassword = password;
    if (!effectivePassword && profileType && currentConfig[profileType]) {
        effectivePassword = currentConfig[profileType].password;
    }
    const pgPort = isNaN(parseInt(port)) ? 15432 : parseInt(port);

    console.log(`[DB Config Test] Initiating connection test to ${user}@${host}:${pgPort}/${database}`);

    const tempPool = new pg.Pool({
        host,
        port: pgPort,
        user,
        password: effectivePassword,
        database,
        connectionTimeoutMillis: 5000,
    });

    tempPool.on('error', (err) => {
        console.error('[DB Config Test Pool] Unexpected idle client error:', err.message);
    });

    try {
        const result = await tempPool.query('SELECT 1 as test');
        await tempPool.end();
        console.log('[DB Config Test] Connection test successful');
        res.json({ success: true, message: '연결 성공!' });
    } catch (err) {
        await tempPool.end().catch(() => {});
        console.error('[DB Config Test] Connection test failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Save and Apply DB configuration (handles dual profile saving and switching)
app.post('/api/config/db', async (req, res) => {
    const { currentProfile, local, remote } = req.body;
    
    if (!currentProfile || !local || !remote) {
        return res.status(400).json({ success: false, error: 'Invalid config format' });
    }

    // Capture passwords from current configuration if not provided (not modified)
    const newConfig = {
        currentProfile,
        local: {
            host: local.host,
            port: isNaN(parseInt(local.port)) ? 15432 : parseInt(local.port),
            user: local.user,
            password: (local.password !== undefined && local.password !== '') 
                ? local.password 
                : (currentConfig.local?.password || ''),
            database: local.database
        },
        remote: {
            host: remote.host,
            port: isNaN(parseInt(remote.port)) ? 15432 : parseInt(remote.port),
            user: remote.user,
            password: (remote.password !== undefined && remote.password !== '') 
                ? remote.password 
                : (currentConfig.remote?.password || ''),
            database: remote.database
        }
    };
    
    const activeProfile = newConfig.currentProfile;
    
    console.log(`[DB Config Save] Saving config for active profile: [${activeProfile}]`);
    
    try {
        // Write to local json config file
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4), 'utf8');
        
        // Apply configuration live
        currentConfig = newConfig;
        initPgPool(currentConfig);
        
        res.json({ success: true, message: `설정이 저장되고 [${activeProfile}] 프로필로 연결되었습니다.` });
    } catch (err) {
        console.error('[DB Config Save] Failed to write config file:', err);
        res.status(500).json({ success: false, error: `설정 저장 실패: ${err.message}` });
    }
});

// API: Initialize/seed DB with frontend backup files (called by client on first run)
app.post('/api/db/init', async (req, res) => {
    const { collection, data } = req.body;
    
    if (!collection || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Invalid payload. Expecting collection and data array.' });
    }
    
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    
    console.log(`[Backup Init] Starting seeding for collection: "${collection}" with ${data.length} records.`);
    
    try {
        await ensureTableExists(collection);
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const item of data) {
                const id = item.id || item.PartID || item.uid || 'auto_' + Math.random().toString(36).substr(2, 9);
                const itemData = { ...item, id };
                
                await client.query(
                    `INSERT INTO "${collection}" (id, data) VALUES ($1, $2)
                     ON CONFLICT (id) DO UPDATE SET data = $2`,
                    [id, JSON.stringify(itemData)]
                );
            }
            await client.query('COMMIT');
            res.json({ success: true, count: data.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(`Error seeding collection ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// API: Get all documents in a collection
app.get('/api/db/:collection', async (req, res) => {
    const { collection } = req.params;
    
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    
    try {
        await ensureTableExists(collection);
        const result = await pool.query(`SELECT id, data FROM "${collection}"`);
        const items = result.rows.map(row => ({ ...row.data, id: row.id }));
        res.json(items);
    } catch (err) {
        console.error(`Error fetching from ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// API: Get single document in a collection
app.get('/api/db/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    
    try {
        await ensureTableExists(collection);
        const result = await pool.query(`SELECT data FROM "${collection}" WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.json(null);
        }
        res.json({ ...result.rows[0].data, id });
    } catch (err) {
        console.error(`Error fetching doc ${id} from ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// API: Upsert a document (Insert or Update)
app.post('/api/db/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    const docData = req.body;
    
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    
    try {
        await ensureTableExists(collection);
        const updatedData = { ...docData, id };
        
        await pool.query(
            `INSERT INTO "${collection}" (id, data) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(updatedData)]
        );
        console.log(`[DB Server] Saved doc in "${collection}": ${id}`);
        res.json({ success: true, id, data: updatedData });
    } catch (err) {
        console.error(`Error upserting doc ${id} in ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// API: Delete a document
app.delete('/api/db/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    
    try {
        await ensureTableExists(collection);
        await pool.query(`DELETE FROM "${collection}" WHERE id = $1`, [id]);
        console.log(`[DB Server] Deleted doc in "${collection}": ${id}`);
        res.json({ success: true });
    } catch (err) {
        console.error(`Error deleting doc ${id} in ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Mock Firebase (mockFirebase.js) 호환 API 엔드포인트
// ==========================================

// 1. GET: 컬렉션 내의 문서 목록 조회 (where, orderBy, limit 필터 지원)
app.get('/api/collections/:collection/docs', async (req, res) => {
    const { collection } = req.params;
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    try {
        await ensureTableExists(collection);
        const result = await pool.query(`SELECT id, data FROM "${collection}"`);
        
        // MockFirebase.js가 기대하는 { id, data } 형식으로 객체 구조화
        let items = result.rows.map(row => ({
            id: row.id,
            data: { ...row.data, id: row.id }
        }));
        
        // where 필터 파싱 및 적용
        let wheres = [];
        if (req.query.where) {
            try {
                if (Array.isArray(req.query.where)) {
                    wheres = req.query.where.map(w => JSON.parse(w));
                } else {
                    wheres = [JSON.parse(req.query.where)];
                }
            } catch (parseErr) {
                console.error("[DB Server] Where clause parse error:", parseErr);
            }
        }
        
        for (const w of wheres) {
            const { field, op, val } = w;
            items = items.filter(item => {
                const itemVal = item.data ? item.data[field] : undefined;
                if (op === '==' || op === '===') return itemVal === val;
                if (op === '!=') return itemVal !== val;
                if (op === '>') return itemVal > val;
                if (op === '>=') return itemVal >= val;
                if (op === '<') return itemVal < val;
                if (op === '<=') return itemVal <= val;
                if (op === 'array-contains') {
                    return Array.isArray(itemVal) && itemVal.includes(val);
                }
                return true;
            });
        }
        
        // orderBy 정렬 파싱 및 적용
        let orderBys = [];
        if (req.query.orderBy) {
            try {
                if (Array.isArray(req.query.orderBy)) {
                    orderBys = req.query.orderBy.map(o => JSON.parse(o));
                } else {
                    orderBys = [JSON.parse(req.query.orderBy)];
                }
            } catch (parseErr) {
                console.error("[DB Server] OrderBy clause parse error:", parseErr);
            }
        }
        for (const o of orderBys) {
            const { field, dir } = o;
            const isAsc = dir !== 'desc';
            items.sort((a, b) => {
                const valA = a.data ? a.data[field] : undefined;
                const valB = b.data ? b.data[field] : undefined;
                if (valA === undefined || valA === null) return isAsc ? 1 : -1;
                if (valB === undefined || valB === null) return isAsc ? -1 : 1;
                if (valA < valB) return isAsc ? -1 : 1;
                if (valA > valB) return isAsc ? 1 : -1;
                return 0;
            });
        }
        
        // limit 제한 적용
        if (req.query.limit) {
            const lim = parseInt(req.query.limit);
            if (!isNaN(lim)) {
                items = items.slice(0, lim);
            }
        }
        
        res.json({ docs: items });
    } catch (err) {
        console.error(`Error query docs from ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// 2. GET: 특정 문서 상세 정보 조회
app.get('/api/collections/:collection/docs/:id', async (req, res) => {
    const { collection, id } = req.params;
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    try {
        await ensureTableExists(collection);
        const result = await pool.query(`SELECT data FROM "${collection}" WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.json({ data: null }); // Firebase-like: empty snapshot
        }
        res.json({ data: { ...result.rows[0].data, id } });
    } catch (err) {
        console.error(`Error get doc ${id} from ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// 3. POST: 문서 생성 (ID 자동 생성 지원)
app.post('/api/collections/:collection/docs', async (req, res) => {
    const { collection } = req.params;
    const docData = req.body;
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    try {
        await ensureTableExists(collection);
        const id = docData.id || 'auto_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        const finalData = { ...docData, id };
        await pool.query(
            `INSERT INTO "${collection}" (id, data) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(finalData)]
        );
        res.json({ id });
    } catch (err) {
        console.error(`Error add doc in ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// 4. PUT: 문서 전체 덮어쓰기 (setDoc 용)
app.put('/api/collections/:collection/docs/:id', async (req, res) => {
    const { collection, id } = req.params;
    const docData = req.body;
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    try {
        await ensureTableExists(collection);
        const finalData = { ...docData, id };
        await pool.query(
            `INSERT INTO "${collection}" (id, data) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(finalData)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(`Error put doc ${id} in ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// 5. PATCH: 문서 일부 수정 (updateDoc / setDoc merge용)
app.patch('/api/collections/:collection/docs/:id', async (req, res) => {
    const { collection, id } = req.params;
    const updateData = req.body;
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    try {
        await ensureTableExists(collection);
        const getRes = await pool.query(`SELECT data FROM "${collection}" WHERE id = $1`, [id]);
        let currentData = {};
        if (getRes.rows.length > 0) {
            currentData = getRes.rows[0].data;
        }
        const finalData = { ...currentData, ...updateData, id };
        await pool.query(
            `INSERT INTO "${collection}" (id, data) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(finalData)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(`Error patch doc ${id} in ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// 6. DELETE: 문서 삭제
app.delete('/api/collections/:collection/docs/:id', async (req, res) => {
    const { collection, id } = req.params;
    if (!validateCollection(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
    }
    try {
        await ensureTableExists(collection);
        await pool.query(`DELETE FROM "${collection}" WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(`Error delete doc ${id} in ${collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy for Google Sheets to bypass CORS
app.get('/api/proxy-sheet/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
        const response = await fetch(exportUrl);
        if (!response.ok) {
            throw new Error(`Google Sheets responded with status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('[Proxy] Failed to fetch sheet:', err);
        res.status(500).json({ error: err.message });
    }
});

// Serve built frontend assets in production/Electron mode
const distPath = path.join(__dirname, 'dist');
app.use('/api/odoo', odooRoutes);
app.use(express.static(distPath));
// SPA fallback: Serve index.html for all non-API GET requests without path-to-regexp v5 issues
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
        return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
});
console.log(`[DB Server] Static assets hosting enabled: ${distPath}`);

// Start server
app.listen(PORT, () => {
    console.log(`[Postgres Proxy Server] Running on http://localhost:${PORT}`);
    const activeProfile = currentConfig.currentProfile || 'local';
    const activeConfig = currentConfig[activeProfile] || {};
    console.log(`[Postgres Proxy Server] Active configuration: ${activeConfig.user}@${activeConfig.host}:${activeConfig.port}`);
});
