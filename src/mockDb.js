/**
 * mockDb.js
 * 사내망 로컬 NAS PostgreSQL REST API를 사용하는 어댑터 모듈입니다.
 * database.js에서 import하여 DB API를 에뮬레이션합니다.
 */

const API_BASE = 'http://localhost:5050/api';

// ==========================================
// Mock Auth
// ==========================================
let currentUser = null;
try {
    const stored = localStorage.getItem('google_user_info');
    if (stored) {
        currentUser = JSON.parse(stored);
    }
} catch (e) {}

let authListeners = [];

export const mockAuth = {
    currentUser,
    login: async () => {
        // 실제 로그인은 AuthContext에서 처리 (Google OAuth)
        return { user: currentUser };
    },
    logout: async () => {
        currentUser = null;
        mockAuth.currentUser = null;
        localStorage.removeItem('google_user_info');
        authListeners.forEach(cb => cb(null));
    },
    onAuthStateChanged: (cb) => {
        authListeners.push(cb);
        // 현재 상태 즉시 전달
        cb(mockAuth.currentUser);
        return () => {
            authListeners = authListeners.filter(l => l !== cb);
        };
    },
    setCurrentUser: (user) => {
        currentUser = user;
        mockAuth.currentUser = user;
        authListeners.forEach(cb => cb(user));
    }
};

// ==========================================
// Helper: REST API 호출
// ==========================================
async function apiFetch(url, options = {}) {
    const response = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
    }
    return response.json();
}

// ==========================================
// Mock DocumentReference
// ==========================================
class MockDocRef {
    constructor(collectionPath, id) {
        this.collectionPath = collectionPath;
        this.id = id;
        this.path = `${collectionPath}/${id}`;
    }
}

// ==========================================
// Mock CollectionReference
// ==========================================
class MockCollectionRef {
    constructor(path, constraints = []) {
        this.path = path;
        this.constraints = constraints;
    }
}

// ==========================================
// Mock DocumentSnapshot
// ==========================================
class MockDocSnapshot {
    constructor(data, id, path) {
        this._data = data;
        this.id = id;
        this.ref = { id, path };
        this.exists = () => data !== null && data !== undefined;
    }
    data() {
        return this._data;
    }
}

// ==========================================
// Mock QuerySnapshot
// ==========================================
class MockQuerySnapshot {
    constructor(docs) {
        this.docs = docs;
        this.empty = docs.length === 0;
        this.size = docs.length;
        this.forEach = (cb) => docs.forEach(cb);
    }
}

// ==========================================
// Mock Firestore
// ==========================================
export const mockFirestore = {
    doc: (collectionPath, id) => {
        if (typeof collectionPath === 'object' && collectionPath.path) {
            // 이미 ref 객체인 경우
            return collectionPath;
        }
        // 경로 세그먼트가 홀수개면 doc ref, 짝수개면 collection ref
        const parts = collectionPath.split('/');
        if (!id && parts.length % 2 === 0) {
            // 마지막 세그먼트가 doc id
            const docId = parts.pop();
            return new MockDocRef(parts.join('/'), docId);
        }
        return new MockDocRef(collectionPath, id || `auto_${Date.now()}`);
    },

    collection: (path) => new MockCollectionRef(path),

    getDoc: async (docRef) => {
        try {
            const result = await apiFetch(`/collections/${encodeURIComponent(docRef.collectionPath)}/docs/${encodeURIComponent(docRef.id)}`);
            return new MockDocSnapshot(result.data, docRef.id, docRef.path);
        } catch (err) {
            console.warn(`[mockFirestore] getDoc failed for ${docRef.path}:`, err.message);
            return new MockDocSnapshot(null, docRef.id, docRef.path);
        }
    },

    getDocs: async (collectionRefOrQuery) => {
        try {
            const path = collectionRefOrQuery.path;
            const constraints = collectionRefOrQuery.constraints || [];
            const params = new URLSearchParams();
            constraints.forEach(c => {
                if (c.type === 'where') params.append('where', JSON.stringify(c));
                if (c.type === 'orderBy') params.append('orderBy', JSON.stringify(c));
                if (c.type === 'limit') params.append('limit', c.n);
            });
            const queryStr = params.toString() ? `?${params}` : '';
            const result = await apiFetch(`/collections/${encodeURIComponent(path)}/docs${queryStr}`);
            const docs = (result.docs || []).map(d => new MockDocSnapshot(d.data, d.id, `${path}/${d.id}`));
            return new MockQuerySnapshot(docs);
        } catch (err) {
            console.warn(`[mockFirestore] getDocs failed for ${collectionRefOrQuery.path}:`, err.message);
            return new MockQuerySnapshot([]);
        }
    },

    setDoc: async (docRef, data, options = {}) => {
        try {
            await apiFetch(`/collections/${encodeURIComponent(docRef.collectionPath)}/docs/${encodeURIComponent(docRef.id)}`, {
                method: options.merge ? 'PATCH' : 'PUT',
                body: data
            });
        } catch (err) {
            console.error(`[mockFirestore] setDoc failed for ${docRef.path}:`, err.message);
            throw err;
        }
    },

    addDoc: async (collectionRef, data) => {
        try {
            const result = await apiFetch(`/collections/${encodeURIComponent(collectionRef.path)}/docs`, {
                method: 'POST',
                body: data
            });
            return new MockDocRef(collectionRef.path, result.id);
        } catch (err) {
            console.error(`[mockFirestore] addDoc failed for ${collectionRef.path}:`, err.message);
            throw err;
        }
    },

    deleteDoc: async (docRef) => {
        try {
            await apiFetch(`/collections/${encodeURIComponent(docRef.collectionPath)}/docs/${encodeURIComponent(docRef.id)}`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.error(`[mockFirestore] deleteDoc failed for ${docRef.path}:`, err.message);
            throw err;
        }
    },

    writeBatch: () => {
        const operations = [];
        return {
            set: (docRef, data, options = {}) => {
                operations.push({ type: options.merge ? 'patch' : 'set', docRef, data });
                return this;
            },
            update: (docRef, data) => {
                operations.push({ type: 'patch', docRef, data });
                return this;
            },
            delete: (docRef) => {
                operations.push({ type: 'delete', docRef });
                return this;
            },
            commit: async () => {
                for (const op of operations) {
                    if (op.type === 'delete') {
                        await mockFirestore.deleteDoc(op.docRef);
                    } else {
                        await mockFirestore.setDoc(op.docRef, op.data, { merge: op.type === 'patch' });
                    }
                }
            }
        };
    }
};
