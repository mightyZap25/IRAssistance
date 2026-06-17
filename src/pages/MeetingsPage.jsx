import React, { useState, useEffect } from 'react';
import {
    Users,
    CalendarIcon,
    Plus,
    ExternalLink,
    FileText,
    Trash2,
    Clock,
    Pencil,
    File,
    X,
    ChevronDown,
    ChevronRight,
    Table2
} from 'lucide-react';
import MeetingEditorPanel from '../components/MeetingRegistrationModal';
import WeeklyMeetingModal from '../components/WeeklyMeetingModal';
import {
    getMeetings,
    addMeeting,
    updateMeeting,
    deleteMeeting,
    getWeeklyMeetings,
    addWeeklyMeeting,
    updateWeeklyMeeting,
    deleteWeeklyMeeting
} from '../services/meetingService';

export default function MeetingsPage() {
    const [activeTab, setActiveTab] = useState('meetings');
    const [meetings, setMeetings] = useState([]);
    const [weeklyMeetings, setWeeklyMeetings] = useState([]);
    const [loading, setLoading] = useState(true);

    // Split panel: undefined=nothing open, null=new, object=edit
    const [editingMeeting, setEditingMeeting] = useState(undefined);
    const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false);

    // 주간 보고 우측 편집창에 표시될 선택된 문서
    const [selectedWeeklyDoc, setSelectedWeeklyDoc] = useState(null);

    // 고정 부서 목록
    const WEEKLY_DEPARTMENTS = ['개발부서', '생산부서', '품질부서', '영업부서'];

    // 아코디언: 하나만 열림 (문자열 | null)
    const [openDept, setOpenDept] = useState('개발부서');
    const currentYear = new Date().getFullYear();
    const [deptYears, setDeptYears] = useState(
        Object.fromEntries(['개발부서', '생산부서', '품질부서', '영업부서'].map(d => [d, currentYear]))
    );

    const availableYears = [...new Set([
        currentYear,
        ...weeklyMeetings.map(m => {
            const d = m.date ? new Date(m.date) : null;
            return d ? d.getFullYear() : null;
        }).filter(Boolean)
    ])].sort((a, b) => b - a);

    const toggleDept = (dept) => {
        setOpenDept(prev => (prev === dept ? null : dept));
        // 다른 부서 선택 시 우측 편집창 초기화
        setSelectedWeeklyDoc(null);
    };

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [meetingData, weeklyData] = await Promise.all([getMeetings(), getWeeklyMeetings()]);
            setMeetings(meetingData);
            setWeeklyMeetings(weeklyData);
        } catch (error) {
            console.error('Failed to fetch meetings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveMeeting = async (data) => {
        try {
            if (editingMeeting?.id) {
                await updateMeeting(editingMeeting.id, data);
            } else {
                await addMeeting(data);
            }
            setEditingMeeting(undefined);
            fetchData();
        } catch (error) {
            console.error('Failed to save meeting:', error);
        }
    };

    const handleSaveWeekly = async (data) => {
        try {
            if (selectedWeekly) {
                await updateWeeklyMeeting(selectedWeekly.id, data);
            } else {
                await addWeeklyMeeting(data);
            }
            setIsWeeklyModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Failed to save weekly meeting:', error);
        }
    };

    const handleDeleteMeeting = async (id) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            await deleteMeeting(id);
            if (editingMeeting?.id === id) setEditingMeeting(undefined);
            fetchData();
        }
    };

    const handleDeleteWeekly = async (id) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            await deleteWeeklyMeeting(id);
            fetchData();
        }
    };

    const formatDate = (val) => {
        if (!val) return '';
        const d = new Date(val);
        return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    const isEditorOpen = editingMeeting !== undefined;

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-3">
            {/* Header */}
            <div className="flex justify-between items-center bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <h1 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <Users className="text-indigo-600" size={20} /> 회의 및 미팅 관리
                </h1>
                <p className="text-slate-400 text-[11px] font-bold">회의 자료를 공유하고 주간 부서별 업무 보고를 관리합니다.</p>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Left: File List Panel (Always Visible) */}
                <div className="w-64 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    {/* Tab Switcher */}
                    <div className="p-2 border-b border-slate-100 shrink-0">
                        <div className="flex bg-slate-100 p-1 rounded-xl w-full">
                            <button onClick={() => setActiveTab('meetings')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'meetings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                회의/리뷰 자료
                            </button>
                            <button onClick={() => setActiveTab('weekly')}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === 'weekly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                주간 회의 보고
                            </button>
                        </div>
                    </div>

                    {/* List Area based on active tab */}
                    {activeTab === 'meetings' ? (
                        <>
                            <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center shrink-0">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    회의록 목록 ({meetings.length})
                                </p>
                                <button onClick={() => setEditingMeeting(null)} className="flex items-center gap-1 text-[10px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-all">
                                    <Plus size={10} /> 신규 작성
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {loading ? (
                                    <div className="flex items-center justify-center h-24">
                                        <div className="w-6 h-6 border-2 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
                                    </div>
                                ) : meetings.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 text-slate-300 text-center">
                                        <FileText size={32} className="opacity-20 mb-2" />
                                        <p className="text-[10px] font-bold leading-relaxed">등록된 회의록이 없습니다</p>
                                        <p className="text-[9px] mt-1 opacity-60">신규 작성 버튼을 눌러 시작하세요</p>
                                    </div>
                                ) : (
                                    <div className="py-1">
                                        {meetings.map((m) => {
                                            const isActive = editingMeeting?.id === m.id;
                                            return (
                                                <button
                                                    key={m.id}
                                                    onClick={() => setEditingMeeting(m)}
                                                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2 group transition-all
                                                        ${isActive
                                                            ? 'bg-indigo-50 border-l-[3px] border-indigo-500'
                                                            : 'border-l-[3px] border-transparent hover:bg-slate-50 hover:border-slate-200'
                                                        }`}
                                                >
                                                    {m.docType === 'sheet' ? (
                                                        <File size={13} className={`shrink-0 mt-0.5 ${isActive ? 'text-emerald-600' : 'text-emerald-400'}`} />
                                                    ) : (
                                                        <FileText size={13} className={`shrink-0 mt-0.5 ${isActive ? 'text-indigo-600' : 'text-indigo-400'}`} />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[11px] font-black truncate leading-tight flex items-center gap-1.5 ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                            {m.docType === 'sheet' ? '📊' : '📄'} {m.target || '(제목 없음)'}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate">
                                                            {formatDate(m.dateTime)}
                                                            {m.presenter ? ` · ${m.presenter}` : ''}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(m.id); }}
                                                        className="shrink-0 p-0.5 text-slate-200 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center shrink-0">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    주간 보고
                                </p>
                                <button onClick={() => setIsWeeklyModalOpen(true)} className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-all">
                                    <Plus size={10} /> 신규
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {loading ? (
                                    <div className="flex items-center justify-center h-16">
                                        <div className="w-5 h-5 border-2 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    WEEKLY_DEPARTMENTS.map(dept => {
                                        const isOpen = openDept === dept;
                                        const selectedYear = deptYears[dept];
                                        const deptDocs = weeklyMeetings
                                            .filter(m => m.department === dept)
                                            .filter(m => {
                                                const d = m.date ? new Date(m.date) : null;
                                                return d && d.getFullYear() === selectedYear;
                                            })
                                            .sort((a, b) => new Date(b.date) - new Date(a.date));

                                        return (
                                            <div key={dept}>
                                                {/* 아코디언 헤더 버튼 */}
                                                <button
                                                    onClick={() => toggleDept(dept)}
                                                    className={`w-full px-3 py-2.5 flex items-center gap-2 text-left border-l-[3px] transition-all ${
                                                        isOpen
                                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                        : 'border-transparent text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {isOpen ? <ChevronDown size={12} className="shrink-0"/> : <ChevronRight size={12} className="shrink-0 text-slate-400"/>}
                                                    <Table2 size={12} className="shrink-0 opacity-60"/>
                                                    <span className="text-xs font-black flex-1">{dept}</span>
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        {weeklyMeetings.filter(m => m.department === dept).length}
                                                    </span>
                                                </button>

                                                {/* 아코디언 열림 시: 연도 콤보박스 + 리스트 */}
                                                {isOpen && (
                                                    <div className="bg-slate-50/80">
                                                        {/* 연도 콤보박스 */}
                                                        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                                                            <CalendarIcon size={11} className="text-slate-400 shrink-0" />
                                                            <select
                                                                value={selectedYear}
                                                                onChange={e => setDeptYears(prev => ({ ...prev, [dept]: Number(e.target.value) }))}
                                                                className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                                            >
                                                                {availableYears.map(y => (
                                                                    <option key={y} value={y}>{y}년</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* 문서 리스트 */}
                                                        {deptDocs.length === 0 ? (
                                                            <div className="py-6 flex flex-col items-center text-slate-300">
                                                                <Table2 size={24} className="opacity-20 mb-1"/>
                                                                <p className="text-[10px] font-bold">{selectedYear}년 문서 없음</p>
                                                            </div>
                                                        ) : (
                                                            deptDocs.map(item => {
                                                                const d = new Date(item.date);
                                                                const weekOfMonth = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
                                                                const isSelected = selectedWeeklyDoc?.id === item.id;
                                                                return (
                                                                    <button
                                                                        key={item.id}
                                                                        onClick={() => setSelectedWeeklyDoc(item)}
                                                                        className={`w-full text-left px-4 py-2.5 flex items-start gap-2 group border-l-[3px] transition-all ${
                                                                            isSelected
                                                                            ? 'border-emerald-500 bg-emerald-50'
                                                                            : 'border-transparent hover:bg-white hover:border-slate-200'
                                                                        }`}
                                                                    >
                                                                        <Table2 size={12} className={`shrink-0 mt-0.5 ${isSelected ? 'text-emerald-600' : 'text-slate-300'}`} />
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className={`text-[11px] font-black truncate leading-tight ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                                                {d.getMonth()+1}월 {weekOfMonth}주차
                                                                            </p>
                                                                            <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate">
                                                                                {d.toLocaleDateString('ko-KR')}
                                                                            </p>
                                                                        </div>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleDeleteWeekly(item.id); }}
                                                                            className="shrink-0 p-0.5 text-slate-200 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                                                                        >
                                                                            <Trash2 size={10}/>
                                                                        </button>
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Right Content Area */}
                {activeTab === 'meetings' && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        {isEditorOpen ? (
                            <MeetingEditorPanel
                                key={editingMeeting?.id ?? 'new'}
                                meeting={editingMeeting}
                                onSave={handleSaveMeeting}
                                onCancel={() => setEditingMeeting(undefined)}
                                onDocCreated={fetchData}
                            />
                        ) : (
                            /* Empty placeholder */
                            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-slate-300 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
                                    <FileText size={32} className="opacity-30" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-400">회의록을 선택하거나 새로 만드세요</p>
                                    <p className="text-xs text-slate-300 mt-1 font-bold">왼쪽 목록에서 파일을 선택하거나 신규 작성을 눌러주세요</p>
                                </div>
                                <button
                                    onClick={() => setEditingMeeting(null)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 transition-all active:scale-95"
                                >
                                    <Plus size={14} /> 신규 작성
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Right: Weekly Viewer */}
                {activeTab === 'weekly' && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        {selectedWeeklyDoc ? (
                            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                {/* 우측 헤더 */}
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0">
                                    <Table2 size={16} className="text-emerald-600" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-800 truncate">
                                            {selectedWeeklyDoc.title || selectedWeeklyDoc.department + ' 주간 업무 보고'}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-bold">
                                            {selectedWeeklyDoc.department} &middot; {new Date(selectedWeeklyDoc.date).toLocaleDateString('ko-KR')}
                                        </p>
                                    </div>
                                    <a
                                        href={selectedWeeklyDoc.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-xl text-[11px] font-black transition-all"
                                    >
                                        <ExternalLink size={13} /> 새예서 열기
                                    </a>
                                    <button
                                        onClick={() => setSelectedWeeklyDoc(null)}
                                        className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                {/* iframe */}
                                <iframe
                                    key={selectedWeeklyDoc.id}
                                    src={selectedWeeklyDoc.link.replace('/edit', '/edit?embedded=true&rm=minimal')}
                                    className="flex-1 w-full border-0"
                                    title="Google Sheet"
                                    allow="autoplay"
                                />
                            </div>
                        ) : (
                            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-slate-300 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-dashed border-emerald-200 flex items-center justify-center">
                                    <Table2 size={32} className="text-emerald-300" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-400">주간 보고서를 선택하세요</p>
                                    <p className="text-xs text-slate-300 mt-1 font-bold">왼쪽 아코디언에서 부서를 펼친 후 문서를 클릭하세요</p>
                                </div>
                                <button
                                    onClick={() => setIsWeeklyModalOpen(true)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-100 transition-all active:scale-95"
                                >
                                    <Plus size={14} /> 신규 주간 보고서 생성
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <WeeklyMeetingModal
                isOpen={isWeeklyModalOpen}
                onClose={() => setIsWeeklyModalOpen(false)}
                onSave={handleSaveWeekly}
            />
        </div>
    );
}
