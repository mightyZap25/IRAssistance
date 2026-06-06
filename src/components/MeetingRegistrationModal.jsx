import React, { useState, useEffect } from 'react';
import { X, Save, Link as LinkIcon, Plus, Trash2 } from 'lucide-react';

export default function MeetingRegistrationModal({ isOpen, onClose, onSave, meeting = null }) {
    const [formData, setFormData] = useState({
        dateTime: '',
        presenter: '',
        attendees: '',
        target: '',
        summary: '',
        materials: []
    });

    useEffect(() => {
        if (meeting) {
            setFormData({
                ...meeting,
                dateTime: meeting.dateTime ? new Date(meeting.dateTime).toISOString().slice(0, 16) : '',
                attendees: Array.isArray(meeting.attendees) ? meeting.attendees.join(', ') : meeting.attendees || '',
                materials: meeting.materials || []
            });
        } else {
            setFormData({
                dateTime: new Date().toISOString().slice(0, 16),
                presenter: '',
                attendees: '',
                target: '',
                summary: '',
                materials: []
            });
        }
    }, [meeting, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddMaterial = () => {
        setFormData(prev => ({
            ...prev,
            materials: [...prev.materials, { name: '', link: '' }]
        }));
    };

    const handleMaterialChange = (index, field, value) => {
        const newMaterials = [...formData.materials];
        newMaterials[index][field] = value;
        setFormData(prev => ({ ...prev, materials: newMaterials }));
    };

    const handleRemoveMaterial = (index) => {
        setFormData(prev => ({
            ...prev,
            materials: prev.materials.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const submissionData = {
            ...formData,
            dateTime: new Date(formData.dateTime),
            attendees: formData.attendees.split(',').map(s => s.trim()).filter(s => s !== '')
        };
        onSave(submissionData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">회의/리뷰 자료 등록</h2>
                        <p className="text-xs text-slate-400 font-bold mt-1">회의 내용을 정리하고 발표 자료 링크를 등록하세요.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"><X size={20}/></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">일시</label>
                            <input 
                                type="datetime-local" 
                                name="dateTime"
                                value={formData.dateTime}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">발표자</label>
                            <input 
                                type="text" 
                                name="presenter"
                                value={formData.presenter}
                                onChange={handleChange}
                                placeholder="발표자 이름"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">참석자 (쉼표로 구분)</label>
                        <input 
                            type="text" 
                            name="attendees"
                            value={formData.attendees}
                            onChange={handleChange}
                            placeholder="홍길동, 김철수, 이영희"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">대상 제품 모델 및 프로젝트 명</label>
                        <input 
                            type="text" 
                            name="target"
                            value={formData.target}
                            onChange={handleChange}
                            placeholder="예: IR-2024 / 스마트 팩토리 고도화"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">회의 내용 정리</label>
                        <textarea 
                            name="summary"
                            value={formData.summary}
                            onChange={handleChange}
                            rows={4}
                            placeholder="회의 주요 내용을 입력하세요."
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">발표 자료 (Google Links)</label>
                            <button 
                                type="button"
                                onClick={handleAddMaterial}
                                className="flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg transition-all"
                            >
                                <Plus size={12}/> 자료 추가
                            </button>
                        </div>
                        <div className="space-y-2">
                            {formData.materials.map((mat, index) => (
                                <div key={index} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200 animate-in slide-in-from-top-1">
                                    <div className="flex-1 grid grid-cols-2 gap-2">
                                        <input 
                                            type="text"
                                            placeholder="자료 명칭 (예: 발표 슬라이드)"
                                            value={mat.name}
                                            onChange={(e) => handleMaterialChange(index, 'name', e.target.value)}
                                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <input 
                                            type="url"
                                            placeholder="Google Drive/Sheet 링크"
                                            value={mat.link}
                                            onChange={(e) => handleMaterialChange(index, 'link', e.target.value)}
                                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => handleRemoveMaterial(index)}
                                        className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </form>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-6 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-all">취소</button>
                    <button 
                        onClick={handleSubmit}
                        className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-200 transition-all"
                    >
                        <Save size={16}/> {meeting ? '수정 완료' : '등록하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
