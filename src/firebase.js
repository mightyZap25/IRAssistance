import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import * as firebaseAuth from 'firebase/auth';
import * as firebaseFirestore from 'firebase/firestore';
import { mockFirestore, mockAuth } from './mockFirebase';

const firebaseConfig = {
    apiKey: "AIzaSyDgbTFSfrqBCL0KqfWURmTDuGZJF8FNIRo",
    authDomain: "irerp-b0977.firebaseapp.com",
    projectId: "irerp-b0977",
    storageBucket: "irerp-b0977.firebasestorage.app",
    messagingSenderId: "602256994765",
    appId: "1:602256994765:web:95f5d748ea50b481081484",
    measurementId: "G-L10Z73Y1T8"
};

// Force local DB testing by default so that read quotas aren't hit.
// The user can type `localStorage.setItem('use_firebase', 'true')` in devtools to switch back.
const useFirebase = localStorage.getItem('use_firebase') === 'true';

let app, analytics, auth, db;
let signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProviderClass;

// Firestore methods proxy
let doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, collection, getDocs, orderBy, query, where, serverTimestamp, onSnapshot, limit, arrayUnion, runTransaction, Timestamp;

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

if (useFirebase) {
    console.log("[Firebase] Operating in CLOUD Firebase mode.");
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    auth = getAuth(app);
    db = getFirestore(app);
    
    signInWithPopup = firebaseAuth.signInWithPopup;
    signOut = firebaseAuth.signOut;
    onAuthStateChanged = firebaseAuth.onAuthStateChanged;
    GoogleAuthProviderClass = firebaseAuth.GoogleAuthProvider;

    doc = firebaseFirestore.doc;
    getDoc = firebaseFirestore.getDoc;
    setDoc = firebaseFirestore.setDoc;
    addDoc = firebaseFirestore.addDoc;
    deleteDoc = firebaseFirestore.deleteDoc;
    updateDoc = firebaseFirestore.updateDoc;
    writeBatch = firebaseFirestore.writeBatch;
    collection = firebaseFirestore.collection;
    getDocs = firebaseFirestore.getDocs;
    orderBy = firebaseFirestore.orderBy;
    query = firebaseFirestore.query;
    where = firebaseFirestore.where;
    serverTimestamp = firebaseFirestore.serverTimestamp;
    onSnapshot = firebaseFirestore.onSnapshot;
    limit = firebaseFirestore.limit;
    arrayUnion = firebaseFirestore.arrayUnion;
    runTransaction = firebaseFirestore.runTransaction;
    Timestamp = firebaseFirestore.Timestamp;
} else {
    console.log("[Firebase] Operating in LOCAL mock storage mode (Synology NAS fallback test).");
    app = {};
    analytics = {};
    auth = mockAuth;
    db = mockFirestore;
    
    signInWithPopup = async () => ({ user: mockAuth.currentUser });
    signOut = async () => true;
    onAuthStateChanged = (authInstance, cb) => {
        cb(mockAuth.currentUser);
        return () => {};
    };
    GoogleAuthProviderClass = class {
        static credentialFromResult() { return { accessToken: 'mock_access_token' }; }
    };

    doc = mockFirestore.doc;
    getDoc = mockFirestore.getDoc;
    setDoc = mockFirestore.setDoc;
    addDoc = mockFirestore.addDoc;
    deleteDoc = mockFirestore.deleteDoc;
    updateDoc = mockFirestore.setDoc; // Set can act as update in local DB
    writeBatch = mockFirestore.writeBatch;
    collection = mockFirestore.collection;
    getDocs = mockFirestore.getDocs;
    orderBy = (field, dir) => field; // Mock orderBy helper
    query = (q, ...constraints) => q; // Mock query helper
    where = (field, op, val) => ({ field, op, val }); // Mock where helper
    serverTimestamp = () => new Date();
    onSnapshot = (qOrRef, cb) => {
        // Handle docRef vs collectionRef/query
        if (qOrRef && qOrRef.id) {
            getDoc(qOrRef).then(cb).catch(err => console.error("onSnapshot doc mock error:", err));
        } else {
            getDocs(qOrRef).then(cb).catch(err => console.error("onSnapshot collection mock error:", err));
        }
        return () => {};
    };
    limit = (n) => ({ limit: n });
    arrayUnion = (...elements) => elements;
    runTransaction = async (db, updateFunction) => {
        const transaction = {
            get: async (ref) => getDoc(ref),
            set: (ref, data, options) => setDoc(ref, data, options),
            update: (ref, data) => updateDoc(ref, data),
            delete: (ref) => deleteDoc(ref)
        };
        return updateFunction(transaction);
    };
    Timestamp = {
        now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
        fromDate: (date) => ({ toDate: () => date, toMillis: () => date.getTime() })
    };
}

export { 
    auth, 
    db, 
    googleProvider, 
    analytics, 
    useFirebase,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    GoogleAuthProviderClass as GoogleAuthProvider,
    doc,
    getDoc,
    setDoc,
    addDoc,
    deleteDoc,
    updateDoc,
    writeBatch,
    collection,
    getDocs,
    orderBy,
    query,
    where,
    serverTimestamp,
    onSnapshot,
    limit,
    arrayUnion,
    runTransaction,
    Timestamp
};
