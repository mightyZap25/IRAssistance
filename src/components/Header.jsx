import React, { useState, useEffect } from 'react';
import { useAuth, DEV_ROLES } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { LogOut, User, Bell, FlaskConical, ChevronDown, Check } from 'lucide-react';

export default function Header() {
    const { currentUser, userProfile, rawUserProfile, devRoleOverride, setDevRoleOverride, logout } = useAuth();
    const [devMenuOpen, setDevMenuOpen] = useState(false);
    const [notiMenuOpen, setNotiMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);

    // 실시간 알림 구독 (인덱스 에러 회피를 위해 orderBy 삭제 후 메모리 정렬)
    useEffect(() => {
        if (!currentUser?.email) return;
        const q = query(
            collection(db, 'notifications'),
            where('userEmail', '==', currentUser.email)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                time: doc.data().createdAt?.toDate()?.toLocaleTimeString() || '방금 전'
            }));
            // 로컬(메모리) 정렬
            const sortedList = list.sort((a, b) => {
                const timeA = a.createdAt?.toDate()?.getTime() || 0;
                const timeB = b.createdAt?.toDate()?.getTime() || 0;
                return timeB - timeA;
            });
            setNotifications(sortedList);
        }, (err) => {
            console.error("알림 구독 실패:", err);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // 알림 읽음 처리
    const handleReadNotification = async (notiId) => {
        try {
            const docRef = doc(db, 'notifications', notiId);
            await updateDoc(docRef, { read: true });
        } catch (error) {
            console.error("알림 읽음 처리 실패:", error);
        }
    };

    const currentDevRole = DEV_ROLES.find(r => r.key === devRoleOverride);
    const activeRole = devRoleOverride
        ? DEV_ROLES.find(r => r.key === devRoleOverride)
        : DEV_ROLES.find(r => r.key === rawUserProfile?.role);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-5 sticky top-0 z-40 transition-colors duration-300 no-print">

            {/* Left: Welcome */}
            <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-slate-700">
                    Welcome back, {userProfile?.displayName || currentUser?.displayName || 'User'}
                </h2>
            </div>

            {/* Right: Actions & Profile */}
            <div className="flex items-center gap-3">

                {/* ─── 임시 역할 전환 콤보박스 (개발용) ─── */}
                <div className="relative">
                    <button
                        onClick={() => setDevMenuOpen(v => !v)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black border-2 border-dashed transition-all ${devRoleOverride ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400'}`}
                    >
                        <FlaskConical size={13} className={devRoleOverride ? 'text-amber-500' : 'text-slate-400'}/>
                        <span>{currentDevRole ? currentDevRole.label : '역할 선택 (테스트)'}</span>
                        <ChevronDown size={12} className={devMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'}/>
                    </button>

                    {devMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-[9998]" onClick={() => setDevMenuOpen(false)}/>
                            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] overflow-hidden">
                                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                                    <p className="text-[10px] font-black text-amber-700 flex items-center gap-1">
                                        <FlaskConical size={11}/> 임시 권한 테스트 모드
                                    </p>
                                    <p className="text-[9px] text-amber-500 font-medium mt-0.5">실제 계정 역할을 변경하지 않습니다</p>
                                </div>
                                <div className="p-1.5 space-y-0.5">
                                    {/* 원래 역할로 되돌리기 */}
                                    <button
                                        onClick={() => { setDevRoleOverride(null); setDevMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${!devRoleOverride ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-slate-400"/>
                                        원래 역할 ({rawUserProfile?.role || 'viewer'})
                                        {!devRoleOverride && <span className="ml-auto text-[9px] bg-slate-200 px-1.5 py-0.5 rounded-full font-black">현재</span>}
                                    </button>
                                    <div className="h-px bg-slate-100 my-1"/>
                                    {DEV_ROLES.map(r => (
                                        <button
                                            key={r.key}
                                            onClick={() => { setDevRoleOverride(r.key); setDevMenuOpen(false); }}
                                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${devRoleOverride === r.key ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${r.color}`}/>
                                            {r.label}
                                            {devRoleOverride === r.key && <span className="ml-auto text-[9px] bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full font-black">적용중</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Divider */}
                <div className="h-6 w-[1px] bg-slate-200 mx-1"/>

                {/* Notifications */}
                <div className="relative">
                    <button 
                        onClick={() => setNotiMenuOpen(v => !v)}
                        className={`p-1.5 hover:bg-slate-100 rounded-full transition-colors relative ${notiMenuOpen ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600'}`}
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 bg-rose-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {notiMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-[9998]" onClick={() => setNotiMenuOpen(false)}/>
                            <div className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] overflow-hidden">
                                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                    <span className="text-xs font-black text-slate-700">알림 센터 ({unreadCount})</span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-slate-400 font-semibold">
                                            수신된 알림이 없습니다.
                                        </div>
                                    ) : (
                                        notifications.map(n => (
                                            <div 
                                                key={n.id}
                                                onClick={() => handleReadNotification(n.id)}
                                                className={`p-3 text-left transition-colors cursor-pointer ${!n.read ? 'bg-indigo-50/30 hover:bg-indigo-50/50' : 'hover:bg-slate-50'}`}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className={`text-[11px] font-bold ${!n.read ? 'text-slate-800' : 'text-slate-500'}`}>
                                                        {n.title}
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 font-medium shrink-0">{n.time}</span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{n.message}</p>
                                                {!n.read && (
                                                    <div className="flex justify-end mt-1.5">
                                                        <span className="text-[8px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                            <Check size={8} /> 읽음 표시
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="h-6 w-[1px] bg-slate-200 mx-1"/>

                {/* Profile */}
                <div className="flex items-center gap-2">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-700 leading-tight">
                            {userProfile?.displayName || currentUser?.displayName}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                            {devRoleOverride && (
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded text-white ${activeRole?.color || 'bg-slate-400'}`}>
                                    TEST
                                </span>
                            )}
                            <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-bold">
                                {devRoleOverride || rawUserProfile?.role || 'Guest'}
                            </span>
                        </div>
                    </div>

                    <div className="relative group cursor-pointer">
                        <div className={`w-8 h-8 rounded-full overflow-hidden border-2 shadow-sm transition-colors ${devRoleOverride ? 'border-amber-400' : 'border-slate-100 group-hover:border-indigo-200'}`}>
                            {currentUser?.photoURL ? (
                                <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                                    <User size={20} />
                                </div>
                            )}
                        </div>

                        {/* Dropdown */}
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
                            <div className="p-2">
                                <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors font-bold">
                                    <LogOut size={16} />
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
