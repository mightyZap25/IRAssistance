import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const DEPARTMENTS = ['기획', '개발', '영업', 'QA', '생산', '인사/관리'];

export default function WeeklyMeetingModal({ isOpen, onClose, onSave, weekly = null }) {
    const [formData, setFormData] = useState({
        date: '',
        department: '',
        link: ''
    });

    useEffect(() => {
        if (weekly) {
            setFormData({
                ...weekly,
                date: weekly.date ? new Date(weekly.date).toISOString().slice(0, 10) : ''
            });
        } else {
            setFormData({
                date: new Date().toISOString().slice(0, 10),
                department: DEPARTMENTS[0],
                link: ''
            });
        }
    }, [weekly, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            date: new Date(formData.date)
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">주간 회의 자료 등록</h2>
                        <p className="text-xs text-slate-400 font-bold mt-1">부서별 주간 보고 Google Sheet 링크를 등록하세요.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"><X size={20}/></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">회의 일자</label>
                        <input 
                            type="date" 
                            name="date"
                            value={formData.date}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">담당 부서</label>
                        <select 
                            name="department"
                            value={formData.department}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            required
                        >
                            {DEPARTMENTS.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">Google Sheet 링크</label>
                        <input 
                            type="url" 
                            name="link"
                            value={formData.link}
                            onChange={handleChange}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            required
                        />
                    </div>
                </form>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-6 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-all">취소</button>
                    <button 
                        onClick={handleSubmit}
                        className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-200 transition-all"
                    >
                        <Save size={16}/> {weekly ? '수정 완료' : '등록하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
