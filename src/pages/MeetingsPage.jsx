import React, { useState, useEffect } from 'react';
import { 
    Users, 
    Presentation, 
    Calendar as CalendarIcon, 
    Plus, 
    ExternalLink, 
    FileText, 
    Search,
    ChevronRight,
    MessageSquare,
    Link as LinkIcon
} from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import MeetingRegistrationModal from '../components/MeetingRegistrationModal';
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
    
    // Modal states
    const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
    const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [selectedWeekly, setSelectedWeekly] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [meetingData, weeklyData] = await Promise.all([
                getMeetings(),
                getWeeklyMeetings()
            ]);
            setMeetings(meetingData);
            setWeeklyMeetings(weeklyData);
        } catch (error) {
            console.error("Failed to fetch meetings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveMeeting = async (data) => {
        try {
            if (selectedMeeting) {
                await updateMeeting(selectedMeeting.id, data);
            } else {
                await addMeeting(data);
            }
            setIsMeetingModalOpen(false);
            fetchData();
        } catch (error) {
            console.error("Failed to save meeting:", error);
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
            console.error("Failed to save weekly meeting:", error);
        }
    };

    const handleDeleteMeeting = async (id) => {
        if (window.confirm("정말 삭제하시겠습니까?")) {
            await deleteMeeting(id);
            fetchData();
        }
    };

    const handleDeleteWeekly = async (id) => {
        if (window.confirm("정말 삭제하시겠습니까?")) {
            await deleteWeeklyMeeting(id);
            fetchData();
        }
    };

    const meetingColumnDefs = {
        dateTime: { label: '일시', default: true },
        presenter: { label: '발표자', default: true },
        target: { label: '대상 제품/프로젝트', default: true },
        attendees: { label: '참석자', default: true },
        materials: { label: '발표 자료', default: true }
    };

    const meetingCellRenderer = {
        dateTime: (val) => val ? new Date(val).toLocaleString('ko-KR', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit' 
        }) : '-',
        attendees: (val) => Array.isArray(val) ? (
            <div className="flex -space-x-2 overflow-hidden">
                {val.slice(0, 3).map((name, i) => (
                    <div key={i} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-black border-2 border-white ring-1 ring-indigo-50" title={name}>
                        {name[0]}
                    </div>
                ))}
                {val.length > 3 && (
                    <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold border-2 border-white ring-1 ring-slate-50">
                        +{val.length - 3}
                    </div>
                )}
            </div>
        ) : '-',
        materials: (val) => Array.isArray(val) && val.length > 0 ? (
            <div className="flex gap-1">
                {val.map((mat, i) => (
                    <a 
                        key={i} 
                        href={mat.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 bg-sky-50 text-sky-600 hover:bg-sky-100 rounded-lg transition-all"
                        title={mat.name}
                    >
                        <ExternalLink size={12}/>
                    </a>
                ))}
            </div>
        ) : <span className="text-slate-300">-</span>
    };

    return (
        <div className="h-full flex flex-col space-y-5">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <Users className="text-indigo-600" size={26} /> 회의 및 미팅 관리
                    </h1>
                    <p className="text-slate-400 text-xs mt-1.5 font-bold italic">회의 자료를 공유하고 주간 부서별 업무 보고를 통합 관리합니다.</p>
                </div>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    <button 
                        onClick={() => setActiveTab('meetings')}
                        className={`px-7 py-2.5 rounded-xl text-xs font-black transition-all duration-300 ${activeTab === 'meetings' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    >
                        회의/리뷰 자료
                    </button>
                    <button 
                        onClick={() => setActiveTab('weekly')}
                        className={`px-7 py-2.5 rounded-xl text-xs font-black transition-all duration-300 ${activeTab === 'weekly' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    >
                        주간 회의 보고
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                {loading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-50 flex items-center justify-center animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                            <p className="text-xs font-black text-indigo-600 animate-pulse">데이터를 불러오는 중...</p>
                        </div>
                    </div>
                )}

                {activeTab === 'meetings' ? (
                    <div className="flex-1 flex flex-col min-h-0">
                        <MasterDataGrid 
                            data={meetings}
                            columnDefs={meetingColumnDefs}
                            cellRenderer={meetingCellRenderer}
                            rowKey="id"
                            enableSearch={true}
                            searchPlaceholder="발표자, 대상, 내용 검색..."
                            onEdit={(row) => { setSelectedMeeting(row); setIsMeetingModalOpen(true); }}
                            onDelete={(row) => handleDeleteMeeting(row.id)}
                            extraHeaderActions={
                                <button 
                                    onClick={() => { setSelectedMeeting(null); setIsMeetingModalOpen(true); }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-100 active:scale-95"
                                >
                                    <Plus size={16} /> 신규 등록
                                </button>
                            }
                        />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
                                <CalendarIcon className="text-indigo-600" size={22} /> 부서별 주간 회의 리스트
                            </h3>
                            <button 
                                onClick={() => { setSelectedWeekly(null); setIsWeeklyModalOpen(true); }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-100 active:scale-95"
                            >
                                <Plus size={16} /> 보고서 등록
                            </button>
                        </div>

                        {weeklyMeetings.length === 0 && !loading ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                                <FileText size={64} className="opacity-10 mb-6" />
                                <p className="text-sm font-black tracking-tight">등록된 주간 회의 보고서가 없습니다.</p>
                                <p className="text-xs mt-2 opacity-60">우측 상단의 버튼을 눌러 첫 보고서를 등록해 보세요.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {weeklyMeetings.map((item) => (
                                    <div key={item.id} className="group bg-slate-50/50 border border-slate-100 rounded-[2rem] p-7 hover:border-indigo-200 hover:bg-white transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-100/50 cursor-default">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black border border-indigo-100/50">
                                                {item.department}
                                            </div>
                                            <span className="text-[10px] font-black text-slate-350 uppercase tracking-widest">
                                                {item.date?.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                            </span>
                                        </div>
                                        <h4 className="text-base font-black text-slate-800 mb-8 leading-tight">
                                            {item.date?.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}<br/>
                                            <span className="text-indigo-600">{item.department}</span> 주간 업무 보고
                                        </h4>
                                        <div className="flex gap-3">
                                            <a 
                                                href={item.link} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all duration-300 shadow-sm group/btn"
                                            >
                                                <ExternalLink size={15} className="group-hover/btn:scale-110 transition-transform" /> 구글 시트 열기
                                            </a>
                                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                <button 
                                                    onClick={() => { setSelectedWeekly(item); setIsWeeklyModalOpen(true); }}
                                                    className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
                                                >
                                                    <FileText size={18}/>
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteWeekly(item.id)}
                                                    className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <MeetingRegistrationModal 
                isOpen={isMeetingModalOpen}
                onClose={() => setIsMeetingModalOpen(false)}
                onSave={handleSaveMeeting}
                meeting={selectedMeeting}
            />

            <WeeklyMeetingModal 
                isOpen={isWeeklyModalOpen}
                onClose={() => setIsWeeklyModalOpen(false)}
                onSave={handleSaveWeekly}
                weekly={selectedWeekly}
            />
        </div>
    );
}
