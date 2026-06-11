import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, doc, setDoc, deleteDoc, orderBy, where } from '../firebase';
import { db } from '../firebase';
import { X, ShieldAlert, Package, Plus, Trash2, Info, Settings, Save, Factory, CheckCircle2 } from 'lucide-react';

const RiskInventorySettingModal = ({ isOpen, onClose, onRefresh }) => {
    const [parts, setParts] = useState([]);
    const [fgSettings, setFgSettings] = useState([]); // [{id, PartID, Threshold}]
    const [partSettings, setPartSettings] = useState([]); // [{id, PartID, Threshold}]
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [partsSnap, settingsSnap] = await Promise.all([
                getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc'))),
                getDocs(collection(db, 'inventory_settings'))
            ]);

            setParts(partsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            
            const settings = settingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setFgSettings(settings.filter(s => s.Type === 'FG'));
            setPartSettings(settings.filter(s => s.Type === 'PART'));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleAddSetting = (type) => {
        const newItem = { id: `TEMP-${Date.now()}`, PartID: '', Threshold: 0, Type: type, isNew: true };
        if (type === 'FG') setFgSettings([...fgSettings, newItem]);
        else setPartSettings([...partSettings, newItem]);
    };

    const handleRemoveSetting = async (id, type) => {
        if (id.startsWith('TEMP-')) {
            if (type === 'FG') setFgSettings(fgSettings.filter(s => s.id !== id));
            else setPartSettings(partSettings.filter(s => s.id !== id));
            return;
        }

        if (!window.confirm('이 설정값을 삭제하시겠습니까?')) return;
        try {
            await deleteDoc(doc(db, 'inventory_settings', id));
            fetchData();
        } catch (err) { console.error(err); }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const allSettings = [...fgSettings, ...partSettings];
            for (const s of allSettings) {
                if (!s.PartID) continue;
                const docId = s.isNew ? `${s.Type}-${s.PartID}` : s.id;
                await setDoc(doc(db, 'inventory_settings', docId), {
                    PartID: s.PartID,
                    Threshold: Number(s.Threshold),
                    Type: s.Type,
                    UpdatedAt: new Date().toISOString()
                });
            }
            alert('위험재고 설정이 저장되었습니다.');
            onRefresh();
            onClose();
        } catch (err) { console.error(err); alert('저장 중 오류 발생'); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] w-full max-w-5xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden text-left">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-rose-50/30 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <ShieldAlert size={28} className="text-rose-500" />
                            전사 위험재고(안전재고) 기준 설정
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Risk Inventory Threshold Settings</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                    <div className="grid grid-cols-2 gap-12">
                        
                        {/* Left: Finished Goods Based */}
                        <div className="space-y-6">
                            <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4">
                                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                    <Factory size={18} className="text-indigo-500"/> 완제품 생산 대응 기준
                                </h3>
                                <button onClick={() => handleAddSetting('FG')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-100 transition-all">
                                    <Plus size={14}/> 추가
                                </button>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed">
                                설정된 수량만큼의 완제품을 **언제든 단독 생산**할 수 있도록 하위 모든 부품의 안전재고를 자동 계산합니다.
                            </p>
                            <div className="space-y-3">
                                {fgSettings.map((s, idx) => (
                                    <div key={s.id} className="flex gap-3 items-center animate-in slide-in-from-left-2">
                                        <select 
                                            value={s.PartID} 
                                            onChange={e => setFgSettings(fgSettings.map(x => x.id === s.id ? {...x, PartID: e.target.value} : x))}
                                            className="flex-[3] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">완제품 선택...</option>
                                            {parts.filter(p => p.Class === 'ASSY').map(p => <option key={p.id} value={p.PartID}>[{p.PartID}] {p.Name}</option>)}
                                        </select>
                                        <div className="flex-[1.5] relative">
                                            <input 
                                                type="number" 
                                                value={s.Threshold} 
                                                onChange={e => setFgSettings(fgSettings.map(x => x.id === s.id ? {...x, Threshold: e.target.value} : x))}
                                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none text-right pr-10"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">대</span>
                                        </div>
                                        <button onClick={() => handleRemoveSetting(s.id, 'FG')} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Individual Parts Based */}
                        <div className="space-y-6 border-l border-slate-100 pl-12">
                            <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4">
                                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                    <Package size={18} className="text-emerald-500"/> 주요 부품 상시 유지 기준
                                </h3>
                                <button onClick={() => handleAddSetting('PART')} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black hover:bg-emerald-100 transition-all">
                                    <Plus size={14}/> 추가
                                </button>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed">
                                완제품 소요량과 관계없이 **최소한으로 유지해야 할** 특정 부품의 수동 임계치입니다.
                            </p>
                            <div className="space-y-3">
                                {partSettings.map((s, idx) => (
                                    <div key={s.id} className="flex gap-3 items-center animate-in slide-in-from-right-2">
                                        <select 
                                            value={s.PartID} 
                                            onChange={e => setPartSettings(partSettings.map(x => x.id === s.id ? {...x, PartID: e.target.value} : x))}
                                            className="flex-[3] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500"
                                        >
                                            <option value="">부품 선택...</option>
                                            {parts.filter(p => p.Class !== 'ASSY').map(p => <option key={p.id} value={p.PartID}>[{p.PartID}] {p.Name}</option>)}
                                        </select>
                                        <div className="flex-[1.5] relative">
                                            <input 
                                                type="number" 
                                                value={s.Threshold} 
                                                onChange={e => setPartSettings(partSettings.map(x => x.id === s.id ? {...x, Threshold: e.target.value} : x))}
                                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none text-right pr-10"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">EA</span>
                                        </div>
                                        <button onClick={() => handleRemoveSetting(s.id, 'PART')} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 bg-amber-50 rounded-3xl p-6 border border-amber-100 flex gap-4">
                        <Info size={24} className="text-amber-500 shrink-0"/>
                        <div>
                            <p className="text-sm font-black text-amber-800">재고 소진 순서 및 중복 계산 정책</p>
                            <ul className="text-xs font-bold text-amber-700 space-y-1.5 mt-2 list-disc ml-4 leading-relaxed">
                                <li>안전재고 계산 시 **반제품(Semi-finished) 재고를 우선 차감**한 후 부족분에 대해서만 하위 부품을 전개합니다.</li>
                                <li>동일 부품이 여러 완제품에 중복 사용될 경우, **단일 제품 생산을 위한 최대 요구량**을 최종 안전재고 기준으로 삼습니다.</li>
                                <li>가용 재고(현재고 - 예약재고)가 이 안전재고 기준에 미달할 경우 대시보드에 위험 경고가 표시됩니다.</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                    <button onClick={handleSave} disabled={loading} className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-rose-600 hover:bg-rose-700 shadow-xl shadow-rose-100 flex items-center gap-3 transition-all disabled:opacity-50">
                        {loading ? '저장 중...' : <><Save size={18}/> 설정값 영구 저장</>}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default RiskInventorySettingModal;
