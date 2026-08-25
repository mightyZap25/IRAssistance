import React, { useState, useEffect, useRef } from 'react';
import { useAuth, DEV_ROLES } from '../contexts/AuthContext';
import { db, collection, query, where, orderBy, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, getDoc } from '../database';
import { LogOut, User, Bell, FlaskConical, ChevronDown, Check, StickyNote, X, Maximize2, Minimize2, Move, Printer, HelpCircle, BotMessageSquare, Sparkles } from 'lucide-react';
import RichMemoEditor from './common/RichMemoEditor';

export default function Header({ isHelpOpen, onToggleHelp, onToggleAiChat, isGeminiPanelOpen }) {
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

    // 실시간 알림 구독 (부서 권한 및 마스터 권한 반영 + 윈도우 데스크톱 알림 연동)
    const isInitialLoadRef = useRef(true);

    useEffect(() => {
        if (!currentUser?.uid) return;
        isInitialLoadRef.current = true;

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

            // ─── 부서 및 권한 필터링 ───
            const userDept = rawUserProfile?.department?.toLowerCase() || '';
            const userRole = devRoleOverride || rawUserProfile?.role || '';
            const userEmail = (currentUser.email || '').toLowerCase();
            const userUid = currentUser.uid;

            const isTargetNotification = (noti) => {
                const notiEmail = (noti.userEmail || noti.targetEmail || '').toLowerCase();
                const notiUid = noti.targetUid || noti.targetIdentifier || '';

                // 1. 본인 이메일이나 UID로 직접 온 알림
                if (notiEmail && userEmail && notiEmail === userEmail) return true;
                if (notiUid && notiUid === userUid) return true;

                // 2. Master 권한은 부서 알림도 수신
                if (userRole === 'admin') return true;

                // 3. 부서 또는 역할 대상 알림 체크
                if (noti.targetDepts && Array.isArray(noti.targetDepts)) {
                    return noti.targetDepts.some(target => 
                        target.toLowerCase() === userDept || 
                        target.toLowerCase() === userRole
                    );
                }
                return false;
            };

            const filteredList = list.filter(isTargetNotification);

            // 신규 추가된 알림 데스크톱 윈도우 알림 팝업 발송 (최초 로딩 이후 새로 올라온 알림에 한함)
            if (!isInitialLoadRef.current) {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const notiData = change.doc.data();
                        if (isTargetNotification(notiData) && !notiData.read) {
                            const title = notiData.title || 'mightyONE 알림';
                            const body = notiData.message || notiData.body || '새로운 알림이 도착했습니다.';
                            
                            // Electron 네이티브 알림 호출
                            if (window.electronAPI?.showNotification) {
                                window.electronAPI.showNotification(title, body);
                            } else if (("Notification" in window) && Notification.permission === "granted") {
                                try {
                                    new Notification(title, { body, icon: '/favicon.ico' });
                                } catch(e) {}
                            }
                        }
                    }
                });
            } else {
                isInitialLoadRef.current = false;
            }

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
        <header className="h-10 bg-white border-b border-slate-200/80 flex items-center justify-end px-4 sticky top-0 z-40 no-print">
            {/* Right: AI Chat Button Only */}
            <div className="flex items-center gap-2">
                {/* ─── AI 챗봇 (Gemini) 헬프봇 토글 버튼 ─── */}
                <button
                    onClick={onToggleAiChat}
                    className={`flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-black transition-all shadow-sm ${
                        isGeminiPanelOpen
                            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white ring-2 ring-blue-300 shadow-blue-200'
                            : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-indigo-700 border border-indigo-100 dark:bg-slate-800 dark:text-indigo-400 dark:border-slate-700'
                    }`}
                    title="AI 챗봇 헬프봇 열기"
                >
                    <BotMessageSquare size={15} className={isGeminiPanelOpen ? 'animate-pulse text-white' : 'text-indigo-600'} />
                    <span className="tracking-tight">AI 챗</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"/>
                </button>
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
