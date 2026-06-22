import { mockFirestore, mockAuth } from './mockFirebase';

console.log("[DB] Operating in NAS PostgreSQL storage mode.");

// Force Local/NAS mode
export const useFirebase = false;

// Proxy Auth
export const auth = mockAuth;
export const signInWithPopup = async () => mockAuth.login();
export const signOut = async () => mockAuth.logout();
export const onAuthStateChanged = (authInstance, cb) => mockAuth.onAuthStateChanged(cb);
export class GoogleAuthProvider {
    constructor() {
        this.scopes = [];
    }
    static credentialFromResult(result) { return result?.credential ? { accessToken: result.credential.accessToken, expiresIn: result.credential.expiresIn } : { accessToken: 'mock_access_token' }; }
    addScope(scope) {
        this.scopes.push(scope);
    }
}
export const googleProvider = new GoogleAuthProvider();
// Google Workspace 연동을 위한 필요 스코프 추가 (실제 Firebase 연동 시 사용)
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/chat.messages');
googleProvider.addScope('https://www.googleapis.com/auth/chat.spaces');
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
export const analytics = {};
export const db = mockFirestore;

// Proxy Firestore methods
export const doc = mockFirestore.doc;
export const getDoc = mockFirestore.getDoc;
export const setDoc = mockFirestore.setDoc;
export const addDoc = mockFirestore.addDoc;
export const deleteDoc = mockFirestore.deleteDoc;
export const updateDoc = (docRef, data) => mockFirestore.setDoc(docRef, data, { merge: true }); // Ensure update always merges
export const writeBatch = mockFirestore.writeBatch;
export const collection = mockFirestore.collection;
export const getDocs = mockFirestore.getDocs;
export const orderBy = (field, dir) => ({ type: 'orderBy', field, dir }); // Mock helper
export const query = (q, ...constraints) => ({ ...q, constraints: (q.constraints || []).concat(constraints) }); // Mock helper
export const where = (field, op, val) => ({ type: 'where', field, op, val }); // Mock helper
export const serverTimestamp = () => new Date();
export const onSnapshot = (qOrRef, cb) => {
    const fetchData = () => {
        if (qOrRef && qOrRef.id) {
            getDoc(qOrRef).then(cb).catch(err => console.error("onSnapshot doc mock error:", err));
        } else {
            getDocs(qOrRef).then(cb).catch(err => console.error("onSnapshot collection mock error:", err));
        }
    };
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
};
export const limit = (n) => ({ type: 'limit', n });
export const arrayUnion = (...elements) => elements;
export const runTransaction = async (dbInstance, updateFunction) => {
    const transaction = {
        get: async (ref) => getDoc(ref),
        set: (ref, data, options) => setDoc(ref, data, options),
        update: (ref, data) => updateDoc(ref, data),
        delete: (ref) => deleteDoc(ref)
    };
    return updateFunction(transaction);
};
export const Timestamp = {
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
    fromDate: (date) => ({ toDate: () => date, toMillis: () => date.getTime() })
};

