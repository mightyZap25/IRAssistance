import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, FileText, Loader, ExternalLink, AlertCircle, File } from 'lucide-react';
import { fetchDrive } from '../services/googleService';

const MEETING_FOLDER_ID = '1ri7Wac0KxC5ze9mLinX01xUTfzRzkrWL';

/**
 * 회의록 편집 패널 (인라인 - 모달 없음)
 * Props: meeting(null=신규), onSave, onCancel, onDocCreated
 */
export default function MeetingEditorPanel({ meeting = null, onSave, onCancel, onDocCreated, hideHeader = false }) {
    const [formData, setFormData] = useState({
        dateTime: '',
        presenter: '',
        attendees: '',
        target: '',
        googleDocUrl: '',
        googleDocId: '',
        materials: []
    });
    const [docStatus, setDocStatus] = useState('idle'); // 'idle' | 'selecting' | 'creating' | 'ready' | 'error'
    const [docError, setDocError] = useState('');
    const [selectedType, setSelectedType] = useState('doc');
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
                setDocStatus('selecting');
            }
        }
    }, [meeting]);

    const createGoogleDoc = async (title, type = 'doc') => {
        setSelectedType(type);
        setDocStatus('creating');
        setDocError('');
        try {
            const docTitle = title || `회의록_${new Date().toLocaleDateString('ko-KR')}`;
            
            // HTML 템플릿 정의 (Word)
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333;">
                    <h1 style="text-align: center; color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 30px;">회의록 (Meeting Minutes)</h1>
                    
                    <table border="1" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; margin-bottom: 30px;">
                        <tr>
                            <td style="width: 20%; background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">일시</td>
                            <td style="width: 30%;"></td>
                            <td style="width: 20%; background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">작성자</td>
                            <td style="width: 30%;"></td>
                        </tr>
                        <tr>
                            <td style="background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">참석자</td>
                            <td colspan="3"></td>
                        </tr>
                        <tr>
                            <td style="background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">회의 안건</td>
                            <td colspan="3"></td>
                        </tr>
                    </table>

                    <h3 style="color: #4f46e5; border-left: 4px solid #4f46e5; padding-left: 10px;">1. 주요 논의 사항 (Discussion Points)</h3>
                    <ul style="margin-bottom: 30px; line-height: 1.6;">
                        <li></li>
                    </ul>

                    <h3 style="color: #4f46e5; border-left: 4px solid #4f46e5; padding-left: 10px;">2. 결정 사항 (Decisions)</h3>
                    <ul style="margin-bottom: 30px; line-height: 1.6;">
                        <li></li>
                    </ul>

                    <h3 style="color: #4f46e5; border-left: 4px solid #4f46e5; padding-left: 10px;">3. 향후 계획 (Action Items)</h3>
                    <table border="1" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #d1d5db;">
                        <tr>
                            <td style="background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">담당자 (Assignee)</td>
                            <td style="background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">업무 내용 (Task)</td>
                            <td style="background-color: #f3f4f6; font-weight: bold; text-align: center; color: #4b5563;">기한 (Due Date)</td>
                        </tr>
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                    </table>
                </div>
            `;

            // CSV 템플릿 정의 (Sheet)
            const csvContent = "\uFEFF회의록 (Meeting Minutes)\n\n일시,,작성자,\n참석자,,,\n회의 안건,,,\n\n1. 주요 논의 사항\n내용,,,\n\n2. 결정 사항\n내용,,,\n\n3. 향후 계획 (Action Items)\n담당자 (Assignee),업무 내용 (Task),기한 (Due Date)\n,,\n,,\n";

            const mimeType = type === 'sheet' ? 'application/vnd.google-apps.spreadsheet' : 'application/vnd.google-apps.document';
            const fileBlob = type === 'sheet' ? new Blob([csvContent], { type: 'text/csv' }) : new Blob([htmlContent], { type: 'text/html' });

            // multipart/related 형태의 업로드용 폼 생성
            const metadata = {
                name: docTitle,
                mimeType: mimeType,
                parents: [MEETING_FOLDER_ID]
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', fileBlob);

            const file = await fetchDrive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                body: form
                // headers: 'Content-Type'은 브라우저가 FormData 처리 시 자동으로 boundary와 함께 설정하므로 생략해야 함.
            });

            const docId = file.id;
            const baseUrl = type === 'sheet' ? 'https://docs.google.com/spreadsheets/d/' : 'https://docs.google.com/document/d/';
            const editUrl = `${baseUrl}${docId}/edit`;

            setFormData(prev => ({
                ...prev,
                googleDocUrl: editUrl,
                googleDocId: docId,
                docType: type
            }));
            setDocStatus('ready');
            if (onDocCreated) {
                onDocCreated();
            }
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
        <div className="flex-1 h-full flex gap-3 overflow-hidden">
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm">
                {/* Google Doc Embed (Middle) */}
                <div className="flex-1 flex flex-col min-h-0 relative" style={{ minHeight: 0 }}>
                    {/* Header overlay just to show status if needed, or we can just remove it */}
                    {docStatus === 'creating' && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm text-slate-400">
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
                    {docStatus === 'selecting' && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-slate-50">
                            <div className="text-center mb-2">
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">문서 형식 선택</h2>
                                <p className="text-sm font-bold text-slate-500 mt-1">회의록을 작성할 구글 문서 형식을 선택해 주세요.</p>
                            </div>
                            <div className="flex gap-4">
                                <button type="button" onClick={() => createGoogleDoc(formData.target, 'doc')}
                                    className="w-40 h-40 bg-white border-2 border-indigo-100 rounded-2xl hover:border-indigo-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-4 group">
                                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <FileText size={32} className="text-indigo-600" />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-black text-slate-700 text-sm">Google Docs</div>
                                        <div className="text-xs font-bold text-slate-400">워드 형식</div>
                                    </div>
                                </button>
                                <button type="button" onClick={() => createGoogleDoc(formData.target, 'sheet')}
                                    className="w-40 h-40 bg-white border-2 border-emerald-100 rounded-2xl hover:border-emerald-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-4 group">
                                    <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <File size={32} className="text-emerald-600" />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-black text-slate-700 text-sm">Google Sheets</div>
                                        <div className="text-xs font-bold text-slate-400">엑셀 형식</div>
                                    </div>
                                </button>
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
                                onClick={() => createGoogleDoc(formData.target, selectedType)}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all">
                                다시 시도
                            </button>
                        </div>
                    )}
                    {docStatus === 'ready' && formData.googleDocId && (
                        <iframe
                            src={formData.googleDocUrl}
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
                                className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all">
                                닫기
                            </button>
                        )}
                        <button type="submit" disabled={docStatus === 'creating'}
                            className="flex items-center gap-1 px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-[10px] font-black shadow-sm transition-all active:scale-95">
                            <Save size={11} /> 저장
                        </button>
                    </div>
                </div>
            </form>

            {/* Right side floating toolbar */}
            <div className="w-12 shrink-0 flex flex-col items-center gap-3 pt-2">
                {formData.googleDocUrl && (
                    <a href={formData.googleDocUrl} target="_blank" rel="noopener noreferrer"
                        className="w-10 h-10 flex flex-col items-center justify-center gap-1 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl shadow-sm transition-all"
                        title="새 탭에서 열기">
                        <ExternalLink size={16} />
                        <span className="text-[8px] font-black">새 탭</span>
                    </a>
                )}
            </div>
        </div>
    );
}
