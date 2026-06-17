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
    X
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
    const [selectedWeekly, setSelectedWeekly] = useState(null);

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
                                                    <File size={13} className={`shrink-0 mt-0.5 ${isActive ? 'text-indigo-500' : 'text-slate-300'}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[11px] font-black truncate leading-tight ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                            {m.target || '(제목 없음)'}
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
                                    주간 보고 ({weeklyMeetings.length})
                                </p>
                                <button onClick={() => { setSelectedWeekly(null); setIsWeeklyModalOpen(true); }} className="flex items-center gap-1 text-[10px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-all">
                                    <Plus size={10} /> 보고서 등록
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="py-1">
                                    {weeklyMeetings.map(m => (
                                        <button key={m.id} onClick={() => { setSelectedWeekly(m); setIsWeeklyModalOpen(true); }} className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-slate-50 border-l-[3px] border-transparent hover:border-slate-200 transition-all">
                                            <CalendarIcon size={13} className="shrink-0 mt-0.5 text-slate-400" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-black truncate leading-tight text-slate-700">
                                                    {m.department} 주간 보고
                                                </p>
                                                <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate">
                                                    {m.date?.toLocaleDateString('ko-KR')}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
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

            {/* === Weekly Tab === */}
            {activeTab === 'weekly' && (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-y-auto custom-scrollbar p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <div className="w-9 h-9 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
                        </div>
                    ) : weeklyMeetings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                            <CalendarIcon size={56} className="opacity-10 mb-4" />
                            <p className="text-sm font-black">등록된 주간 회의 보고서가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {weeklyMeetings.map((item) => (
                                <div key={item.id} className="group bg-slate-50/50 border border-slate-100 rounded-2xl p-6 hover:border-indigo-200 hover:bg-white hover:shadow-xl transition-all duration-300">
                                    <div className="flex justify-between items-start mb-5">
                                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black">{item.department}</span>
                                        <span className="text-[10px] font-bold text-slate-400">{item.date?.toLocaleDateString('ko-KR')}</span>
                                    </div>
                                    <h4 className="text-sm font-black text-slate-800 mb-5 leading-snug">
                                        {item.date?.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}<br />
                                        <span className="text-indigo-600">{item.department}</span> 주간 업무 보고
                                    </h4>
                                    <div className="flex gap-2">
                                        <a href={item.link} target="_blank" rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm">
                                            <ExternalLink size={13} /> 구글 시트 열기
                                        </a>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => { setSelectedWeekly(item); setIsWeeklyModalOpen(true); }}
                                                className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><FileText size={16} /></button>
                                            <button onClick={() => handleDeleteWeekly(item.id)}
                                                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
            <WeeklyMeetingModal
                isOpen={isWeeklyModalOpen}
                onClose={() => setIsWeeklyModalOpen(false)}
                onSave={handleSaveWeekly}
                weekly={selectedWeekly}
            />
        </div>
    );
}
