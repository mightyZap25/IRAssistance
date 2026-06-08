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
                    email: 'admin@irrobot.com',
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
            const data = await res.json();
            
            return {
                docs: data.map(item => ({
                    id: item.id || item.PartID || item.uid || '',
                    data: () => item,
                    exists: () => true
                })),
                size: data.length,
                forEach: (cb) => {
                    data.forEach(item => cb({
                        id: item.id || item.PartID || item.uid || '',
                        data: () => item
                    }));
                }
            };
        } catch (err) {
            console.error(`[MockDB] getDocs error for ${collectionName}:`, err);
            return { docs: [], size: 0, forEach: () => {} };
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
    currentUser: {
        uid: 'mock-admin',
        email: 'admin@irrobot.com',
        displayName: '로컬 마스터',
        photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    },
    login: async () => {
        console.log('[MockAuth] Logged in successfully');
        return {
            user: mockAuth.currentUser
        };
    },
    logout: async () => {
        console.log('[MockAuth] Logged out');
        return true;
    },
    onAuthStateChanged: (...args) => {
        const cb = args.length === 2 ? args[1] : args[0];
        if (typeof cb === 'function') {
            cb(mockAuth.currentUser);
        }
        return () => {};
    }
};
