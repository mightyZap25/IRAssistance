import React, { useState, useEffect } from 'react';
import { 
    CalendarDays, Clock, XCircle, ShieldCheck, 
    ChevronLeft, ChevronRight, Briefcase,
    Coffee, CheckCircle2, LogIn, LogOut, Timer,
    UserPlus, Trash2, Settings, AlertCircle,
    TrendingUp, Activity, Edit3, Bell
} from 'lucide-react';
import { db } from '../firebase';
import { 
    collection, query, where, onSnapshot, addDoc, 
    serverTimestamp, doc, getDoc, updateDoc, setDoc, getDocs, arrayUnion
} from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';
import { syncTaskToGoogleCalendar, deleteTaskFromGoogleCalendar } from '../services/calendarService';

// 공휴일 데이터
const KOREAN_HOLIDAYS = {
    '01-01': '신정', '02-09': '설날 연휴', '02-10': '설날', '02-11': '설날 연휴', '02-12': '대체공휴일',
    '03-01': '삼일절', '05-05': '어린이날', '05-06': '대체공휴일', '06-06': '현충일', 
    '08-15': '광복절', '09-16': '추석 연휴', '09-17': '추석', '09-18': '추석 연휴',
    '10-03': '개천절', '10-09': '한글날', '12-25': '크리스마스'
};

// 알림 헬퍼
async function createNotification(targetUid, title, message) {
    try {
        const userSnap = await getDoc(doc(db, 'users', targetUid));
        if (!userSnap.exists()) return;
        await addDoc(collection(db, 'notifications'), { userEmail: userSnap.data().email, title, message, read: false, createdAt: serverTimestamp() });
    } catch (err) {}
}

export default function LeaveManagementPage() {
    const { currentUser, userProfile } = useAuth();
    const isHR = userProfile?.role === 'admin' || userProfile?.role === 'manager';

    const [viewDate, setViewDate] = useState(new Date());
    const [allEvents, setAllEvents] = useState([]);
    
    // 결재 상태
    const [myRequests, setMyRequests] = useState([]);
    const [myPendingApprovals, setMyPendingApprovals] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    
    // 근태 상태
    const [attendanceLog, setAttendanceLog] = useState(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    
    // UI 상태
    const [activeModal, setActiveModal] = useState(null);
    const [approvalTab, setApprovalTab] = useState('todo');
    const [detailItem, setDetailItem] = useState(null);

    // 잔여 휴가 상태
    const [balance] = useState({ total: 15, used: 3.5, remaining: 11.5, remainingHours: 92 });
    
    // 근로 시간 통계
    const [workStats] = useState({ weekly: 34, limit: 40, accumulated: 120, remaining: 6, overtime: 2 });

    // 신청 폼 상태
    const [formData, setFormData] = useState({
        category: 'Leave',
        type: 'Annual',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        startTime: '09:00', endTime: '18:00', reason: ''
    });
    const [manualSteps, setManualSteps] = useState([{ id: Date.now(), label: '팀장 승인', approverUid: '' }]);

    // 근무시간 조정 빌더 state (Standard)
    const ALL_DAYS = [
        { key: 'mon', label: '월' }, { key: 'tue', label: '화' }, { key: 'wed', label: '수' },
        { key: 'thu', label: '목' }, { key: 'fri', label: '금' },
    ];
    const [scheduleEntries, setScheduleEntries] = useState([]); // [{days:['mon','tue',...], start:'09:00', end:'18:00', breakMin:60}]
    const [tempDays, setTempDays] = useState([]);              // 체크된 요일
    const [tempTime, setTempTime] = useState({ start: '09:00', end: '18:00', breakMin: 60 });

    // 열린 요일 = 전체 요일 - 이미 entries에 등록된 요일
    const usedDays = scheduleEntries.flatMap(e => e.days);
    const availableDays = ALL_DAYS.filter(d => !usedDays.includes(d.key));

    const addScheduleEntry = () => {
        if (tempDays.length === 0) return alert('요일을 선택하세요.');
        if (!tempTime.start || !tempTime.end) return alert('시간을 입력하세요.');
        setScheduleEntries(prev => [...prev, { days: [...tempDays], ...tempTime }]);
        setTempDays([]);
        setTempTime({ start: '09:00', end: '18:00', breakMin: 60 });
    };

    const timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const getEntryWorkHours = (entry) => Math.max(0, (timeToMin(entry.end) - timeToMin(entry.start) - entry.breakMin) / 60);

    // 요일번호(0=일..6=토) → entries 기반 실근무시간(h)
    const getDayWorkHours = (dayOfWeek) => {
        if (dayOfWeek === 0 || dayOfWeek === 6) return 0;
        const key = ['', 'mon', 'tue', 'wed', 'thu', 'fri'][dayOfWeek];
        const entry = scheduleEntries.find(e => e.days.includes(key));
        if (!entry) return 8; // 기본값
        return getEntryWorkHours(entry);
    };
    const weeklyTotal = [1,2,3,4,5].reduce((sum, d) => sum + getDayWorkHours(d), 0);

    useEffect(() => {
        if (!currentUser) return;
        
        getDocs(collection(db, 'users')).then(snap => setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() }))));

        const unsubEvents = onSnapshot(query(collection(db, 'attendance_requests'), where('Status', '==', 'Approved')), 
            (snap) => setAllEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const unsubMine = onSnapshot(query(collection(db, 'attendance_requests'), where('userId', '==', currentUser.uid)), 
            (snap) => setMyRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.createdAt - a.createdAt)));

        const unsubPending = onSnapshot(query(collection(db, 'attendance_requests'), where('Status', '==', 'Pending')), (snap) => {
            setMyPendingApprovals(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.ApprovalSteps?.[d.CurrentStep || 0]?.approverUid === currentUser.uid));
        });

        const logId = `${currentUser.uid}_${new Date().toISOString().split('T')[0]}`;
        const unsubAttendance = onSnapshot(doc(db, 'daily_attendance', logId), (snap) => setAttendanceLog(snap.exists() ? snap.data() : null));

        return () => { unsubEvents(); unsubMine(); unsubPending(); unsubAttendance(); };
    }, [currentUser]);

    // 자동 출근 로직
    useEffect(() => {
        const checkAutoIn = () => {
            const now = new Date();
            const logId = `${currentUser?.uid}_${now.toISOString().split('T')[0]}`;
            if (now.getHours() >= 6 && !attendanceLog?.checkIn && currentUser) {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(() => {
                        setDoc(doc(db, 'daily_attendance', logId), { 
                            userId: currentUser.uid, userName: userProfile?.displayName, 
                            date: now.toISOString().split('T')[0], checkIn: serverTimestamp(), checkOut: null,
                            autoCheckIn: true 
                        });
                    }, () => {});
                }
            }
        };
        if (currentUser && attendanceLog === null) checkAutoIn();
    }, [currentUser, attendanceLog]);

    // 실시간 근무 타이머
    useEffect(() => {
        let itv;
        const getDateObj = (val) => val?.toDate ? val.toDate() : new Date(val);
        if (attendanceLog?.checkIn && !attendanceLog?.checkOut) {
            itv = setInterval(() => {
                const diff = new Date() - getDateObj(attendanceLog.checkIn);
                const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
                setElapsedTime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
            }, 1000);
        } else if (attendanceLog?.checkIn && attendanceLog?.checkOut) {
            const diff = getDateObj(attendanceLog.checkOut) - getDateObj(attendanceLog.checkIn);
            const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
            setElapsedTime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
        } else setElapsedTime('00:00:00');
        return () => clearInterval(itv);
    }, [attendanceLog]);

    const handleCheckIn = async () => {
        const id = `${currentUser.uid}_${new Date().toISOString().split('T')[0]}`;
        await setDoc(doc(db, 'daily_attendance', id), { userId: currentUser.uid, userName: userProfile?.displayName, date: new Date().toISOString().split('T')[0], checkIn: serverTimestamp(), checkOut: null, autoCheckIn: false });
    };

    const handleCheckOut = async () => {
        const id = `${currentUser.uid}_${new Date().toISOString().split('T')[0]}`;
        await updateDoc(doc(db, 'daily_attendance', id), { checkOut: serverTimestamp() });
    };

    // 통합 신청 처리
    const handleApplySubmit = async (e) => {
        e.preventDefault();
        if (manualSteps.some(s => !s.approverUid)) return alert('결재자를 모두 지정하세요.');
        
        let finalStart = formData.startDate;
        let finalEnd = formData.endDate;
        if (formData.category === 'Standard') {
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            nextMonth.setDate(1);
            finalStart = nextMonth.toISOString().split('T')[0];
            const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
            finalEnd = lastDay.toISOString().split('T')[0];
        }

        const sDate = new Date(finalStart);
        const eDate = new Date(finalEnd);
        const diffDays = Math.ceil((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;

        const data = { 
            category: formData.category,
            type: formData.type,
            title: `${formData.category === 'Leave' ? '휴가' : formData.category === 'Flex' ? '유연근로' : formData.category === 'Standard' ? '기본근무' : '근태'} (${formData.type})`, 
            userId: currentUser.uid, 
            userName: userProfile?.displayName,
            department: userProfile?.department || '일반',
            startDate: finalStart,
            endDate: finalEnd,
            startTime: formData.startTime,
            endTime: formData.endTime,
            totalDays: diffDays > 0 ? diffDays : 0,
            reason: formData.reason,
            Status: 'Pending', 
            CurrentStep: 0, 
            ApprovalSteps: manualSteps.map((s, i) => ({ label: s.label, approverUid: s.approverUid, order: i })), 
            createdAt: serverTimestamp() 
        };

        await addDoc(collection(db, 'attendance_requests'), data);
        if (data.ApprovalSteps?.[0]) {
            await createNotification(data.ApprovalSteps[0].approverUid, '신규 결재', `'${data.title}' 건 결재가 요청되었습니다.`);
        }
        setActiveModal(null);
        alert('신청이 완료되었습니다.');
    };

    // 결재 승인/반려 처리
    const processApproval = async (req, action, comment = '') => {
        if (action === 'Reject' && !comment) return alert('반려 사유를 입력하세요.');
        const curIdx = req.CurrentStep || 0;
        const isLast = curIdx + 1 >= req.ApprovalSteps.length;
        const newStatus = action === 'Approve' ? (isLast ? 'Approved' : 'Pending') : 'Rejected';
        
        await updateDoc(doc(db, 'attendance_requests', req.id), { 
            Status: newStatus, 
            CurrentStep: action === 'Approve' ? curIdx + 1 : curIdx, 
            ApprovalHistory: arrayUnion({ step: curIdx, approverName: userProfile?.displayName, action, comment, timestamp: new Date().toISOString() }) 
        });

        if (action === 'Approve') {
            if (!isLast) {
                await createNotification(req.ApprovalSteps[curIdx + 1].approverUid, '결재 대기', `'${req.title}' 결재 차례입니다.`);
            } else {
                await createNotification(req.userId, '최종 승인', `'${req.title}' 건이 승인되었습니다.`);
                
                // 구글 캘린더 연동 (백그라운드 비동기)
                syncTaskToGoogleCalendar(req.id, {
                    title: `[${req.category}] ${req.title} (${req.userName})`,
                    description: `사유: ${req.reason}\n부서: ${req.department}`,
                    startDate: req.startDate,
                    endDate: req.endDate,
                    status: 'confirmed',
                    priority: 'high' // 색상을 위해 임의 지정
                }).catch(err => console.error("Calendar sync error:", err));
            }
        } else {
            await createNotification(req.userId, '반려 알림', `'${req.title}' 건이 반려되었습니다. 사유: ${comment}`);
            // 반려(취소) 시 캘린더에서도 삭제
            deleteTaskFromGoogleCalendar(req.id).catch(err => console.error("Calendar delete error:", err));
        }
        setDetailItem(null);
    };

    // 신청 모달 열기
    const openApplyModal = (category) => {
        setFormData({
            category,
            type: category === 'Leave' ? 'Annual' : category === 'Flex' ? 'Flex' : category === 'Standard' ? 'Standard' : 'Trip',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            startTime: '09:00', endTime: '18:00', reason: ''
        });
        // 근무시간 빌더 리셋
        setScheduleEntries([]);
        setTempDays([]);
        setTempTime({ start: '09:00', end: '18:00', breakMin: 60 });
        setActiveModal('apply');
    };

    // Calendar
    const year = viewDate.getFullYear(), month = viewDate.getMonth();
    const calendarDays = [];
    const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(year, month, i));
    const rowCount = Math.ceil(calendarDays.length / 7);

    const getDateObj = (val) => val?.toDate ? val.toDate() : new Date(val);
    const checkInTime = attendanceLog?.checkIn ? getDateObj(attendanceLog.checkIn).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null;
    const checkOutTime = attendanceLog?.checkOut ? getDateObj(attendanceLog.checkOut).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : null;

    return (
        <div className="p-5 bg-slate-50 h-full w-full font-sans flex flex-col overflow-hidden">
            <div className="max-w-[1600px] w-full mx-auto flex flex-col h-full min-h-0 overflow-hidden">

                {/* ── 페이지 헤더 ── */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3 flex-shrink-0">
                    <div>
                        <h1 className="text-lg font-black text-slate-900 flex items-center gap-4 tracking-tight">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl text-white shadow-xl shadow-blue-200">
                                <CalendarDays size={28} strokeWidth={2.5} />
                            </div>
                            통합 근태 대시보드
                        </h1>
                        <p className="text-slate-500 font-medium mt-3 ml-1">{userProfile?.displayName || '사용자'} · {userProfile?.department || '소속 부서'}</p>
                    </div>
                    {isHR && (
                        <button onClick={() => setActiveModal('hr')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all">
                            <Settings size={16}/> HR 설정
                        </button>
                    )}
                </div>

                {/* ── 상단 3대 요약 카드 ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 flex-shrink-0">
                    {/* 1. 휴가 신청 */}
                    <button
                        id="btn-leave-apply"
                        onClick={() => openApplyModal('Leave')}
                        className="group bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-2xl p-2.5 text-left shadow-sm hover:shadow-md transition-all duration-200"
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className="p-1.5 bg-blue-50 group-hover:bg-blue-100 rounded-xl transition-colors">
                                <Coffee className="text-blue-600" size={18}/>
                            </div>
                            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">클릭하여 신청 →</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">휴가 신청</p>
                                <p className="text-lg font-black text-slate-900">휴가신청</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">총 {balance.total}일 중 {balance.used}일 사용</p>
                            </div>
                            {/* 잔여일수 / 잔여시간 - 오른쪽에 정렬 */}
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">잔여 휴가</p>
                                <div className="flex items-end justify-end gap-0">
                                    <div className="flex items-end gap-0.5 pr-2">
                                        <span className="text-lg font-black text-blue-600">{balance.remaining}</span>
                                        <span className="text-[9px] font-bold text-blue-400 mb-0.5">일</span>
                                    </div>
                                    <span className="text-slate-300 font-black text-xs mb-0.5 select-none">/</span>
                                    <div className="flex items-end gap-0.5 pl-2">
                                        <span className="text-lg font-black text-violet-600">{balance.remainingHours}</span>
                                        <span className="text-[9px] font-bold text-violet-400 mb-0.5">시간</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </button>

                    {/* 2. 근태 관리 */}
                    <button
                        id="btn-attendance-apply"
                        onClick={() => openApplyModal('Flex')}
                        className="group bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-2xl p-2.5 text-left shadow-sm hover:shadow-md transition-all duration-200"
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className="p-1.5 bg-emerald-50 group-hover:bg-emerald-100 rounded-xl transition-colors">
                                <Briefcase className="text-emerald-600" size={18}/>
                            </div>
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">클릭하여 신청 →</span>
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">근태 신청</p>
                        <p className="text-lg font-black text-slate-900">근태관리</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">유연근로 · 출장 · 외근 신청</p>
                    </button>

                    {/* 3. 결재 대기 */}
                    <button
                        id="btn-approvals"
                        onClick={() => setActiveModal('approvals')}
                        className={clsx(
                            "group border rounded-2xl p-2.5 text-left shadow-sm hover:shadow-md transition-all duration-200",
                            myPendingApprovals.length > 0 
                                ? "bg-rose-50 hover:bg-rose-100 border-rose-200 hover:border-rose-300" 
                                : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300"
                        )}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className={clsx("p-1.5 rounded-xl transition-colors", myPendingApprovals.length > 0 ? "bg-rose-100 group-hover:bg-rose-200" : "bg-slate-100 group-hover:bg-slate-200")}>
                                <ShieldCheck className={myPendingApprovals.length > 0 ? "text-rose-600" : "text-slate-500"} size={18}/>
                            </div>
                            {myPendingApprovals.length > 0 && (
                                <span className="text-[9px] font-black text-white bg-rose-500 px-2 py-0.5 rounded-full animate-pulse">{myPendingApprovals.length}건 처리 필요</span>
                            )}
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">결재 대기</p>
                        <p className={clsx("text-lg font-black", myPendingApprovals.length > 0 ? "text-rose-700" : "text-slate-900")}>
                            {myPendingApprovals.length > 0 ? `${myPendingApprovals.length}건 대기` : '대기 없음'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">내 신청 내역 및 결재할 내역 확인</p>
                    </button>
                </div>

                {/* ── 메인 콘텐츠: 사이드바 + 캘린더 ── */}
                <div className="flex gap-5 flex-1 min-h-0 overflow-hidden mb-2">

                    {/* ── 왼쪽 사이드바 ── */}
                    <div className="w-[280px] min-w-[280px] flex flex-col gap-4 h-full overflow-y-auto pr-1 select-none">

                        {/* 오늘 근무 섹션 (출퇴근) */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 flex-shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <Clock size={13} className="text-slate-500"/>
                                    <h2 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">오늘 근무</h2>
                                </div>
                                {(checkInTime || checkOutTime) && (
                                    <span className="text-[8px] font-bold text-slate-400">
                                        {checkInTime && `${checkInTime} 출근`}
                                    </span>
                                )}
                            </div>
                            <div className="p-2">
                                {/* 타이머 */}
                                <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 mb-2">
                                    <p className={clsx(
                                        "text-base font-black font-mono",
                                        attendanceLog?.checkIn && !attendanceLog?.checkOut ? "text-blue-600" : "text-slate-700"
                                    )}>{elapsedTime}</p>
                                    {attendanceLog?.checkIn && !attendanceLog?.checkOut && (
                                        <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"/>
                                            근무중
                                        </span>
                                    )}
                                </div>
                                {/* 출퇴근 버튼 */}
                                <div className="flex gap-1.5">
                                    {!attendanceLog?.checkIn ? (
                                        <button
                                            id="btn-check-in"
                                            onClick={handleCheckIn}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg font-black flex justify-center items-center gap-1 text-[11px] shadow-sm shadow-blue-200 transition-all active:scale-95"
                                        >
                                            출근
                                        </button>
                                    ) : (
                                        <div className="flex-1 bg-emerald-50 border border-emerald-200 py-1.5 rounded-lg font-black flex justify-center items-center gap-1 text-emerald-600 text-[11px]">
                                            출근완료
                                        </div>
                                    )}
                                    <button
                                        id="btn-check-out"
                                        onClick={handleCheckOut}
                                        disabled={!attendanceLog?.checkIn || attendanceLog?.checkOut}
                                        className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 py-1.5 rounded-lg font-black flex justify-center items-center gap-1 border border-slate-200 text-[11px] transition-all"
                                    >
                                        퇴근
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 근태 현황 섹션 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 flex-shrink-0">
                                <Activity size={13} className="text-blue-600"/>
                                <h2 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">근태 현황</h2>
                            </div>
                            <div className="p-2">
                                <div className="grid grid-cols-2 gap-1.5">
                                    {/* 잔여 근로시간 */}
                                    <div className="p-2 bg-blue-50/70 rounded-lg border border-blue-100 flex flex-col justify-between">
                                        <p className="text-[8px] font-black text-blue-500 uppercase tracking-wider">잔여 시간</p>
                                        <p className="text-xs font-black text-blue-700 mt-1">{workStats.remaining}h</p>
                                    </div>

                                    {/* 누적 근로시간 */}
                                    <div className="p-2 bg-emerald-50/70 rounded-lg border border-emerald-100 flex flex-col justify-between">
                                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">누적 시간</p>
                                        <p className="text-xs font-black text-emerald-700 mt-1">{workStats.accumulated}h</p>
                                    </div>

                                    {/* 이번주 근로시간 */}
                                    <div className="col-span-2 p-2 bg-amber-50/70 rounded-lg border border-amber-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-[8px] font-black text-amber-600 uppercase tracking-wider">이번주 근무</p>
                                            <p className="text-xs font-black text-amber-700 mt-0.5">{workStats.weekly}h / {workStats.limit}h</p>
                                        </div>
                                        <div className="w-16 bg-amber-200 rounded-full h-1 overflow-hidden">
                                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min((workStats.weekly / workStats.limit) * 100, 100)}%` }}/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 근무 신청 섹션 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 flex-shrink-0">
                                <Edit3 size={13} className="text-slate-500"/>
                                <h2 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">근무 신청</h2>
                            </div>
                            <div className="p-1.5">
                                {/* 근무시간 조정 신청 */}
                                <button
                                    id="btn-worktime-adjust"
                                    onClick={() => openApplyModal('Standard')}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group text-left"
                                >
                                    <div className="w-6 h-6 rounded bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors flex-shrink-0">
                                        <Clock size={12} className="text-indigo-600"/>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">근무시간 조정 신청</p>
                                    </div>
                                    <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-400 transition-colors flex-shrink-0"/>
                                </button>
                            </div>
                        </div>

                        {/* 연장 근로 경고 */}
                        {workStats.overtime > 0 && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2 flex items-center gap-2 flex-shrink-0">
                                <AlertCircle size={13} className="text-rose-500 flex-shrink-0"/>
                                <div>
                                    <p className="text-[10px] font-black text-rose-600">연장 근로 {workStats.overtime}h 발생</p>
                                    <p className="text-[8px] text-rose-400">법정 52시간 준수 필요</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── 메인 캘린더 ── */}
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-0">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                            <h2 className="font-black text-base text-slate-800 flex items-center gap-2">
                                <CalendarDays className="text-blue-600" size={18}/>
                                {year}년 {month+1}월 근무 현황
                            </h2>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button onClick={() => setViewDate(new Date(year, month-1, 1))} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-500 hover:text-slate-800"><ChevronLeft size={16}/></button>
                                <button onClick={() => setViewDate(new Date())} className="px-3 text-xs font-black text-slate-600">오늘</button>
                                <button onClick={() => setViewDate(new Date(year, month+1, 1))} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-500 hover:text-slate-800"><ChevronRight size={16}/></button>
                            </div>
                        </div>
                        {/* 요일 헤더 */}
                        <div className="grid grid-cols-7 border-b border-slate-100 flex-shrink-0">
                            {['일','월','화','수','목','금','토'].map((d,idx) => (
                                <div key={d} className={clsx("text-center py-3 text-[11px] font-black uppercase tracking-wider", idx===0 ? "text-rose-500" : idx===6 ? "text-blue-500" : "text-slate-400")}>
                                    {d}
                                </div>
                            ))}
                        </div>
                        {/* 달력 날짜 */}
                        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 flex-1 min-h-0" style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}>
                            {calendarDays.map((day, idx) => {
                                const formatted = day ? day.toISOString().split('T')[0] : '';
                                const mmdd = day ? `${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}` : '';
                                const dayEvents = allEvents.filter(e => formatted >= e.startDate && formatted <= e.endDate);
                                const isToday = day?.toDateString() === new Date().toDateString();
                                const isHoliday = KOREAN_HOLIDAYS[mmdd];
                                const isSun = day?.getDay() === 0;
                                const isSat = day?.getDay() === 6;
                                
                                return (
                                    <div key={idx} className={clsx(
                                        "p-2 flex flex-col gap-1 transition-colors min-h-0 overflow-hidden",
                                        !day && "bg-slate-50/60",
                                        day && "hover:bg-slate-50"
                                    )}>
                                        {day && (
                                            <>
                                                <div className="flex justify-between items-start flex-shrink-0">
                                                    <span className={clsx(
                                                        "text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg",
                                                        isToday ? "bg-blue-600 text-white shadow-sm shadow-blue-200" : 
                                                        (isHoliday || isSun) ? "text-rose-500" : 
                                                        isSat ? "text-blue-500" : "text-slate-700"
                                                    )}>{day.getDate()}</span>
                                                    {isHoliday && <span className="text-[8px] font-bold text-rose-400 text-right leading-tight max-w-[44px]">{KOREAN_HOLIDAYS[mmdd]}</span>}
                                                </div>
                                                <div className="space-y-0.5 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                                                    {dayEvents.map((ev, eIdx) => (
                                                        <div key={eIdx} className={clsx(
                                                            "text-[8px] font-bold px-1.5 py-0.5 rounded border truncate leading-tight",
                                                            ev.category === 'Leave' ? "bg-blue-50 text-blue-700 border-blue-100" : 
                                                            ev.category === 'Flex' ? "bg-teal-50 text-teal-700 border-teal-100" : 
                                                            "bg-amber-50 text-amber-700 border-amber-100"
                                                        )}>
                                                            <span className="font-black">[{ev.department}] {ev.userName}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════ */}
            {/* 통합 신청 모달                       */}
            {/* ══════════════════════════════════ */}
            {activeModal === 'apply' && (
                <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] border border-slate-200">
                        {/* 왼쪽: 폼 */}
                        <div className="flex-1 p-7 overflow-y-auto border-r border-slate-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-slate-800">
                                    {formData.category === 'Standard' ? '⏰ 근무시간 조정 신청' : 
                                     formData.category === 'Leave' ? '☕ 휴가 신청' : '💼 근태관리 신청'}
                                </h3>
                                <button onClick={() => setActiveModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                    <XCircle size={22}/>
                                </button>
                            </div>
                            <form className="space-y-5">
                                {/* 카테고리 탭 */}
                                {formData.category !== 'Standard' && formData.category !== 'Leave' && (
                                    <div className="flex gap-1.5 p-1.5 bg-slate-100 rounded-xl">
                                        {['Flex', 'Outside'].map(cat => (
                                            <button key={cat} type="button"
                                                onClick={() => setFormData({...formData, category: cat, type: cat === 'Flex' ? 'Flex' : 'Trip'})}
                                                className={clsx("flex-1 py-2 text-xs font-black rounded-lg transition-all", formData.category === cat ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700")}
                                            >
                                                {cat === 'Flex' ? '🔄 유연근로 신청' : '🏢 외근/출장 신청'}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {formData.category === 'Standard' && (
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs font-bold text-indigo-700">
                                        ℹ️ 익월 1일부터 적용됩니다. 요일별 근무시간을 설정하세요.
                                    </div>
                                )}

                                {/* 상세 분류 */}
                                {formData.category !== 'Standard' && (
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-wider">상세 분류</label>
                                        <select className="w-full bg-slate-50 p-3 rounded-xl text-sm font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                            {formData.category === 'Leave' ? (<><option value="Annual">연차</option><option value="Hourly">시간제</option><option value="Official">공가</option></>) : 
                                             formData.category === 'Flex' ? (<option value="Flex">유연근로(시차출퇴근)</option>) : 
                                             (<><option value="Trip">출장</option><option value="Outside">외근</option><option value="WFH">재택근무</option></>)}
                                        </select>
                                    </div>
                                )}

                                {/* ── 근무시간 조정 빌더 UI ── */}
                                {formData.category === 'Standard' && (
                                    <div className="space-y-4">

                                        {/* 등록된 스케줄 내역 */}
                                        {scheduleEntries.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">등록된 스케줄</p>
                                                {scheduleEntries.map((entry, idx) => (
                                                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                                                        <div className="flex items-center gap-2">
                                                            {/* 요일 빅지 */}
                                                            <div className="flex gap-1">
                                                                {entry.days.map(dk => (
                                                                    <span key={dk} className="text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-md">
                                                                        {ALL_DAYS.find(d => d.key === dk)?.label}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <div className="text-xs font-bold text-slate-700">
                                                                {entry.start} ~ {entry.end}
                                                                <span className="text-slate-400 ml-1.5">휴게 {entry.breakMin}분</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                                                실근무 {getEntryWorkHours(entry).toFixed(1)}h
                                                            </span>
                                                            <button type="button" onClick={() => setScheduleEntries(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all">
                                                                <Trash2 size={13}/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {/* 주간 합계 */}
                                                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                                                    <span className="text-[10px] font-black text-slate-500">주간 총 근무시간</span>
                                                    <span className="text-sm font-black text-blue-700">{weeklyTotal.toFixed(1)}h / 주</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* 남은 요일이 있으면 입력 UI 표시 */}
                                        {availableDays.length > 0 ? (
                                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">스케줄 추가</p>

                                                {/* 요일 체크박스 */}
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 mb-2">적용할 요일 선택</p>
                                                    <div className="flex gap-2">
                                                        {availableDays.map(({ key, label }) => (
                                                            <label key={key} className={clsx(
                                                                'flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all text-sm font-black select-none',
                                                                tempDays.includes(key)
                                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200'
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
                                                            )}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only"
                                                                    checked={tempDays.includes(key)}
                                                                    onChange={e => setTempDays(prev =>
                                                                        e.target.checked ? [...prev, key] : prev.filter(d => d !== key)
                                                                    )}
                                                                />
                                                                {label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* 시간 입력 */}
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5">출근 시간</label>
                                                        <input type="time" step={1800} className="w-full bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={tempTime.start} onChange={e => setTempTime(t => ({...t, start: e.target.value}))}/>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5">퇴근 시간</label>
                                                        <input type="time" step={1800} className="w-full bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={tempTime.end} onChange={e => setTempTime(t => ({...t, end: e.target.value}))}/>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5">휴게(분)</label>
                                                        <input type="number" min="0" max="120" className="w-full bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={tempTime.breakMin} onChange={e => setTempTime(t => ({...t, breakMin: Number(e.target.value)}))}/>
                                                    </div>
                                                </div>

                                                {/* 실근무시간 프리뷰 + 추가 버튼 */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-500">
                                                        {tempDays.length > 0 ? `${tempDays.map(k => ALL_DAYS.find(d=>d.key===k)?.label).join('·')} 요일 실근무:` : '요일 선택 후'}
                                                        <span className="text-blue-600 font-black ml-1">
                                                            {Math.max(0, (timeToMin(tempTime.end) - timeToMin(tempTime.start) - tempTime.breakMin) / 60).toFixed(1)}h
                                                        </span>
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={addScheduleEntry}
                                                        disabled={tempDays.length === 0}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all shadow-sm shadow-blue-200"
                                                    >
                                                        + 추가
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0"/>
                                                <p className="text-xs font-black text-emerald-700">모든 요일 스케줄이 설정되었습니다!</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 날짜 - Standard 제외 */}
                                {formData.category !== 'Standard' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-wider">시작일</label>
                                            <input type="date" className="w-full bg-slate-50 p-3 rounded-xl text-sm font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                value={formData.startDate}
                                                onChange={e => setFormData({...formData, startDate: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-wider">종료일</label>
                                            <input type="date" className="w-full bg-slate-50 p-3 rounded-xl text-sm font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                value={formData.endDate}
                                                onChange={e => setFormData({...formData, endDate: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 시간 설정 - Flex / Hourly */}
                                {(formData.category === 'Flex' || formData.type === 'Hourly') && (
                                    <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-600 mb-2">출근(시작) 시간</label>
                                            <input type="time" step={1800} className="w-full bg-white border border-blue-200 rounded-lg text-sm font-bold outline-none p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})}/>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-600 mb-2">퇴근(종료) 시간</label>
                                            <input type="time" step={1800} className="w-full bg-white border border-blue-200 rounded-lg text-sm font-bold outline-none p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})}/>
                                        </div>
                                        <div className="col-span-2 text-[10px] font-bold text-blue-500">※ 휴게시간 1시간이 포함된 총 체류 시간을 설정하세요.</div>
                                    </div>
                                )}

                                {formData.category === 'Leave' && (() => {
                                    const reqDays = Math.max(0, Math.ceil((new Date(formData.endDate) - new Date(formData.startDate)) / (1000 * 60 * 60 * 24)) + 1);
                                    // 날짜 범위 내 각 날짜의 daySchedule 기반 시간 합산
                                    let totalReqHours = 0;
                                    for (let i = 0; i < reqDays; i++) {
                                        const d = new Date(formData.startDate);
                                        d.setDate(d.getDate() + i);
                                        totalReqHours += getDayWorkHours(d.getDay());
                                    }
                                    const afterDays = Math.max(0, balance.remaining - reqDays);
                                    const afterHours = Math.max(0, balance.remainingHours - totalReqHours);
                                    return (
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
                                            {/* 신청 일수 */}
                                            <div className="text-center">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">신청 일수</p>
                                                <p className="text-lg font-black text-blue-600">{reqDays}<span className="text-xs font-bold ml-0.5 text-blue-400">일</span></p>
                                                <p className="text-[9px] text-slate-400 mt-0.5">{totalReqHours.toFixed(1)}h 차감</p>
                                            </div>
                                            <div className="text-slate-300 font-black text-lg">→</div>
                                            {/* 신청 후 잔여 */}
                                            <div className="text-center">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">신청 후 잔여</p>
                                                <div className="flex items-end gap-0">
                                                    <div className="flex items-end gap-0.5 pr-2">
                                                        <span className={`text-lg font-black ${afterDays < 0 ? 'text-rose-500' : 'text-blue-600'}`}>{afterDays}</span>
                                                        <span className={`text-[10px] font-bold mb-0.5 ${afterDays < 0 ? 'text-rose-400' : 'text-blue-400'}`}>일</span>
                                                    </div>
                                                    <span className="text-slate-300 font-black text-base mb-0.5">/</span>
                                                    <div className="flex items-end gap-0.5 pl-2">
                                                        <span className={`text-lg font-black ${afterHours < 0 ? 'text-rose-500' : 'text-violet-600'}`}>{afterHours.toFixed(1)}</span>
                                                        <span className={`text-[10px] font-bold mb-0.5 ${afterHours < 0 ? 'text-rose-400' : 'text-violet-400'}`}>시간</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-wider">사유</label>
                                    <textarea className="w-full bg-slate-50 p-4 rounded-xl text-sm h-24 border border-slate-200 outline-none resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="상세 사유 입력" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})}/>
                                </div>
                            </form>
                        </div>

                        {/* 오른쪽: 결재선 */}
                        <div className="w-full md:w-[300px] bg-slate-50 p-6 overflow-y-auto flex flex-col border-t md:border-t-0 border-slate-100">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-black text-slate-700 flex items-center gap-1.5">
                                    <ShieldCheck size={15} className="text-blue-600"/> 결재선 구성
                                </h4>
                                <span className="text-[10px] font-bold text-slate-400">{manualSteps.length}단계</span>
                            </div>

                            {/* 하나의 통합 박스 */}
                            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                {/* 결재자 목록 */}
                                <div className="divide-y divide-slate-100">
                                    {manualSteps.map((s, idx) => (
                                        <div key={s.id} className="flex items-center gap-2 px-3 py-2.5 group hover:bg-slate-50 transition-colors">
                                            {/* 순번 뱃지 */}
                                            <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                                                {idx + 1}
                                            </span>
                                            {/* 직책 입력 */}
                                            <input
                                                type="text"
                                                value={s.label}
                                                onChange={e => setManualSteps(manualSteps.map(x => x.id === s.id ? {...x, label: e.target.value} : x))}
                                                className="w-16 text-[11px] font-bold text-slate-500 border-none p-0 bg-transparent outline-none focus:text-slate-800 placeholder:text-slate-300"
                                                placeholder="직책"
                                            />
                                            {/* 결재자 선택 */}
                                            <select
                                                value={s.approverUid}
                                                onChange={e => setManualSteps(manualSteps.map(x => x.id === s.id ? {...x, approverUid: e.target.value} : x))}
                                                className="flex-1 min-w-0 text-[11px] font-bold text-slate-700 border-none bg-transparent outline-none cursor-pointer focus:text-blue-600"
                                            >
                                                <option value="">결재자 선택...</option>
                                                {allUsers.map(u => (
                                                    <option key={u.uid} value={u.uid}>{u.displayName} ({u.department})</option>
                                                ))}
                                            </select>
                                            {/* 삭제 버튼 (hover 시 표시) */}
                                            {manualSteps.length > 1 && (
                                                <button
                                                    onClick={() => setManualSteps(manualSteps.filter(x => x.id !== s.id))}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all flex-shrink-0"
                                                >
                                                    <Trash2 size={12}/>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {/* + 결재자 추가 버튼 */}
                                <button
                                    onClick={() => setManualSteps([...manualSteps, { id: Date.now(), label: '승인', approverUid: '' }])}
                                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-black text-blue-500 hover:text-blue-700 hover:bg-blue-50 border-t border-slate-100 transition-colors"
                                >
                                    <UserPlus size={13}/>
                                    결재자 추가
                                </button>
                            </div>

                            <button onClick={handleApplySubmit} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black mt-4 shadow-sm shadow-blue-200 active:scale-95 transition-all text-sm">기안 상신하기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════ */}
            {/* 통합 결재 모달 (탭: 결재함 | 결재내역)       */}
            {/* ══════════════════════════════════════════ */}
            {activeModal === 'approvals' && (
                <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">

                        {/* 탭 헤더 */}
                        <div className="flex items-center justify-between px-6 pt-4 pb-0 border-b border-slate-100 flex-shrink-0">
                            <div className="flex gap-1">
                                {/* 결재함 탭 */}
                                <button
                                    onClick={() => setApprovalTab('inbox')}
                                    className={clsx(
                                        "relative px-5 py-3 text-sm font-black rounded-t-xl transition-all border-b-2",
                                        approvalTab === 'inbox'
                                            ? "text-slate-900 border-blue-600 bg-white"
                                            : "text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <ShieldCheck size={14}/>
                                        결재함
                                        {myPendingApprovals.length > 0 && (
                                            <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                                                {myPendingApprovals.length}
                                            </span>
                                        )}
                                    </span>
                                </button>

                                {/* 결재내역 탭 */}
                                <button
                                    onClick={() => setApprovalTab('history')}
                                    className={clsx(
                                        "relative px-5 py-3 text-sm font-black rounded-t-xl transition-all border-b-2",
                                        approvalTab === 'history'
                                            ? "text-slate-900 border-blue-600 bg-white"
                                            : "text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <Coffee size={14}/>
                                        결재내역
                                    </span>
                                </button>
                            </div>
                            <button onClick={() => setActiveModal(null)} className="mb-2 p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
                                <XCircle size={22}/>
                            </button>
                        </div>

                        {/* 탭 콘텐츠 */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">

                            {/* ── 결재함 탭 ── */}
                            {approvalTab === 'inbox' && (
                                <div className="p-4 space-y-5">
                                    {/* 내가 결재할 내역 */}
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"/>
                                            내가 결재할 내역
                                            <span className="text-rose-500">({myPendingApprovals.length})</span>
                                        </p>
                                        <div className="space-y-2">
                                            {myPendingApprovals.length === 0 ? (
                                                <div className="py-6 text-center text-slate-300 text-xs font-bold bg-white rounded-xl border border-dashed border-slate-200">
                                                    대기 중인 결재가 없습니다
                                                </div>
                                            ) : myPendingApprovals.map(req => (
                                                <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                                                <span className={clsx("text-[9px] font-black px-2 py-0.5 rounded-full border flex-shrink-0",
                                                                    req.category==='Leave'?"bg-blue-50 text-blue-700 border-blue-100":
                                                                    req.category==='Flex'?"bg-teal-50 text-teal-700 border-teal-100":"bg-amber-50 text-amber-700 border-amber-100"
                                                                )}>{req.title}</span>
                                                                <span className="text-[9px] text-slate-400 font-mono">#{req.id.slice(0,6)}</span>
                                                            </div>
                                                            <p className="text-sm font-bold text-slate-700 truncate">
                                                                <span className="font-black text-slate-900">[{req.department}] {req.userName}</span> 님
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 mt-0.5">{req.startDate} ~ {req.endDate}</p>
                                                        </div>
                                                        <div className="flex gap-1.5 flex-shrink-0">
                                                            <button onClick={() => processApproval(req, 'Approve')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-black hover:bg-blue-700 transition-colors shadow-sm">승인</button>
                                                            <button onClick={() => { const c = prompt('반려 사유를 입력하세요:'); if(c !== null) processApproval(req, 'Reject', c); }} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[11px] font-black hover:bg-rose-100 border border-rose-200 transition-colors">반려</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 내 신청 현황 */}
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/>
                                            내 신청 현황
                                            <span className="text-blue-400">({myRequests.length})</span>
                                        </p>
                                        <div className="space-y-2">
                                            {myRequests.length === 0 ? (
                                                <div className="py-6 text-center text-slate-300 text-xs font-bold bg-white rounded-xl border border-dashed border-slate-200">
                                                    신청 내역이 없습니다
                                                </div>
                                            ) : myRequests.map(req => (
                                                <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-slate-300 transition-all">
                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                        <span className={clsx("text-[9px] font-black px-2 py-0.5 rounded-full border flex-shrink-0",
                                                            req.category==='Leave'?"bg-blue-50 text-blue-700 border-blue-100":
                                                            req.category==='Flex'?"bg-teal-50 text-teal-700 border-teal-100":"bg-amber-50 text-amber-700 border-amber-100"
                                                        )}>{req.type}</span>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-slate-700 truncate">{req.title}</p>
                                                            <p className="text-[10px] text-slate-400">{req.startDate} ~ {req.endDate}</p>
                                                        </div>
                                                    </div>
                                                    <span className={clsx("text-[9px] font-black px-2.5 py-1 rounded-full border flex-shrink-0",
                                                        req.Status==='Pending'?"bg-amber-50 text-amber-600 border-amber-200":
                                                        req.Status==='Approved'?"bg-emerald-50 text-emerald-600 border-emerald-200":"bg-rose-50 text-rose-600 border-rose-200"
                                                    )}>
                                                        {req.Status === 'Pending' ? '검토중' : req.Status === 'Approved' ? '승인완료' : '반려'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── 결재내역 탭 (휴가 신청 내역) ── */}
                            {approvalTab === 'history' && (
                                <div className="p-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                                        <Coffee size={11} className="text-blue-500"/>
                                        승인된 휴가 신청 내역
                                    </p>
                                    <div className="space-y-2">
                                        {allEvents.filter(e => e.category === 'Leave').length === 0 ? (
                                            <div className="py-16 text-center text-slate-300 text-xs font-bold bg-white rounded-xl border border-dashed border-slate-200">
                                                <Coffee size={36} className="mx-auto mb-2 text-slate-200"/>
                                                승인된 휴가 내역이 없습니다
                                            </div>
                                        ) : allEvents
                                            .filter(e => e.category === 'Leave')
                                            .sort((a, b) => a.startDate > b.startDate ? -1 : 1)
                                            .map((ev, idx) => (
                                                <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-3 hover:border-blue-100 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                                            <Coffee size={14} className="text-blue-500"/>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <p className="text-sm font-black text-slate-800">{ev.userName}</p>
                                                                <span className="text-[9px] text-slate-400 font-medium">{ev.department}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold">
                                                                <CalendarDays size={10} className="text-slate-400"/>
                                                                {ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`}
                                                                {ev.totalDays > 0 && <span className="text-slate-300 ml-1">· {ev.totalDays}일</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full">
                                                            {ev.type === 'Annual' ? '연차' : ev.type === 'Half' ? '반차' : ev.type === 'Hourly' ? '시간제' : ev.type}
                                                        </span>
                                                        <span className="text-[9px] font-black px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">승인완료</span>
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}


            {/* 상세 보기 모달 */}
            {detailItem && (
                <div className="fixed inset-0 z-[110] bg-slate-900/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-black text-base text-slate-800">신청 상세 내역</h4>
                            <button onClick={()=>setDetailItem(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XCircle size={20}/></button>
                        </div>
                        <div className="space-y-4 text-sm">
                            <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
                                <p><span className="font-bold text-slate-400">신청자:</span> {detailItem.userName} ({detailItem.department})</p>
                                <p><span className="font-bold text-slate-400">분류:</span> {detailItem.title}</p>
                                <p><span className="font-bold text-slate-400">기간:</span> {detailItem.startDate} ~ {detailItem.endDate} {detailItem.startTime && `(${detailItem.startTime}~${detailItem.endTime})`}</p>
                            </div>
                            <div>
                                <p className="font-bold text-slate-400 mb-2 text-xs uppercase tracking-wider">상세 사유</p>
                                <div className="p-4 border border-slate-200 rounded-xl bg-white text-slate-700 min-h-[80px]">{detailItem.reason || '사유 없음'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* HR 휴가 등록 모달 */}
            {activeModal === 'hr' && isHR && (
                <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-7 border border-slate-200">
                        <div className="flex justify-between mb-5">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Settings size={18} className="text-slate-400"/> HR 휴가 부여</h3>
                            <button onClick={() => setActiveModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XCircle size={20}/></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-4 font-medium">사용자별 연차를 수동으로 조정합니다.</p>
                        <select className="w-full bg-slate-50 p-3 rounded-xl mb-3 font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                            <option>사용자 선택...</option>
                            {allUsers.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.department})</option>)}
                        </select>
                        <input type="number" placeholder="부여할 일수 (예: 15)" className="w-full bg-slate-50 p-3 rounded-xl mb-5 font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
                        <button onClick={() => {alert('부여되었습니다.'); setActiveModal(null);}} className="w-full bg-slate-900 hover:bg-black text-white font-black py-3.5 rounded-xl transition-colors text-sm">등록하기</button>
                    </div>
                </div>
            )}

            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 3px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }`}</style>
        </div>
    );
}
