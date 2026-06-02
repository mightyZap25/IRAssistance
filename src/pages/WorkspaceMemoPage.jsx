import React, { useState, useEffect, useCallback } from 'react';
import { 
    StickyNote, Save, Plus, Trash2, RefreshCw, Search, 
    FileText, Clock, AlertCircle, HardDrive, ChevronLeft, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ensureValidToken, fetchDrive, getOrCreateFolder } from '../services/googleService';
import RichMemoEditor from '../components/common/RichMemoEditor';

const MEMO_FOLDER_NAME = 'IR_Assistant_Memos';

export default function WorkspaceMemoPage() {
    const { userProfile } = useAuth();
    const [memos, setMemos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMemo, setSelectedMemo] = useState(null);
    const [memoContent, setMemoContent] = useState('');
    const [memoTitle, setMemoTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [folderId, setFolderId] = useState(null);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const loadMemos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const fid = await getOrCreateFolder(MEMO_FOLDER_NAME);
            setFolderId(fid);
            const q = `'${fid}' in parents and trashed = false`;
            const fields = 'files(id, name, modifiedTime, size)';
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc`;
            const data = await fetchDrive(url);
            setMemos(data.files || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadMemos(); }, [loadMemos]);

    const handleSelectMemo = async (memo) => {
        setSelectedMemo(memo);
        setMemoTitle(memo.name.replace('.html', ''));
        try {
            const url = `https://www.googleapis.com/drive/v3/files/${memo.id}?alt=media`;
            const token = await ensureValidToken();
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const text = await res.text();
            setMemoContent(text);
        } catch (err) { alert(err.message); }
    };

    const handleSaveMemo = async () => {
        if (!memoTitle.trim()) return alert('제목을 입력해 주세요.');
        setSaving(true);
        try {
            const token = await ensureValidToken();
            const name = memoTitle.trim().endsWith('.html') ? memoTitle.trim() : `${memoTitle.trim()}.html`;
            const metadata = { name: name, mimeType: 'text/html', parents: selectedMemo ? undefined : [folderId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([memoContent], { type: 'text/html' }));
            const url = selectedMemo ? `https://www.googleapis.com/upload/drive/v3/files/${selectedMemo.id}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
            const res = await fetch(url, { method: selectedMemo ? 'PATCH' : 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
            if (!res.ok) throw new Error('저장 실패');
            alert('메모가 저장되었습니다.');
            loadMemos();
        } catch (err) { alert(err.message); } finally { setSaving(false); }
    };

    const handleDeleteMemo = async (memoId) => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;
        try {
            const url = `https://www.googleapis.com/drive/v3/files/${memoId}`;
            const token = await ensureValidToken();
            await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            if (selectedMemo?.id === memoId) { setSelectedMemo(null); setMemoContent(''); setMemoTitle(''); }
            loadMemos();
        } catch (err) { alert(err.message); }
    };

    const filteredMemos = memos.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="h-screen flex bg-slate-50 overflow-hidden">
            {/* Left: Memo List Side (320px) */}
            <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-100 flex flex-col gap-4 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <StickyNote className="text-indigo-600" size={20} />
                            <span className="text-sm font-black text-slate-800 tracking-tight">구글 드라이브 메모</span>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={loadMemos} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all" title="새로고침"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
                            <button onClick={() => { setSelectedMemo(null); setMemoTitle(''); setMemoContent(''); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all" title="새 메모"><Plus size={14} /></button>
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="메모 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                    {loading && memos.length === 0 ? (
                        <div className="py-20 text-center opacity-30"><RefreshCw className="animate-spin mx-auto mb-2" size={20} /><p className="text-[9px] font-black uppercase">Loading...</p></div>
                    ) : filteredMemos.length === 0 ? (
                        <div className="py-20 text-center opacity-20"><FileText className="mx-auto mb-2" size={28} /><p className="text-[9px] font-black uppercase">No Memos</p></div>
                    ) : (
                        filteredMemos.map(memo => (
                            <div key={memo.id} onClick={() => handleSelectMemo(memo)} className={`group p-4 rounded-2xl cursor-pointer transition-all border ${selectedMemo?.id === memo.id ? 'bg-white border-indigo-200 shadow-md ring-4 ring-indigo-500/5' : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200'}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className={`text-[12px] font-black truncate flex-1 ${selectedMemo?.id === memo.id ? 'text-indigo-600' : 'text-slate-700'}`}>{memo.name.replace('.html', '')}</h3>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteMemo(memo.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={12} /></button>
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                                    <div className="flex items-center gap-1.5"><Clock size={10} /><span>{new Date(memo.modifiedTime).toLocaleDateString()}</span></div>
                                    <span className="font-mono">{memo.size ? `${(memo.size / 1024).toFixed(1)} KB` : ''}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="p-4 bg-white border-t border-slate-100 text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2"><HardDrive size={10} /> Cloud Sync: {MEMO_FOLDER_NAME}</div>
            </aside>

            {/* Right: Main Editor Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Fixed Top Bar (Title Only) */}
                <div className="px-8 py-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                    <div className="flex-1 max-w-3xl flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm border border-indigo-100">
                            <FileText size={20} />
                        </div>
                        <input 
                            type="text" 
                            placeholder="메모 제목을 입력하세요..." 
                            value={memoTitle} 
                            onChange={e => setMemoTitle(e.target.value)} 
                            className="flex-1 px-4 py-2 text-lg font-black text-slate-900 outline-none placeholder:text-slate-200 focus:border-b-2 focus:border-indigo-500 transition-all bg-transparent" 
                        />
                    </div>
                </div>

                {/* Editor Content Area (Scrollable) */}
                <div className="flex-1 overflow-hidden p-6">
                    <RichMemoEditor 
                        value={memoContent} 
                        onChange={setMemoContent} 
                        onSave={handleSaveMemo}
                        saving={saving}
                        placeholder="내용을 입력하거나 마크다운 문법을 사용하여 작성하세요." 
                    />
                </div>
            </main>
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 3px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }`}</style>
        </div>
    );
}
