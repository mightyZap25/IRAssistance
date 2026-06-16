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
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            dateTime: data.dateTime?.toDate ? data.dateTime.toDate() : (data.dateTime ? new Date(data.dateTime) : null)
        };
    });
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
