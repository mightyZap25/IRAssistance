import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Microscope, Save, Plus, Trash2, 
    CheckCircle2, AlertTriangle, FileText, 
    ExternalLink, ClipboardList, Zap, Gauge
} from 'lucide-react';
import { db } from '../firebase';
import { 
    doc, getDoc, addDoc, collection, 
    serverTimestamp, writeBatch, query, where, getDocs 
} from 'firebase/firestore';

export default function DevTestRecordModal({ item, isOpen, onClose, onSave }) {
    const [loading, setLoading] = useState(false);
    const [testData, setTestData] = useState({
        testType: 'Performance', // Performance | Functional | Reliability
        tester: '',
        result: 'Pass', // Pass | Fail | Conditional
        sheetLink: '',
        results: [], // { name, value, isPass, note }
        remarks: ''
    });

    useEffect(() => {
        if (isOpen && item) {
            setTestData({
                testType: 'Performance',
                tester: '',
                result: 'Pass',
                sheetLink: '',
                results: [],
                remarks: ''
            });
        }
    }, [isOpen, item]);

    const handleAddItem = () => {
        setTestData(prev => ({
            ...prev,
            results: [...prev.results, { id: Date.now(), name: '', value: '', isPass: true, note: '' }]
        }));
    };

    const handleRemoveItem = (id) => {
        setTestData(prev => ({
            ...prev,
            results: prev.results.filter(r => r.id !== id)
        }));
    };

    const handleUpdateItem = (id, field, value) => {
        setTestData(prev => ({
            ...prev,
            results: prev.results.map(r => r.id === id ? { ...r, [field]: value } : r)
        }));
    };

    const handleSubmit = async () => {
        if (!testData.tester) return alert('테스터 성명을 입력해주세요.');
        
        setLoading(true);
        try {
            const payload = {
                refType: item.refType,
                refId: item.refId,
                partId: item.partId,
                partName: item.title,
                ...testData,
                completedAt: serverTimestamp()
            };

            await addDoc(collection(db, 'dev_test_records'), payload);
            
            // If it was a project test, we could potentially update project stage here
            
            alert('테스트 결과가 저장되었습니다.');
            onSave();
            onClose();
        } catch (err) {
            alert('저장 실패: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-600 rounded-2xl shadow-lg shadow-purple-100">
                            <Microscope className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">개발 성능 및 품질 테스트 기록</h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5">
                                [{item.refType}] {item.refId} | {item.title}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-white">
                    {/* Basic Info Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">테스트 유형</label>
                            <select 
                                value={testData.testType}
                                onChange={e => setTestData({...testData, testType: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black outline-none focus:ring-2 focus:ring-purple-500 transition-all shadow-sm"
                            >
                                <option value="Performance">성능 테스트 (Performance)</option>
                                <option value="Functional">기능 테스트 (Functional)</option>
                                <option value="Reliability">신뢰성 테스트 (Reliability)</option>
                                <option value="Compliance">인증/규격 (Compliance)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">테스터 성명</label>
                            <input 
                                type="text"
                                value={testData.tester}
                                onChange={e => setTestData({...testData, tester: e.target.value})}
                                placeholder="성함 입력"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black outline-none focus:ring-2 focus:ring-purple-500 transition-all shadow-sm"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">최종 테스트 판정</label>
                            <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-200 shadow-sm">
                                {['Pass', 'Fail'].map(res => (
                                    <button
                                        key={res}
                                        onClick={() => setTestData({...testData, result: res})}
                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${testData.result === res ? (res === 'Pass' ? 'bg-emerald-500 text-white shadow-md' : 'bg-rose-500 text-white shadow-md') : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {res === 'Pass' ? '합격' : '불합격'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Detailed Items Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="text-[11px] font-black text-slate-800 uppercase flex items-center gap-2">
                                <Gauge size={16} className="text-purple-600" /> 세부 측정 및 기능 검증 항목
                            </h4>
                            <button 
                                onClick={handleAddItem}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-xl text-[10px] font-black transition-all"
                            >
                                <Plus size={14} /> 항목 추가
                            </button>
                        </div>

                        {testData.results.length === 0 ? (
                            <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400">
                                <ClipboardList size={32} className="mb-2 opacity-20" />
                                <p className="text-xs font-bold">등록된 테스트 항목이 없습니다.</p>
                                <p className="text-[10px] mt-1 italic">상단의 '항목 추가'를 눌러 테스트를 시작하세요.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {testData.results.map((res, idx) => (
                                    <div key={res.id} className="flex gap-3 items-start animate-in slide-in-from-left-2" style={{ animationDelay: `${idx * 50}ms` }}>
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-slate-200 p-4 rounded-3xl shadow-sm hover:border-purple-200 transition-all group">
                                            <div className="md:col-span-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block ml-1">테스트 항목</label>
                                                <input 
                                                    type="text"
                                                    value={res.name}
                                                    onChange={e => handleUpdateItem(res.id, 'name', e.target.value)}
                                                    placeholder="예: 전압 변동율"
                                                    className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-transparent group-focus-within:border-purple-100"
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block ml-1">측정값/결과</label>
                                                <input 
                                                    type="text"
                                                    value={res.value}
                                                    onChange={e => handleUpdateItem(res.id, 'value', e.target.value)}
                                                    placeholder="측정 데이터"
                                                    className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-transparent group-focus-within:border-purple-100"
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block ml-1">판정</label>
                                                <select 
                                                    value={res.isPass}
                                                    onChange={e => handleUpdateItem(res.id, 'isPass', e.target.value === 'true')}
                                                    className="w-full bg-transparent text-[11px] font-bold outline-none"
                                                >
                                                    <option value="true">OK</option>
                                                    <option value="false">NG</option>
                                                </select>
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block ml-1">특이사항</label>
                                                <input 
                                                    type="text"
                                                    value={res.note}
                                                    onChange={e => handleUpdateItem(res.id, 'note', e.target.value)}
                                                    placeholder="메모"
                                                    className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-transparent group-focus-within:border-purple-100"
                                                />
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleRemoveItem(res.id)}
                                            className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all self-center"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Links & Remarks */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                        <div>
                            <label className="text-[11px] font-black text-slate-800 uppercase mb-3 flex items-center gap-2">
                                <ExternalLink size={14} className="text-blue-500" /> 구글 시트 성적서 연동
                            </label>
                            <input 
                                type="url"
                                value={testData.sheetLink}
                                onChange={e => setTestData({...testData, sheetLink: e.target.value})}
                                placeholder="https://docs.google.com/spreadsheets/..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                            />
                            <p className="text-[9px] text-slate-400 font-bold mt-2 ml-1">측정 데이터가 많거나 템플릿 사용 시 구글 시트 링크를 여기에 첨부하세요.</p>
                        </div>
                        <div>
                            <label className="text-[11px] font-black text-slate-800 uppercase mb-3 block">종합 의견 (Remarks)</label>
                            <textarea 
                                value={testData.remarks}
                                onChange={e => setTestData({...testData, remarks: e.target.value})}
                                placeholder="테스트 환경 및 종합 판정 배경을 입력하세요."
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all min-h-[100px] shadow-sm resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white border border-slate-200 text-slate-500 font-black text-xs rounded-2xl hover:bg-slate-50 transition-all"
                    >
                        취소
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-10 py-2.5 bg-slate-900 text-white font-black text-xs rounded-2xl shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? '저장 중...' : <><Save size={16} /> 테스트 완료 및 저장</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
