import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, USER_ROLES } from '../../services/userService';

/**
 * RoleGuard Component
 * 
 * 특정 권한이 있는 사용자에게만 하위 컴포넌트를 보여줍니다.
 * 
 * @param {string} requiredRole - 필요한 최소 권한 (userService.USER_ROLES 사용)
 * @param {string[]} allowedRoles - 허용할 역할 목록 (배열로 여러 역할 허용 시 사용)
 * @param {React.ReactNode} children - 권한이 있을 때 보여줄 요소
 * @param {React.ReactNode} fallback - 권한이 없을 때 보여줄 요소 (기본값 null)
 */
export default function RoleGuard({ requiredRole, allowedRoles, children, fallback = null }) {
    const { userProfile } = useAuth();
    
    if (!userProfile || !userProfile.role) {
        return fallback;
    }

    let hasAccess = false;

    // allowedRoles 배열이 있으면 해당 역할 목록으로 체크
    if (allowedRoles && Array.isArray(allowedRoles)) {
        hasAccess = allowedRoles.includes(userProfile.role) || allowedRoles.includes(USER_ROLES.ADMIN) && userProfile.role === 'admin';
        // admin은 항상 허용
        if (userProfile.role === 'admin') hasAccess = true;
    } else if (requiredRole) {
        hasAccess = hasPermission(userProfile.role, requiredRole);
    } else {
        hasAccess = true;
    }

    if (!hasAccess) {
        return fallback;
    }

    return <>{children}</>;
}
