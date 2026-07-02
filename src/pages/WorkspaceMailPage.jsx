import React, { useState, useEffect, useCallback } from 'react';
import { 
    Mail, Inbox, Send, Star, Trash2, Archive, 
    Search, Filter, RefreshCw, Plus, MoreVertical,
    ChevronLeft, ChevronRight, Paperclip, ExternalLink,
    User, Clock, Tag, ShieldCheck, AlertCircle, FileText, X,
    Reply, Forward, CornerUpLeft, SendHorizontal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function WorkspaceMailPage() {
    const { userProfile } = useAuth();
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFolder, setActiveFolder] = useState('inbox');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    
    // Compose State
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeData, setComposeData] = useState({ to: '', subject: '', content: '' });

    // 구글 토큰 확인 유틸
    const getValidToken = () => {
        const token = localStorage.getItem('google_access_token');
        const expiresAt = localStorage.getItem('google_access_token_expires_at');
        if (!token || !expiresAt || Date.now() > Number(expiresAt)) return null;
        return token;
    };

    const fetchEmails = useCallback(async () => {
        setLoading(true);
        const token = getValidToken();
        
        if (token) {
            try {
                // Gmail API 연동
                const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!listRes.ok) throw new Error('Gmail API fetch failed');
                const listData = await listRes.json();
                
                if (listData.messages && listData.messages.length > 0) {
                    const emailPromises = listData.messages.map(async (msg) => {
                        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const msgData = await msgRes.json();
                        
                        const headers = msgData.payload.headers;
                        const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
                        const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
                        const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');
                        
                        return {
                            id: msg.id,
                            sender: fromHeader ? fromHeader.value.split('<')[0].trim() : 'Unknown',
                            email: fromHeader ? (fromHeader.value.match(/<(.*)>/)?.[1] || fromHeader.value) : '',
                            subject: subjectHeader ? subjectHeader.value : '(제목 없음)',
                            content: msgData.snippet || '',
                            date: dateHeader ? new Date(dateHeader.value).toLocaleString() : '',
                            isRead: !msgData.labelIds.includes('UNREAD'),
                            isStarred: msgData.labelIds.includes('STARRED'),
                            hasAttachment: msgData.payload.parts?.some(p => p.filename && p.filename.length > 0) || false,
                            folder: msgData.labelIds.includes('SENT') ? 'sent' : 'inbox',
                            tags: ['API 연동됨']
                        };
                    });
                    const fetchedEmails = await Promise.all(emailPromises);
                    setEmails(fetchedEmails);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.warn('Gmail API 실패. 폴백 Mock 데이터 사용:', err);
            }
        }
        
        // Mock 데이터 폴백
        setTimeout(() => {
            const mockData = [
                {
                    id: 'm1',
                    sender: '(주)솔루션테크',
                    email: 'sales@solutiontech.co.kr',
                    subject: 'IR-S100 시리즈 견적서 송부의 건',
                    content: '안녕하세요, 요청하신 IR-S100 시리즈에 대한 견적서를 첨부와 같이 송부드립니다. 검토 후 연락 부탁드립니다.\n\n[첨부파일: QUOTATION_IR-S100.pdf]',
                    date: '2026-06-02 10:30',
                    isRead: false,
                    isStarred: true,
                    hasAttachment: true,
                    folder: 'inbox',
                    tags: ['견적', '긴급']
                },
                {
                    id: 'm2',
                    sender: '구글 클라우드',
                    email: 'noreply@google.com',
                    subject: '프로젝트 스토리지 사용량 알림',
                    content: '귀하의 프로젝트 IR_Assistant의 스토리지 사용량이 80%에 도달했습니다. 추가 용량을 확보하거나 정리가 필요합니다.',
                    date: '2026-06-02 09:15',
                    isRead: true,
                    isStarred: false,
                    hasAttachment: false,
                    folder: 'inbox',
                    tags: ['알림']
                },
                {
                    id: 'm3',
                    sender: '박지민 팀장',
                    email: 'jm.park@mightyzap.com',
                    subject: '주간 업무 보고 및 다음주 생산 계획 공유',
                    content: '금주 이슈 사항 정리 및 차주 생산 계획 공유드립니다. 월요일 회의 때 논의 예정입니다.',
                    date: '2026-06-01 17:45',
                    isRead: true,
                    isStarred: false,
                    hasAttachment: true,
                    folder: 'inbox',
                    tags: ['업무보고']
                },
                {
                    id: 'm4',
                    sender: '해외영업팀',
                    email: 'global@mightyzap.com',
                    subject: '[RE] Export Inquiry for E-Series Models',
                    content: 'The client from Singapore is asking about the certification details for E-Series. Can we provide the CE docs?',
                    date: '2026-06-01 14:20',
                    isRead: false,
                    isStarred: true,
                    hasAttachment: false,
                    folder: 'inbox',
                    tags: ['해외']
                }
            ];
            setEmails(mockData);
            setLoading(false);
        }, 800);
    }, []);

    // Initial Load
    useEffect(() => {
        fetchEmails();
    }, [fetchEmails]);

    const handleSendEmail = async () => {
        if (!composeData.to || !composeData.subject) {
            alert('받는 사람과 제목을 입력하세요.');
            return;
        }

        const token = getValidToken();
        if (token) {
            try {
                const str = [
                    `To: ${composeData.to}`,
                    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(composeData.subject)))}?=`,
                    'Content-Type: text/plain; charset="UTF-8"',
                    'MIME-Version: 1.0',
                    '',
                    composeData.content
                ].join('\n');
                
                const raw = btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                
                const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ raw })
                });

                if (!res.ok) throw new Error('Failed to send email');
                alert('메일이 성공적으로 발송되었습니다.');
                setIsComposeOpen(false);
                fetchEmails(); // Refresh sent folder
                return;
            } catch (err) {
                console.error("Gmail 발송 오류:", err);
                alert('Gmail 발송 중 오류가 발생했습니다. (Mock 전송으로 대체)');
            }
        }
        
        // Mock Send
        alert('[Mock] 메일 발송 완료!');
        setIsComposeOpen(false);
    };

    const folders = [
        { id: 'inbox', label: '수신함', icon: Inbox, count: 2 },
        { id: 'starred', label: '중요 메일', icon: Star, count: 1 },
        { id: 'sent', label: '보낸 메일함', icon: Send, count: 0 },
        { id: 'drafts', label: '임시 보관함', icon: FileText, count: 0 },
        { id: 'archive', label: '아카이브', icon: Archive, count: 0 },
        { id: 'trash', label: '휴지통', icon: Trash2, count: 0 }
    ];

    const handleReply = (email) => {
        setComposeData({
            to: email.email,
            subject: `Re: ${email.subject}`,
            content: `\n\n----- Original Message -----\nFrom: ${email.sender}\nSent: ${email.date}\nSubject: ${email.subject}\n\n${email.content}`
        });
        setIsComposeOpen(true);
    };

    const handleCompose = () => {
        setComposeData({ to: '', subject: '', content: '' });
        setIsComposeOpen(true);
    };

    const handleToggleStar = (id) => {
        setEmails(prev => prev.map(e => e.id === id ? { ...e, isStarred: !e.isStarred } : e));
    };

    const handleMoveToFolder = (id, targetFolder) => {
        setEmails(prev => prev.map(e => e.id === id ? { ...e, folder: targetFolder } : e));
        setSelectedEmail(null);
    };

    const filteredEmails = emails.filter(e => {
        const matchesSearch = (e.sender.includes(searchTerm) || e.subject.includes(searchTerm) || e.content.includes(searchTerm));
        if (!matchesSearch) return false;
        
        if (activeFolder === 'starred') return e.isStarred;
        return e.folder === activeFolder;
    });

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
            {/* Upper Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                        <Mail size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">통합 메일 센터</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">Communication & Organization</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsConnecting(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-black transition-all"
                    >
                        <RefreshCw size={14} /> 외부 메일 연동
                    </button>
                    <button 
                        onClick={handleCompose}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xl shadow-indigo-100 transition-all active:scale-95"
                    >
                        <Plus size={18} /> 새 메일 작성
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Sidebar */}
                <aside className="w-64 border-r border-slate-100 bg-slate-50/40 flex flex-col p-5 shrink-0">
                    <div className="space-y-1.5 mb-10">
                        {folders.map(folder => (
                            <button
                                key={folder.id}
                                onClick={() => setActiveFolder(folder.id)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-black transition-all ${
                                    activeFolder === folder.id 
                                    ? 'bg-white text-indigo-600 shadow-md border border-slate-100 translate-x-1' 
                                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <folder.icon size={18} strokeWidth={activeFolder === folder.id ? 2.5 : 2} className={activeFolder === folder.id ? 'text-indigo-600' : 'text-slate-400'} />
                                    <span>{folder.label}</span>
                                </div>
                                {folder.count > 0 && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeFolder === folder.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                        {folder.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-5">
                        <div className="flex items-center justify-between px-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">분류 태그</p>
                            <button className="text-slate-400 hover:text-indigo-600"><Plus size={12}/></button>
                        </div>
                        <div className="space-y-1">
                            {[
                                { name: '업무보고', color: 'bg-blue-500' },
                                { name: '견적', color: 'bg-emerald-500' },
                                { name: '해외', color: 'bg-violet-500' },
                                { name: '긴급', color: 'bg-rose-500' }
                            ].map(tag => (
                                <button key={tag.name} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-white/60 hover:text-slate-900 transition-all group">
                                    <div className={`w-2 h-2 rounded-full ${tag.color} ring-4 ring-transparent group-hover:ring-slate-100 transition-all`} />
                                    {tag.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Email List */}
                <main className="flex-1 flex flex-col min-w-0 bg-white">
                    {/* Toolbar */}
                    <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-6 bg-white sticky top-0 z-10">
                        <div className="relative flex-1 max-w-xl">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input 
                                type="text" 
                                placeholder="메일 검색 (보낸이, 제목, 본문)..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="필터"><Filter size={18} /></button>
                            <button onClick={fetchEmails} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="새로고침"><RefreshCw size={18} /></button>
                            <div className="w-px h-6 bg-slate-100 mx-2" />
                            <button className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title="선택 삭제"><Trash2 size={18} /></button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-60">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                                <p className="text-[10px] font-black text-slate-500 tracking-[0.3em] uppercase">Syncing Mailbox...</p>
                            </div>
                        ) : filteredEmails.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-6">
                                <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 flex items-center justify-center text-slate-200 border border-slate-100 shadow-inner">
                                    <Inbox size={40} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">메일함이 비어있습니다</p>
                                    <p className="text-[10px] text-slate-300 font-bold mt-2">새로운 메시지가 오면 여기에 표시됩니다.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50 bg-white">
                                {filteredEmails.map(email => (
                                    <div 
                                        key={email.id} 
                                        onClick={() => setSelectedEmail(email)}
                                        className={`group px-6 py-5 flex items-center gap-5 cursor-pointer transition-all hover:bg-indigo-50/40 relative ${!email.isRead ? 'bg-indigo-50/5' : ''}`}
                                    >
                                        {!email.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />}
                                        
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleToggleStar(email.id); }}
                                            className={`shrink-0 transition-all ${email.isStarred ? 'text-amber-400 scale-110' : 'text-slate-200 hover:text-slate-400'}`}
                                        >
                                            <Star size={18} fill={email.isStarred ? 'currentColor' : 'none'} strokeWidth={2.5} />
                                        </button>

                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 group-hover:bg-white group-hover:shadow-md group-hover:text-indigo-600 transition-all font-black text-sm border border-transparent group-hover:border-indigo-100">
                                            {email.sender[0]}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <h3 className={`text-xs truncate ${!email.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-500'}`}>
                                                    {email.sender}
                                                    <span className="ml-2 text-[10px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-all">
                                                        &lt;{email.email}&gt;
                                                    </span>
                                                </h3>
                                                <span className="text-[10px] font-black text-slate-400 shrink-0 tracking-tight">{email.date.split(' ')[1]}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <h4 className={`text-sm truncate ${!email.isRead ? 'font-black text-slate-800' : 'font-medium text-slate-600'}`}>{email.subject}</h4>
                                                {email.hasAttachment && <Paperclip size={12} className="text-slate-400 shrink-0" />}
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium truncate mt-1 leading-relaxed">{email.content}</p>
                                        </div>

                                        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                            {email.tags.map(tag => (
                                                <span key={tag} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-wider">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Compose Modal */}
            {isComposeOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10002] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[95vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-200">
                        <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <Plus size={20} className="text-blue-400" />
                                <h3 className="text-lg font-black tracking-tight uppercase">새 메시지 작성</h3>
                            </div>
                            <button onClick={() => setIsComposeOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">받는 사람 (To)</label>
                                    <input 
                                        type="email" 
                                        value={composeData.to}
                                        onChange={e => setComposeData({...composeData, to: e.target.value})}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                        placeholder="recipient@example.com"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">제목 (Subject)</label>
                                    <input 
                                        type="text" 
                                        value={composeData.subject}
                                        onChange={e => setComposeData({...composeData, subject: e.target.value})}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                        placeholder="메일 제목을 입력하세요"
                                    />
                                </div>
                                <div className="space-y-1.5 flex flex-col h-full">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">본문 (Content)</label>
                                    <textarea 
                                        rows={8}
                                        value={composeData.content}
                                        onChange={e => setComposeData({...composeData, content: e.target.value})}
                                        className="w-full flex-1 px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none min-h-[200px]"
                                        placeholder="내용을 입력하세요..."
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
                            <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200">
                                <Paperclip size={20} />
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => setIsComposeOpen(false)} className="px-6 py-3 text-sm font-black text-slate-500 hover:bg-slate-200 rounded-xl transition-all">취소</button>
                                <button onClick={handleSendEmail} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-100 flex items-center gap-2 active:scale-95 transition-all">
                                    <SendHorizontal size={18} /> 보내기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Connecting Modal (External Mail) */}
            {isConnecting && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden p-10 flex flex-col gap-8 animate-in zoom-in-95 duration-200 border border-slate-100">
                        <div className="text-center space-y-3">
                            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-100">
                                <RefreshCw size={40} />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">외부 메일 계정 연동</h2>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed px-4">회사 메일(IMAP/Outlook)을 연결하여<br/>ERP 시스템 내에서 한눈에 통합 관리하세요.</p>
                        </div>

                        <div className="space-y-3">
                            <button className="w-full p-5 border-2 border-slate-50 rounded-[1.5rem] flex items-center justify-between hover:border-blue-500 hover:bg-blue-50/50 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-white transition-all shadow-sm"><Mail size={20} className="text-blue-600" /></div>
                                    <span className="text-sm font-black text-slate-700 tracking-tight">Outlook / MS 365</span>
                                </div>
                                <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-600" />
                            </button>
                            <button className="w-full p-5 border-2 border-slate-50 rounded-[1.5rem] flex items-center justify-between hover:border-rose-500 hover:bg-rose-50/50 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-white transition-all shadow-sm"><Mail size={20} className="text-rose-600" /></div>
                                    <span className="text-sm font-black text-slate-700 tracking-tight">Google Gmail</span>
                                </div>
                                <ChevronRight size={20} className="text-slate-300 group-hover:text-rose-600" />
                            </button>
                            <button className="w-full p-5 border-2 border-slate-50 rounded-[1.5rem] flex items-center justify-between hover:border-slate-400 hover:bg-slate-50 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-white transition-all shadow-sm"><ShieldCheck size={20} className="text-slate-600" /></div>
                                    <span className="text-sm font-black text-slate-700 tracking-tight">기타 IMAP 계정</span>
                                </div>
                                <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-600" />
                            </button>
                        </div>

                        <button 
                            onClick={() => setIsConnecting(false)}
                            className="w-full py-4 text-xs font-black text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all tracking-widest uppercase"
                        >
                            나중에 하기
                        </button>
                    </div>
                </div>
            )}

            {/* Email Detail Panel (Side) */}
            {selectedEmail && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-end">
                    <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] animate-in fade-in duration-300" onClick={() => setSelectedEmail(null)}></div>
                    <div className="relative w-full max-w-2xl h-screen bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 border-l border-slate-100 overflow-hidden">
                        {/* Detail Toolbar */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                            <div className="flex gap-2">
                                <button onClick={() => setSelectedEmail(null)} className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-2xl transition-all">
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="w-px h-6 bg-slate-100 self-center mx-2" />
                                <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all" title="아카이브"><Archive size={20}/></button>
                                <button className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all" title="삭제"><Trash2 size={20}/></button>
                                <button className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-2xl transition-all"><AlertCircle size={20}/></button>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleToggleStar(selectedEmail.id)}
                                    className={`p-3 rounded-2xl transition-all ${selectedEmail.isStarred ? 'text-amber-400 bg-amber-50' : 'text-slate-400 hover:bg-slate-50'}`}
                                >
                                    <Star size={20} fill={selectedEmail.isStarred ? 'currentColor' : 'none'}/>
                                </button>
                                <button className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-2xl transition-all"><MoreVertical size={20}/></button>
                            </div>
                        </div>

                        {/* Content Scrollable Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {/* Subject Header */}
                            <div className="px-10 py-10 bg-slate-50/30">
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {selectedEmail.tags.map(tag => (
                                        <span key={tag} className="px-3 py-1 rounded-xl bg-white border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest shadow-sm">{tag}</span>
                                    ))}
                                </div>
                                <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">{selectedEmail.subject}</h2>
                            </div>

                            {/* Sender Info */}
                            <div className="px-10 py-8 border-y border-slate-50 flex items-center justify-between bg-white">
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-black text-xl shadow-xl shadow-indigo-100">
                                        {selectedEmail.sender[0]}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-base font-black text-slate-900">{selectedEmail.sender}</p>
                                            <span className="text-[10px] font-bold text-slate-400">&lt;{selectedEmail.email}&gt;</span>
                                        </div>
                                        <p className="text-xs font-bold text-slate-400 mt-0.5">To: Me &lt;{userProfile?.email || 'user@mightyzap.com'}&gt;</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black text-slate-400 flex items-center gap-2 justify-end uppercase tracking-tighter">
                                        <Clock size={14} /> {selectedEmail.date}
                                    </p>
                                    <button className="text-[10px] font-black text-indigo-600 hover:underline mt-2 uppercase tracking-widest">History</button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-10 py-12">
                                <div className="text-[15px] text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                                    {selectedEmail.content}
                                </div>

                                {selectedEmail.hasAttachment && (
                                    <div className="mt-16 space-y-4">
                                        <div className="flex items-center gap-2 px-2">
                                            <Paperclip size={14} className="text-slate-400" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Attachments (1)</p>
                                        </div>
                                        <div className="p-5 bg-white border-2 border-slate-50 rounded-3xl flex items-center justify-between group hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50/50 transition-all cursor-pointer shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 font-black text-xs border border-rose-100">PDF</div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-slate-800 truncate">{selectedEmail.attachmentName || 'QUOTATION_IR-S100.pdf'}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedEmail.attachmentSize || '1.2 MB'}</p>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 group-hover:bg-indigo-600 group-hover:text-white rounded-xl transition-all">
                                                <ExternalLink size={18} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Detail Footer (Reply/Forward) */}
                        <div className="p-8 border-t border-slate-100 bg-white shrink-0">
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => handleReply(selectedEmail)}
                                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] text-sm font-black transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-100 active:scale-95"
                                >
                                    <Reply size={20} /> 답장하기
                                </button>
                                <button className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[1.5rem] text-sm font-black transition-all flex items-center justify-center gap-3 active:scale-95">
                                    <Forward size={20} /> 전달하기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; } .no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        </div>
    );
}
