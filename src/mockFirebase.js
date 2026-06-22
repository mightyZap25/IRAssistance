import partsBackup from './parts_backup.json';
import bomBackup from './bom_backup.json';

// Initialize mock DB in PostgreSQL via Express on first run
async function initMockDB() {
    if (!localStorage.getItem('mock_pg_db_seeded_v1')) {
        console.log('[MockDB] Seeding PostgreSQL with backups via Express proxy...');
        try {
            // Seed parts
            const partsRes = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection: 'parts', data: partsBackup })
            });
            const partsResult = await partsRes.json();
            console.log('[MockDB] Parts seed result:', partsResult);

            // Seed bom
            const bomRes = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection: 'bom', data: bomBackup })
            });
            const bomResult = await bomRes.json();
            console.log('[MockDB] BOM seed result:', bomResult);

            // Mock admin user seed
            const mockUsers = [
                {
                    uid: 'mock-admin',
                    email: 'admin@irrocot.com',
                    displayName: '로컬 마스터',
                    role: 'admin',
                    department: 'Management'
                }
            ];
            const userRes = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection: 'users', data: mockUsers })
            });
            const userResult = await userRes.json();
            console.log('[MockDB] Users seed result:', userResult);

            localStorage.setItem('mock_pg_db_seeded_v1', 'true');
        } catch (err) {
            console.error('[MockDB] Database seeding failed:', err);
        }
    }
}

initMockDB();

// Mock Firestore functions communicating with Express proxy server
export const mockFirestore = {
    collection: (db, name) => {
        return { collectionName: name };
    },
    doc: (...args) => {
        if (args.length === 3) {
            return { collectionName: args[1], id: args[2] };
        } else if (args.length === 2) {
            return { collectionName: args[0].collectionName || args[0], id: args[1] };
        }
        if (args.length === 1 && args[0].collectionName) {
            return { collectionName: args[0].collectionName, id: 'auto_' + Math.random().toString(36).substr(2, 9) };
        }
        return { collectionName: 'unknown', id: 'unknown' };
    },
    getDocs: async (q) => {
        const collectionName = q.collectionName || q;
        try {
            const res = await fetch(`/api/db/${collectionName}`);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            let data = await res.json();
            
            // Filter out Category/Series from generic parts queries
            if (collectionName === 'parts') {
                const isCategoryQuery = q.constraints && q.constraints.some(c => 
                    c.field === 'Class' && (c.val === 'BOM_Category' || (Array.isArray(c.val) && c.val.includes('BOM_Category')))
                );
                if (!isCategoryQuery) {
                    data = data.filter(item => item.Class !== 'BOM_Category' && item.Class !== 'BOM_Series');
                }
            }
            
            // Apply local filtering if constraints exist
            if (q.constraints && q.constraints.length > 0) {
                q.constraints.forEach(c => {
                    if (c.type === 'where') {
                        data = data.filter(item => {
                            const itemVal = item[c.field];
                            if (c.op === '==') return itemVal === c.val;
                            if (c.op === '!=') return itemVal !== c.val;
                            if (c.op === 'in') return Array.isArray(c.val) && c.val.includes(itemVal);
                            if (c.op === 'not-in') return Array.isArray(c.val) && !c.val.includes(itemVal);
                            if (c.op === '>') return itemVal > c.val;
                            if (c.op === '>=') return itemVal >= c.val;
                            if (c.op === '<') return itemVal < c.val;
                            if (c.op === '<=') return itemVal <= c.val;
                            if (c.op === 'array-contains') return Array.isArray(itemVal) && itemVal.includes(c.val);
                            if (c.op === 'array-contains-any') return Array.isArray(itemVal) && Array.isArray(c.val) && itemVal.some(v => c.val.includes(v));
                            return true;
                        });
                    }
                    if (c.type === 'orderBy') {
                        data = data.sort((a, b) => {
                            if (a[c.field] < b[c.field]) return c.dir === 'desc' ? 1 : -1;
                            if (a[c.field] > b[c.field]) return c.dir === 'desc' ? -1 : 1;
                            return 0;
                        });
                    }
                    if (c.type === 'limit') {
                        data = data.slice(0, c.n);
                    }
                });
            }

            return {
                docs: data.map(item => {
                    const docId = item.id || item.PartID || item.uid || '';
                    return {
                        id: docId,
                        ref: { collectionName, id: docId },
                        data: () => item,
                        exists: () => true
                    };
                }),
                size: data.length,
                empty: data.length === 0,
                forEach: (cb) => {
                    data.forEach(item => {
                        const docId = item.id || item.PartID || item.uid || '';
                        cb({
                            id: docId,
                            ref: { collectionName, id: docId },
                            data: () => item
                        });
                    });
                }
            };
        } catch (err) {
            console.error(`[MockDB] getDocs error for ${collectionName}:`, err);
            return { docs: [], size: 0, empty: true, forEach: () => {} };
        }
    },
    getDoc: async (docRef) => {
        const { collectionName, id } = docRef;
        try {
            const res = await fetch(`/api/db/${collectionName}/${id}`);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const item = await res.json();
            return {
                exists: () => !!item,
                data: () => item || null,
                id
            };
        } catch (err) {
            console.error(`[MockDB] getDoc error for ${collectionName}/${id}:`, err);
            return { exists: () => false, data: () => null, id };
        }
    },
    setDoc: async (docRef, docData, options = {}) => {
        const { collectionName, id } = docRef;
        try {
            let finalData = { ...docData };
            
            if (options.merge) {
                const getRes = await fetch(`/api/db/${collectionName}/${id}`);
                const existing = getRes.ok ? await getRes.json() : null;
                if (existing) {
                    finalData = { ...existing, ...docData };
                }
            }
            
            const res = await fetch(`/api/db/${collectionName}/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalData)
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            console.log(`[MockDB] setDoc saved ${collectionName}/${id}`);
            return true;
        } catch (err) {
            console.error(`[MockDB] setDoc error for ${collectionName}/${id}:`, err);
            return false;
        }
    },
    addDoc: async (collRef, docData) => {
        const collectionName = collRef.collectionName;
        const id = 'auto_' + Math.random().toString(36).substr(2, 9);
        try {
            const res = await fetch(`/api/db/${collectionName}/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...docData, id })
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            console.log(`[MockDB] addDoc added ${collectionName}/${id}`);
            return { id, ...docData };
        } catch (err) {
            console.error(`[MockDB] addDoc error for ${collectionName}:`, err);
            throw err;
        }
    },
    deleteDoc: async (docRef) => {
        const { collectionName, id } = docRef;
        try {
            const res = await fetch(`/api/db/${collectionName}/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            console.log(`[MockDB] deleteDoc deleted ${collectionName}/${id}`);
            return true;
        } catch (err) {
            console.error(`[MockDB] deleteDoc error for ${collectionName}/${id}:`, err);
            return false;
        }
    },
    writeBatch: () => {
        const operations = [];
        return {
            set: (docRef, data, options = {}) => {
                operations.push({ type: 'set', docRef, data, options });
            },
            update: (docRef, data) => {
                operations.push({ type: 'update', docRef, data });
            },
            delete: (docRef) => {
                operations.push({ type: 'delete', docRef });
            },
            commit: async () => {
                for (const op of operations) {
                    if (op.type === 'set') {
                        await mockFirestore.setDoc(op.docRef, op.data, op.options);
                    } else if (op.type === 'update') {
                        await mockFirestore.setDoc(op.docRef, op.data, { merge: true });
                    } else if (op.type === 'delete') {
                        await mockFirestore.deleteDoc(op.docRef);
                    }
                }
                console.log(`[MockDB] Batch committed: ${operations.length} ops`);
                return true;
            }
        };
    }
};

// Mock Auth functions
export const mockAuth = {
    currentUser: null,
    listeners: [],
    login: async () => {
        return new Promise((resolve, reject) => {
            if (!window.google?.accounts?.oauth2) {
                alert('구글 로그인 모듈이 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
                return reject(new Error('GIS not loaded'));
            }
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: '602256994765-ntop38htqblvjced9ogfsrfr8kpvc3dc.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/chat.messages.readonly https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/calendar',
                callback: async (tokenResponse) => {
                    if (tokenResponse.error) {
                        return reject(tokenResponse.error);
                    }
                    try {
                        const token = tokenResponse.access_token;
                        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (!userInfoRes.ok) throw new Error('Failed to fetch user info');
                        const userInfo = await userInfoRes.json();
                        
                        console.log('[MockAuth] Logged in successfully via GIS:', userInfo.email || 'No email');
                        mockAuth.currentUser = {
                            uid: userInfo.sub || 'mock-user-id',
                            email: userInfo.email || 'temp@irrocot.com',
                            displayName: userInfo.name || '알 수 없는 사용자',
                            photoURL: userInfo.picture || '',
                        };
                        mockAuth.listeners.forEach(cb => cb(mockAuth.currentUser));
                        resolve({
                            user: mockAuth.currentUser,
                            credential: { accessToken: token, expiresIn: tokenResponse.expires_in }
                        });
                    } catch (err) {
                        reject(err);
                    }
                }
            });
            client.requestAccessToken({ prompt: '' });
        });
    },
    logout: async () => {
        console.log('[MockAuth] Logged out');
        mockAuth.currentUser = null;
        mockAuth.listeners.forEach(cb => cb(mockAuth.currentUser));
        return true;
    },
    onAuthStateChanged: (...args) => {
        const cb = args.length === 2 ? args[1] : args[0];
        if (typeof cb === 'function') {
            mockAuth.listeners.push(cb);
            cb(mockAuth.currentUser);
            return () => {
                mockAuth.listeners = mockAuth.listeners.filter(l => l !== cb);
            };
        }
        return () => {};
    }
};
