import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export const USER_ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    ENGINEER: 'engineer',
    SALES: 'sales',
    QA: 'qa',
    PRODUCTION: 'production',
    VIEWER: 'viewer'
};

/**
 * Creates or updates a user profile in Firestore on login.
 * Sets default role to 'viewer' if new.
 */
export async function syncUserProfile(user) {
    if (!user) return null;

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        // Update last login
        await setDoc(userRef, {
            lastLogin: serverTimestamp(),
            email: user.email, // Keep email in sync
            photoURL: user.photoURL,
            displayName: user.displayName
        }, { merge: true });
        return { ...userData, id: user.uid }; // Ensure ID is present
    } else {
        // New User
        const newUser = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: USER_ROLES.VIEWER, // Default role changed from user to viewer
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            department: 'Pending Assignment'
        };
        await setDoc(userRef, newUser);
        return newUser;
    }
}

/**
 * Check if user has required permissions based on role hierarchy
 */
export function hasPermission(userRole, requiredRole) {
    const roleHierarchy = {
        [USER_ROLES.VIEWER]: 0,
        'user': 1,
        [USER_ROLES.SALES]: 1,
        [USER_ROLES.QA]: 1,
        [USER_ROLES.PRODUCTION]: 1,
        [USER_ROLES.ENGINEER]: 1,
        [USER_ROLES.MANAGER]: 2,
        [USER_ROLES.ADMIN]: 3
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
}

/**
 * Fetch user dashboard layout configuration
 */
export async function getUserDashboardLayout(uid) {
    if (!uid) return null;
    const ref = doc(db, 'user_settings', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        return snap.data().dashboardLayout || null;
    }
    return null;
}

/**
 * Save user dashboard layout configuration
 */
export async function saveUserDashboardLayout(uid, layout) {
    if (!uid) return;
    const ref = doc(db, 'user_settings', uid);
    await setDoc(ref, {
        dashboardLayout: layout,
        updatedAt: serverTimestamp()
    }, { merge: true });
}
