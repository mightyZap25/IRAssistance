import { db } from '../firebase';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs, 
    query, 
    orderBy,
    serverTimestamp 
} from '../firebase';

const MEETINGS_COLLECTION = 'meetings';
const WEEKLY_MEETINGS_COLLECTION = 'weekly_meetings';

// Meetings CRUD
export const getMeetings = async () => {
    const q = query(collection(db, MEETINGS_COLLECTION), orderBy('dateTime', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        dateTime: doc.data().dateTime?.toDate() || null
    }));
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
    return await updateDoc(meetingRef, {
        ...meetingData,
        updatedAt: serverTimestamp()
    });
};

export const deleteMeeting = async (id) => {
    return await deleteDoc(doc(db, MEETINGS_COLLECTION, id));
};

// Weekly Meetings CRUD
export const getWeeklyMeetings = async () => {
    const q = query(collection(db, WEEKLY_MEETINGS_COLLECTION), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || null
    }));
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
