import partsBackup from './parts_backup.json';
import bomBackup from './bom_backup.json';

// Initialize mock DB in LocalStorage if not exists
function initMockDB() {
    if (!localStorage.getItem('mock_db_initialized_v4')) {
        console.log('[MockDB] Initializing LocalStorage with backups...');
        localStorage.setItem('parts', JSON.stringify(partsBackup));
        localStorage.setItem('bom', JSON.stringify(bomBackup));
        
        // Mock default users
        const mockUsers = [
            {
                uid: 'mock-admin',
                email: 'admin@irrobot.com',
                displayName: '로컬 마스터',
                role: 'admin',
                department: 'Management'
            }
        ];
        localStorage.setItem('users', JSON.stringify(mockUsers));
        localStorage.setItem('mock_db_initialized_v4', 'true');
    }
}

initMockDB();

// Mock Firestore functions
export const mockFirestore = {
    // collection helper
    collection: (db, name) => {
        return { collectionName: name };
    },
    doc: (...args) => {
        if (args.length === 3) {
            // doc(db, collectionName, id)
            return { collectionName: args[1], id: args[2] };
        } else if (args.length === 2) {
            // doc(collectionRef, id)
            return { collectionName: args[0].collectionName || args[0], id: args[1] };
        }
        if (args.length === 1 && args[0].collectionName) {
            // doc(collectionRef) - auto generate ID
            return { collectionName: args[0].collectionName, id: 'auto_' + Math.random().toString(36).substr(2, 9) };
        }
        return { collectionName: 'unknown', id: 'unknown' };
    },
    // getDocs mock
    getDocs: async (q) => {
        const collectionName = q.collectionName || q;
        const raw = localStorage.getItem(collectionName) || '[]';
        const data = JSON.parse(raw);
        
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
    },
    // getDoc mock
    getDoc: async (docRef) => {
        const { collectionName, id } = docRef;
        const raw = localStorage.getItem(collectionName) || '[]';
        const data = JSON.parse(raw);
        const item = data.find(x => (x.id || x.PartID || x.uid) === id);
        return {
            exists: () => !!item,
            data: () => item || null,
            id
        };
    },
    // setDoc mock
    setDoc: async (docRef, docData, options = {}) => {
        const { collectionName, id } = docRef;
        const raw = localStorage.getItem(collectionName) || '[]';
        let data = JSON.parse(raw);
        
        const existingIdx = data.findIndex(x => (x.id || x.PartID || x.uid) === id);
        let updatedData = { ...docData, id };
        
        if (existingIdx !== -1) {
            if (options.merge) {
                updatedData = { ...data[existingIdx], ...docData, id };
            }
            data[existingIdx] = updatedData;
        } else {
            data.push(updatedData);
        }
        
        localStorage.setItem(collectionName, JSON.stringify(data));
        console.log(`[MockDB] Saved doc in ${collectionName}: ${id}`, updatedData);
        return true;
    },
    // addDoc mock
    addDoc: async (collRef, docData) => {
        const collectionName = collRef.collectionName;
        const raw = localStorage.getItem(collectionName) || '[]';
        const data = JSON.parse(raw);
        
        const id = Math.random().toString(36).substring(2, 11);
        const newItem = { ...docData, id };
        data.push(newItem);
        
        localStorage.setItem(collectionName, JSON.stringify(data));
        console.log(`[MockDB] Added doc to ${collectionName}: ${id}`, newItem);
        return { id, ...newItem };
    },
    // deleteDoc mock
    deleteDoc: async (docRef) => {
        const { collectionName, id } = docRef;
        const raw = localStorage.getItem(collectionName) || '[]';
        let data = JSON.parse(raw);
        data = data.filter(x => (x.id || x.PartID || x.uid) !== id);
        localStorage.setItem(collectionName, JSON.stringify(data));
        console.log(`[MockDB] Deleted doc in ${collectionName}: ${id}`);
        return true;
    },
    // writeBatch mock
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
