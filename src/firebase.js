import { mockFirestore, mockAuth } from './mockFirebase';

console.log("[DB] Operating in NAS PostgreSQL storage mode.");

// Force Local/NAS mode
export const useFirebase = false;

// Proxy Auth
export const auth = mockAuth;
export const signInWithPopup = async () => ({ user: mockAuth.currentUser });
export const signOut = async () => true;
export const onAuthStateChanged = (authInstance, cb) => {
    cb(mockAuth.currentUser);
    return () => {};
};
export class GoogleAuthProvider {
    static credentialFromResult() { return { accessToken: 'mock_access_token' }; }
    addScope() {}
}
export const googleProvider = new GoogleAuthProvider();
export const analytics = {};
export const db = mockFirestore;

// Proxy Firestore methods
export const doc = mockFirestore.doc;
export const getDoc = mockFirestore.getDoc;
export const setDoc = mockFirestore.setDoc;
export const addDoc = mockFirestore.addDoc;
export const deleteDoc = mockFirestore.deleteDoc;
export const updateDoc = mockFirestore.setDoc; // Set acts as update in local DB
export const writeBatch = mockFirestore.writeBatch;
export const collection = mockFirestore.collection;
export const getDocs = mockFirestore.getDocs;
export const orderBy = (field, dir) => field; // Mock helper
export const query = (q, ...constraints) => q; // Mock helper
export const where = (field, op, val) => ({ field, op, val }); // Mock helper
export const serverTimestamp = () => new Date();
export const onSnapshot = (qOrRef, cb) => {
    if (qOrRef && qOrRef.id) {
        getDoc(qOrRef).then(cb).catch(err => console.error("onSnapshot doc mock error:", err));
    } else {
        getDocs(qOrRef).then(cb).catch(err => console.error("onSnapshot collection mock error:", err));
    }
    return () => {};
};
export const limit = (n) => ({ limit: n });
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

