import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, FileText, Loader, ExternalLink, AlertCircle } from 'lucide-react';
import { fetchDrive } from '../services/googleService';

const MEETING_FOLDER_ID = '1ri7Wac0KxC5ze9mLinX01xUTfzRzkrWL';

/**
 * 회의록 편집 패널 (인라인 - 모달 없음)
 * Props: meeting(null=신규), onSave, onCancel
 */
export default function MeetingEditorPanel({ meeting = null, onSave, onCancel, hideHeader = false }) {
    const [formData, setFormData] = useState({
        dateTime: '',
        presenter: '',
        attendees: '',
        target: '',
        googleDocUrl: '',
        googleDocId: '',
        materials: []
    });
    const [docStatus, setDocStatus] = useState('idle'); // 'idle' | 'creating' | 'ready' | 'error'
    const [docError, setDocError] = useState('');
    const hasCreated = useRef(false);

    useEffect(() => {
        hasCreated.current = false;
        setDocStatus('idle');
        setDocError('');

        if (meeting) {
            setFormData({
                ...meeting,
                dateTime: meeting.dateTime ? new Date(meeting.dateTime).toISOString().slice(0, 16) : '',
                attendees: Array.isArray(meeting.attendees) ? meeting.attendees.join(', ') : meeting.attendees || '',
                materials: meeting.materials || []
            });
            if (meeting.googleDocId) {
                setDocStatus('ready');
            } else if (meeting.googleDocUrl) {
                setDocStatus('ready');
            }
        } else {
            const now = new Date();
            const defaultTitle = `회의록_${now.toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}`;
            setFormData({
                dateTime: now.toISOString().slice(0, 16),
                presenter: '',
                attendees: '',
                target: defaultTitle,
                googleDocUrl: '',
                googleDocId: '',
                materials: []
            });
            if (!hasCreated.current) {
                hasCreated.current = true;
                createGoogleDoc(defaultTitle);
            }
        }
    }, [meeting]);

    const createGoogleDoc = async (title) => {
        setDocStatus('creating');
        setDocError('');
        try {
            const docTitle = title || `회의록_${new Date().toLocaleDateString('ko-KR')}`;
            const file = await fetchDrive('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: docTitle,
                    mimeType: 'application/vnd.google-apps.document',
                    parents: [MEETING_FOLDER_ID]
                })
            });

            const docId = file.id;
            const editUrl = `https://docs.google.com/document/d/${docId}/edit`;

            setFormData(prev => ({
                ...prev,
                googleDocUrl: editUrl,
                googleDocId: docId,
            }));
            setDocStatus('ready');
        } catch (err) {
            console.error('[createGoogleDoc] Error:', err);
            setDocError(err.message || '구글 문서 생성에 실패했습니다.');
            setDocStatus('error');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddMaterial = () => {
        setFormData(prev => ({ ...prev, materials: [...prev.materials, { name: '', link: '' }] }));
    };

    const handleMaterialChange = (index, field, value) => {
        const m = [...formData.materials];
        m[index][field] = value;
        setFormData(prev => ({ ...prev, materials: m }));
    };

    const handleRemoveMaterial = (index) => {
        setFormData(prev => ({ ...prev, materials: prev.materials.filter((_, i) => i !== index) }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const submissionData = {
            ...formData,
            dateTime: new Date(formData.dateTime),
            attendees: formData.attendees.split(',').map(s => s.trim()).filter(Boolean)
        };
        onSave(submissionData);
    };

    return (
        <div className="flex-1 h-full flex flex-col bg-white overflow-hidden">
            {/* Panel Header - hidden when embedded in popup */}
            {!hideHeader && (
                <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-indigo-50/40 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-indigo-100 rounded-lg">
                            <FileText size={15} className="text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-slate-800">
                                {meeting ? '회의록 편집' : '신규 회의록'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold">
                                {docStatus === 'ready' ? '구글 드라이브에 저장됨' : '구글 드라이브 연동 중...'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {formData.googleDocUrl && (
                            <a href={formData.googleDocUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 rounded-lg text-[10px] font-black transition-all">
                                <ExternalLink size={11} /> 새 탭
                            </a>
                        )}
                        {onCancel && (
                            <button type="button" onClick={onCancel}
                                className="px-3 py-1.5 text-[10px] font-black text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                                닫기
                            </button>
                        )}
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                {/* Top bar: metadata only, single line */}
                <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100 shrink-0 flex items-center gap-3">
                    {/* 일시 */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <label className="text-[9px] font-black text-slate-400 whitespace-nowrap">일시</label>
                        <input type="datetime-local" name="dateTime" value={formData.dateTime} onChange={handleChange}
                            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="w-px h-4 bg-slate-200 shrink-0" />
                    {/* 발표자 */}
                    <div className="flex items-center gap-1.5 w-32 shrink-0">
                        <label className="text-[9px] font-black text-slate-400 whitespace-nowrap">발표자</label>
                        <input type="text" name="presenter" value={formData.presenter} onChange={handleChange}
                            placeholder="이름" className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="w-px h-4 bg-slate-200 shrink-0" />
                    {/* 참석자 */}
                    <div className="flex items-center gap-1.5 w-44 shrink-0">
                        <label className="text-[9px] font-black text-slate-400 whitespace-nowrap">참석자</label>
                        <input type="text" name="attendees" value={formData.attendees} onChange={handleChange}
                            placeholder="쉼표로 구분" className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="w-px h-4 bg-slate-200 shrink-0" />
                    {/* 관련업무 */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <label className="text-[9px] font-black text-slate-400 whitespace-nowrap">제목</label>
                        <input type="text" name="target" value={formData.target} onChange={handleChange}
                            placeholder="제품/프로젝트명" className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-bold focus:ring-1 focus:ring-indigo-500 outline-none" required />
                    </div>
                </div>

                {/* Google Doc Embed (Middle) */}
                <div className="flex-1 flex flex-col min-h-0" style={{ minHeight: 0 }}>
                    {docStatus === 'creating' && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                                    <FileText size={24} className="text-indigo-300" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
                                    <Loader size={12} className="text-indigo-500 animate-spin" />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-black text-slate-600">구글 드라이브에 회의록 생성 중...</p>
                                <p className="text-xs text-slate-400 mt-0.5">구글 계정 팝업이 나타나면 승인해 주세요.</p>
                            </div>
                        </div>
                    )}
                    {docStatus === 'error' && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
                                <AlertCircle size={24} className="text-rose-400" />
                            </div>
                            <p className="text-sm font-black text-rose-600">구글 문서 생성 실패</p>
                            <p className="text-xs text-slate-400 text-center max-w-xs">{docError}</p>
                            <button type="button"
                                onClick={() => createGoogleDoc(formData.target)}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all">
                                다시 시도
                            </button>
                        </div>
                    )}
                    {docStatus === 'ready' && formData.googleDocId && (
                        <iframe
                            src={`https://docs.google.com/document/d/${formData.googleDocId}/edit`}
                            className="w-full border-0"
                            style={{ flex: 1, minHeight: 0, height: '100%', display: 'block' }}
                            title="Meeting Minutes"
                            allow="clipboard-write; clipboard-read"
                        />
                    )}
                    {docStatus === 'ready' && !formData.googleDocId && formData.googleDocUrl && (
                        <iframe
                            src={formData.googleDocUrl.replace('/edit', '').replace('/view', '') + '/edit'}
                            className="w-full border-0"
                            style={{ flex: 1, minHeight: 0, height: '100%', display: 'block' }}
                            title="Meeting Minutes"
                            allow="clipboard-write; clipboard-read"
                        />
                    )}
                </div>

                {/* Bottom Footer: Single line containing Materials list + Action buttons */}
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 shrink-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">발표 자료 링크</span>
                        <button type="button" onClick={handleAddMaterial}
                            className="shrink-0 flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-all whitespace-nowrap">
                            <Plus size={9} /> 자료 추가
                        </button>
                        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                            {formData.materials.map((mat, index) => (
                                <div key={index} className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 shrink-0">
                                    <input type="text" placeholder="자료명" value={mat.name}
                                        onChange={(e) => handleMaterialChange(index, 'name', e.target.value)}
                                        className="w-16 text-[9px] font-bold outline-none bg-transparent" />
                                    <input type="url" placeholder="링크" value={mat.link}
                                        onChange={(e) => handleMaterialChange(index, 'link', e.target.value)}
                                        className="w-24 text-[9px] font-bold outline-none bg-transparent" />
                                    <button type="button" onClick={() => handleRemoveMaterial(index)}
                                        className="text-rose-300 hover:text-rose-500 transition-all">
                                        <Trash2 size={9} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {onCancel && (
                            <button type="button" onClick={onCancel}
                                className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                                취소
                            </button>
                        )}
                        <button type="submit" disabled={docStatus === 'creating'}
                            className="flex items-center gap-1 px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95">
                            <Save size={11} /> 저장
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
