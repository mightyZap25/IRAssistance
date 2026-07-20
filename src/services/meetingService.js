import { db } from '../database';
import { getDriveMeetings } from './googleService';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    setDoc,
    deleteDoc, 
    doc, 
    getDocs, 
    query, 
    orderBy,
    serverTimestamp 
} from '../database';

const MEETINGS_COLLECTION = 'meetings';
const WEEKLY_MEETINGS_COLLECTION = 'weekly_meetings';

// Meetings CRUD
export const getMeetings = async () => {
    // 1. Fetch from Firebase
    const q = query(collection(db, MEETINGS_COLLECTION), orderBy('dateTime', 'desc'));
    const snapshot = await getDocs(q);
    const fbMeetings = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            dateTime: data.dateTime?.toDate ? data.dateTime.toDate() : (data.dateTime ? new Date(data.dateTime) : null)
        };
    });

    // 2. Fetch from Google Drive
    let driveFiles = [];
    try {
        driveFiles = await getDriveMeetings();
    } catch (e) {
        console.warn('[getMeetings] Failed to fetch from Google Drive. Showing only Firebase records.', e);
        return fbMeetings;
    }

    // 3. Merge! Drive is the source of truth for documents in the folder.
    const merged = driveFiles.map(file => {
        const fbMatch = fbMeetings.find(m => m.googleDocId === file.id);
        if (fbMatch) {
            return {
                ...fbMatch,
                target: file.name, // Drive name overrides
                dateTime: new Date(file.createdTime),
                googleDocUrl: file.webViewLink,
                googleDocId: file.id
            };
        } else {
            return {
                id: file.id, // Temp ID (not in Firebase yet)
                target: file.name,
                dateTime: new Date(file.createdTime),
                googleDocUrl: file.webViewLink,
                googleDocId: file.id,
                presenter: '',
                attendees: '',
                materials: []
            };
        }
    });

    // Also include any FB meetings that don't have a google doc yet (drafts, errors, etc.)
    const fbWithoutDoc = fbMeetings.filter(m => !m.googleDocId);
    
    const finalMeetings = [...merged, ...fbWithoutDoc];
    finalMeetings.sort((a, b) => b.dateTime - a.dateTime);
    return finalMeetings;
};

export const addMeeting = async (meetingData) => {
    return await addDoc(collection(db, MEETINGS_COLLECTION), {
        ...meetingData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateMeeting = async (id, meetingData) => {
    const meetingRef = doc(db, MEETINGS_COLLECTION, id);
    return await setDoc(meetingRef, {
        ...meetingData,
        updatedAt: serverTimestamp()
    }, { merge: true });
};

export const deleteMeeting = async (id) => {
    return await deleteDoc(doc(db, MEETINGS_COLLECTION, id));
};

// Weekly Meetings CRUD
export const getWeeklyMeetings = async () => {
    const q = query(collection(db, WEEKLY_MEETINGS_COLLECTION), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            date: data.date?.toDate ? data.date.toDate() : (data.date ? new Date(data.date) : null)
        };
    });
};

export const addWeeklyMeeting = async (weeklyData) => {
    return await addDoc(collection(db, WEEKLY_MEETINGS_COLLECTION), {
        ...weeklyData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateWeeklyMeeting = async (id, weeklyData) => {
    const weeklyRef = doc(db, WEEKLY_MEETINGS_COLLECTION, id);
    return await updateDoc(weeklyRef, {
        ...weeklyData,
        updatedAt: serverTimestamp()
    });
};

export const deleteWeeklyMeeting = async (id) => {
    return await deleteDoc(doc(db, WEEKLY_MEETINGS_COLLECTION, id));
};
