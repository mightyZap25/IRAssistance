import React, { useState, useEffect } from 'react';
import { useAuth, DEV_ROLES } from '../contexts/AuthContext';
import { db, collection, query, where, orderBy, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, getDoc } from '../database';
import { LogOut, User, Bell, FlaskConical, ChevronDown, Check, StickyNote, X, Maximize2, Minimize2, Move, Printer, HelpCircle } from 'lucide-react';
import RichMemoEditor from './common/RichMemoEditor';

export default function Header({ isHelpOpen, onToggleHelp }) {
    const { currentUser, userProfile, rawUserProfile, devRoleOverride, setDevRoleOverride, logout } = useAuth();
    const [devMenuOpen, setDevMenuOpen] = useState(false);
    const [notiMenuOpen, setNotiMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);

    // Floating Notepad State
    const [memoOpen, setMemoOpen] = useState(false);
    const [memoTitle, setMemoTitle] = useState('새 플로팅 메모');
    const [memoContent, setMemoContent] = useState('');
    const [memoSaving, setMemoSaving] = useState(false);
    const [memoOpacity, setMemoOpacity] = useState(1);
    const [memoPos, setMemoPos] = useState({ x: window.innerWidth - 420, y: 60 });
    const [memoSize, setMemoSize] = useState({ width: 400, height: 500 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 400, h: 500 });

    // Full Screen State
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const handleToggleMemo = () => setMemoOpen(v => !v);
        window.addEventListener('toggle-floating-memo', handleToggleMemo);
        return () => window.removeEventListener('toggle-floating-memo', handleToggleMemo);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    // Load/Subscribe Personal Memo (Firestore for last active session)
    useEffect(() => {
        if (!currentUser?.uid) return;
        
        const memoRef = doc(db, 'personal_memos', currentUser.uid);
        const unsubscribe = onSnapshot(memoRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setMemoContent(data.content || '');
                if (data.title) setMemoTitle(data.title);
            }
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleSaveMemo = async () => {
        if (!currentUser?.uid) return;
        if (!memoTitle.trim()) {
            alert('메모 제목을 입력해 주세요.');
            return;
        }
        
        setMemoSaving(true);
        try {
            // 1. Save to Firestore (Current Active Session Cache)
            const memoRef = doc(db, 'personal_memos', currentUser.uid);
            await setDoc(memoRef, {
                title: memoTitle,
                content: memoContent,
                lastUpdated: serverTimestamp(),
                userId: currentUser.uid,
                userEmail: currentUser.email
            }, { merge: true });

            // 2. Sync to Google Drive (Sidebar Memo Page Integration)
            try {
                const { ensureValidToken, getOrCreateFolder, fetchDrive } = await import('../services/googleService');
                const token = await ensureValidToken();
                if (token) {
                    const folderId = await getOrCreateFolder('IR_Assistant_Memos');
                    const fileName = memoTitle.trim().endsWith('.html') ? memoTitle.trim() : `${memoTitle.trim()}.html`;
                    
                    // Search for existing file with this title
                    const q = `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
                    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
                    const searchData = await fetchDrive(searchUrl);
                    
                    const fileMetadata = { 
                        name: fileName, 
                        mimeType: 'text/html', 
                        parents: searchData.files?.length > 0 ? undefined : [folderId] 
                    };
                    
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
                    form.append('file', new Blob([memoContent], { type: 'text/html' }));
                    
                    const uploadUrl = searchData.files?.length > 0 
                        ? `https://www.googleapis.com/upload/drive/v3/files/${searchData.files[0].id}?uploadType=multipart`
                        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
                    
                    await fetch(uploadUrl, {
                        method: searchData.files?.length > 0 ? 'PATCH' : 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: form
                    });
                }
            } catch (gErr) {
                console.warn("Google Drive Sync Failed:", gErr);
            }

            alert(`'${memoTitle}' 메모가 저장되었습니다. (사이드바 메모장에서 확인 가능)`);
        } catch (error) {
            console.error("메모 저장 실패:", error);
            alert('저장 중 오류가 발생했습니다.');
        }
        setMemoSaving(false);
    };

    // Drag & Resize Logic
    const handleMouseDown = (e) => {
        if (e.target.closest('.drag-handle')) {
            setIsDragging(true);
            setDragOffset({
                x: e.clientX - memoPos.x,
                y: e.clientY - memoPos.y
            });
        } else if (e.target.closest('.resize-handle')) {
            setIsResizing(true);
            setResizeStart({
                x: e.clientX,
                y: e.clientY,
                w: memoSize.width,
                h: memoSize.height
            });
            e.preventDefault();
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                setMemoPos({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            } else if (isResizing) {
                const newWidth = Math.max(300, resizeStart.w + (e.clientX - resizeStart.x));
                const newHeight = Math.max(300, resizeStart.h + (e.clientY - resizeStart.y));
                setMemoSize({ width: newWidth, height: newHeight });
            }
        };
        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, dragOffset, resizeStart]);

    // 실시간 알림 구독 (부서 권한 및 마스터 권한 반영)
    useEffect(() => {
        if (!currentUser?.uid) return;

        // 알림 필터링 로직:
        // 1. master 권한: 모든 알림 표시
        // 2. 일반 부서 권한: targetDepts에 자신의 부서가 포함되었거나, 본인 이메일로 온 알림 표시
        
        const q = query(collection(db, 'notifications'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();
                const createdAt = data.createdAt;
                let dateObj = null;

                if (createdAt?.toDate) {
                    dateObj = createdAt.toDate();
                } else if (createdAt?.seconds) {
                    dateObj = new Date(createdAt.seconds * 1000);
                } else if (createdAt) {
                    dateObj = new Date(createdAt);
                }

                return {
                    id: doc.id,
                    ...data,
                    _date: dateObj,
                    time: dateObj && !isNaN(dateObj) ? dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '방금 전'
                };
            });

            // ─── 부서 및 권한 필터링 (메모리 내 처리로 유연성 확보) ───
            const userDept = rawUserProfile?.department?.toLowerCase() || '';
            const userRole = devRoleOverride || rawUserProfile?.role || '';

            const filteredList = list.filter(noti => {
                // 1. Master 권한은 모든 알림 허용
                if (userRole === 'admin') return true;

                // 2. 본인 이메일로 직접 온 알림
                if (noti.userEmail === currentUser.email) return true;

                // 3. 부서 또는 역할 대상 알림 체크
                if (noti.targetDepts && Array.isArray(noti.targetDepts)) {
                    return noti.targetDepts.some(target => 
                        target.toLowerCase() === userDept || 
                        target.toLowerCase() === userRole
                    );
                }

                return false;
            });

            // 로컬(메모리) 정렬
            const sortedList = filteredList.sort((a, b) => {
                const timeA = a._date?.getTime() || 0;
                const timeB = b._date?.getTime() || 0;
                return timeB - timeA;
            });
            setNotifications(sortedList);
        }, (err) => {
            console.error("알림 구독 실패:", err);
        });

        return () => unsubscribe();
    }, [currentUser, rawUserProfile, devRoleOverride]);

    // 알림 읽음 처리
    const handleReadNotification = async (notiId) => {
        try {
            const docRef = doc(db, 'notifications', notiId);
            await updateDoc(docRef, { read: true });
        } catch (error) {
            console.error("알림 읽음 처리 실패:", error);
        }
    };

    const [printablePR, setPrintablePR] = useState(null);
    const [isPrintLoading, setIsPrintLoading] = useState(false);

    // Subscribe to printable PR selection events from pages
    useEffect(() => {
        const handleSetPR = (e) => setPrintablePR(e.detail);
        window.addEventListener('set-printable-pr', handleSetPR);
        return () => window.removeEventListener('set-printable-pr', handleSetPR);
    }, []);

    const handleGlobalPrint = () => {
        window.dispatchEvent(new CustomEvent('trigger-print-modal'));
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
                    어서오세요, {userProfile?.displayName || currentUser?.displayName || '사용자'}님
                </h2>
                
                {/* Mode Indicator */}
                {localStorage.getItem('use_firebase') !== 'false' ? (
                    <span 
                        onClick={() => {
                            if (window.confirm("로컬(테스트) 모드로 전환하시겠습니까? (페이지가 새로고침됩니다)")) {
                                localStorage.setItem('use_firebase', 'false');
                                window.location.reload();
                            }
                        }}
                        className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200 cursor-pointer"
                        title="클릭하여 LOCAL 모드로 전환"
                    >
                        클라우드 DB
                    </span>
                ) : (
                    <span 
                        onClick={() => {
                            if (window.confirm("클라우드 Firebase DB 모드로 전환하시겠습니까? (페이지가 새로고침됩니다)")) {
                                localStorage.setItem('use_firebase', 'true');
                                window.location.reload();
                            }
                        }}
                        className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black border border-amber-200 animate-pulse cursor-pointer"
                        title="클릭하여 Firebase 모드로 전환"
                    >
                        로컬 DB (테스트)
                    </span>
                )}
            </div>


            {/* Right: Actions & Profile */}
            <div className="flex items-center gap-3">

                {/* ─── 전체화면 토글 버튼 ─── */}
                <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all focus:outline-none"
                    title={isFullscreen ? '전체화면 종료' : '전체화면 모드'}
                >
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>

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

                {/* ─── Global Work Order Print Button ─── */}
                {printablePR && (
                    <button
                        onClick={handleGlobalPrint}
                        className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all animate-fade-in"
                    >
                        <Printer size={14} className="text-blue-400" />
                        <span>작업 지시서 출력</span>
                    </button>
                )}

                {/* Divider */}
                <div className="h-6 w-[1px] bg-slate-200 mx-1"/>

                {/* 사용자 도움말 (매뉴얼) 토글 버튼 */}
                <button
                    onClick={onToggleHelp}
                    className={`p-1.5 hover:bg-slate-100 rounded-full transition-all duration-200 ${isHelpOpen ? 'text-indigo-650 bg-indigo-50/50 shadow-inner' : 'text-slate-400 hover:text-indigo-600'}`}
                    title="사용자 가이드 및 매뉴얼"
                >
                    <HelpCircle size={18} />
                </button>


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


            </div>

            {/* Floating Notepad Modal */}
            {memoOpen && (
                <div 
                    className="fixed z-[1000] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white flex flex-col transition-shadow"
                    style={{ 
                        width: `${memoSize.width}px`, 
                        height: `${memoSize.height}px`, 
                        left: `${memoPos.x}px`, 
                        top: `${memoPos.y}px`,
                        opacity: memoOpacity,
                        boxShadow: (isDragging || isResizing) ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    onMouseDown={handleMouseDown}
                >
                    {/* Header / Drag Handle */}
                    <div className="drag-handle bg-slate-900 text-white px-4 py-2.5 flex justify-between items-center cursor-move select-none shrink-0">
                        <div className="flex items-center gap-3 flex-1 mr-4">
                            <StickyNote size={14} className="text-amber-400 shrink-0" />
                            <input 
                                type="text"
                                value={memoTitle}
                                onChange={(e) => setMemoTitle(e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                placeholder="메모 제목..."
                                className="bg-white/10 hover:bg-white/20 focus:bg-white/20 border-none outline-none rounded px-2 py-1 text-xs font-black text-white placeholder:text-white/30 w-full transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Opacity Slider */}
                            <div className="hidden sm:flex items-center gap-2 bg-white/10 px-2 py-1 rounded-lg" onMouseDown={e => e.stopPropagation()}>
                                <span className="text-[8px] font-bold text-slate-400 uppercase">Alpha</span>
                                <input 
                                    type="range" 
                                    min="0.2" 
                                    max="1" 
                                    step="0.05" 
                                    value={memoOpacity} 
                                    onChange={(e) => setMemoOpacity(parseFloat(e.target.value))}
                                    className="w-12 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-400"
                                />
                            </div>
                            <button 
                                onClick={() => setMemoOpen(false)}
                                className="p-1 hover:bg-white/20 rounded transition-colors shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden">
                        <RichMemoEditor 
                            value={memoContent}
                            onChange={setMemoContent}
                            onSave={handleSaveMemo}
                            saving={memoSaving}
                            placeholder="이곳에 자유롭게 메모를 작성하세요. 저장 시 모든 기기에서 동기화됩니다."
                            showToggle={true}
                        />
                    </div>

                    {/* Footer Tips & Resize Handle */}
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0 relative">
                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                            <Move size={10} /> 상단 드래그 이동 / 하단 리사이즈
                        </span>
                        <div className="flex items-center gap-2 pr-4">
                            <span className="text-[9px] font-black text-indigo-600">자동 동기화 활성</span>
                        </div>
                        
                        {/* Resize Handle */}
                        <div className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5">
                            <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-300 rounded-br-sm" />
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
