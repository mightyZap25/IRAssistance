import { db, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, orderBy, query } from '../database';

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
 * 모든 사용자 목록을 가져옵니다.
 */
export async function getAllUsers() {
    try {
        const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}

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
            role: USER_ROLES.ADMIN, // Default role set to admin (Master) as requested
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            department: 'Master Admin'
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

export const ROLE_LABELS = {
    [USER_ROLES.ADMIN]: '마스터 관리자 (Admin)',
    [USER_ROLES.MANAGER]: '부서장 / 매니저 (Manager)',
    [USER_ROLES.ENGINEER]: '개발 엔지니어 (Engineer)',
    [USER_ROLES.SALES]: '영업 본부 (Sales)',
    [USER_ROLES.QA]: '품질 보증 (QA)',
    [USER_ROLES.PRODUCTION]: '생산 / 제조 (Production)',
    [USER_ROLES.VIEWER]: '일반 조회원 (Viewer)'
};

/**
 * 사용자의 권한(Role)과 부서(Department) 정보를 업데이트합니다.
 */
export async function updateUserRoleAndDepartment(uid, role, department) {
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
        role,
        department,
        updatedAt: serverTimestamp()
    }, { merge: true });
}
