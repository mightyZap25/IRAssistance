import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where, onSnapshot } from '../firebase';
import { db } from '../firebase';
import { ShoppingCart, Plus, X, AlertCircle, Trash2, Info, Calendar, Search, Package, Factory, TrendingDown, ClipboardList, Send, Mail, Building2, User, Phone } from 'lucide-react';
import { productionService } from '../services/productionService';
import { useAuth } from '../contexts/AuthContext';

const CreatePOModal = ({ isOpen, onClose, onSave, initialData }) => {
    const { userProfile } = useAuth();
    const [vendors, setVendors] = useState([]);
    const [parts, setParts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [prs, setPrs] = useState([]);
    const [boms, setBoms] = useState([]);
    const [settings, setSettings] = useState([]);
    const [ecnNotes, setEcnNotes] = useState({});
    const [loading, setLoading] = useState(false);

    // 견적 요청(RFQ) 단계 상태
    const [showEmailStep, setShowEmailStep] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    
    // 완제품 생산 소요량 산출을 위한 상태
    const [targetFG, setTargetFG] = useState({ id: '', qty: 1 });
    
    // 스마트 소요량 필터 및 선택 상태
    const [filterShortage, setFilterShortage] = useState(true);
    const [filterRisk, setFilterRisk] = useState(true);
    const [selectedSmartParts, setSelectedSmartParts] = useState({}); // { PartID: true/false }

    const [formData, setFormData] = useState({
        VendorID: '',
        VendorName: '',
        Items: [],
        DueDate: '',
        Urgent: false,
        HideRevisionInEmail: false,
        Type: 'PURCHASE', // 'PURCHASE' or 'OUTSOURCING'
        Status: 'DRAFT'
    });

    const [editingSplitId, setEditingSplitId] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setEditingSplitId(null);
            setSelectedSmartParts({});
            fetchDependencies();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData({
                ...initialData,
                Items: initialData.Items || [],
                HideRevisionInEmail: initialData.HideRevisionInEmail || false
            });
        } else if (isOpen) {
            setFormData({
                VendorID: '', VendorName: '', 
                Items: [createEmptyItem()], 
                DueDate: '', Urgent: false, HideRevisionInEmail: false,
                Type: 'PURCHASE', Status: 'DRAFT'
            });
        }
    }, [isOpen, initialData]);

    const fetchDependencies = async () => {
        setLoading(true);
        try {
            const [vSnap, pSnap, eSnap, invSnap, prsSnap, bomSnap, setSnap] = await Promise.all([
                getDocs(query(collection(db, 'vendors'), orderBy('Name', 'asc'))),
                getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc'))),
                getDocs(collection(db, 'ecns')),
                getDocs(collection(db, 'inventory')),
                getDocs(query(collection(db, 'production_requests'), where('Status', 'in', [
                    'CONFIRMED', 'WAITING_FOR_PARTS', 'PROD_WAITING', 
                    'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 
                    'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'
                ]))),
                getDocs(collection(db, 'bom')),
                getDocs(collection(db, 'inventory_settings'))
            ]);
            
            setVendors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setPrs(prsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setBoms(bomSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setSettings(setSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            const notes = {};
            eSnap.forEach(d => {
                const data = d.data();
                if (data.PartID) notes[data.PartID] = data.Reason;
            });
            setEcnNotes(notes);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const createEmptyItem = () => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        BasePartID: '',
        PartID: '',
        PartName: '',
        Qty: 1,
        UnitPrice: 0,
        ReceivedQty: 0,
        Schedules: [{ id: Date.now(), date: formData.DueDate || '', qty: 1 }]
    });

    // BOM Map
    const bomMap = useMemo(() => {
        const bm = {};
        boms.forEach(b => {
            if (!bm[b.ParentID]) bm[b.ParentID] = [];
            bm[b.ParentID].push(b);
        });
        return bm;
    }, [boms]);

    // 예약 및 부족 재고 실시간 계산 (가상 OnHand, Shortage 계산용)
    const reservationResults = useMemo(() => {
        const reserved = {};
        const shortage = {};
        const required = {};
        const virtualInv = {};
        const shortageSources = {}; // { ChildPartID: [{ PRNumber, PRID, ParentPartID, ParentPartName, DueDate, NeededQty }] }
        
        inventory.forEach(i => {
            virtualInv[(i.PartID || '').trim().toUpperCase()] = Number(i.OnHand || 0);
        });
        
        const processRequirement = (parentID, qty, sourceInfo) => {
            const pid = (parentID || '').trim().toUpperCase();
            if (qty <= 0 || !pid) return;

            required[pid] = (required[pid] || 0) + qty;

            const availableInInv = Number(virtualInv[pid] || 0);
            const takenFromInv = Math.min(availableInInv, qty);
            
            if (takenFromInv > 0) {
                virtualInv[pid] -= takenFromInv;
                reserved[pid] = (reserved[pid] || 0) + takenFromInv;
            }
            
            const remainingToProduce = qty - takenFromInv;
            if (remainingToProduce > 0) {
                shortage[pid] = (shortage[pid] || 0) + remainingToProduce;
                
                // 부족분 소스 기록 (원자재/부품 레벨에서만 기록하거나 모든 레벨에서 기록 가능)
                if (!shortageSources[pid]) shortageSources[pid] = [];
                // 중복 방지 (동일 PR에 의한 요청인 경우 합산하거나 유지)
                const existingSource = shortageSources[pid].find(s => s.PRID === sourceInfo.PRID && s.TopPartID === sourceInfo.TopPartID);
                if (existingSource) {
                    existingSource.ShortQty += remainingToProduce;
                } else {
                    shortageSources[pid].push({
                        PRNumber: sourceInfo.PRNumber,
                        PRID: sourceInfo.PRID,
                        TopPartID: sourceInfo.TopPartID,
                        TopPartName: sourceInfo.TopPartName,
                        DueDate: sourceInfo.DueDate,
                        ShortQty: remainingToProduce
                    });
                }
                
                const children = bomMap[pid] || [];
                children.forEach(child => {
                    const childID = (child.ChildID || '').trim().toUpperCase();
                    const unitQty = Number(child.Quantity || child.qty || 1);
                    const totalChildNeeded = unitQty * remainingToProduce;
                    processRequirement(childID, totalChildNeeded, sourceInfo);
                });
            }
        };

        prs.forEach(pr => {
            const items = pr.Items || [{ PartID: pr.PartID, PartName: pr.PartName, TargetQty: pr.TargetQty, DueDate: pr.DueDate }];
            items.forEach(item => {
                processRequirement(item.PartID, Number(item.TargetQty || item.Qty || 0), {
                    PRNumber: pr.PRNumber,
                    PRID: pr.id,
                    TopPartID: item.PartID,
                    TopPartName: item.PartName,
                    DueDate: item.DueDate || pr.DueDate
                });
            });
        });

        return { reservedMap: reserved, shortageMap: shortage, requiredMap: required, shortageSources };
    }, [prs, bomMap, inventory]);

    // 안전재고 계산
    const safetyMap = useMemo(() => {
        const fgSettings = settings.filter(s => s.Type === 'FG');
        const partSettings = {};
        settings.filter(s => s.Type === 'PART').forEach(s => { partSettings[s.PartID] = s.Threshold; });

        const dynamicSafetyMap = { ...partSettings };
        const calculateRecursive = (id, targetQty) => {
            const children = bomMap[id] || [];
            children.forEach(child => {
                const childID = child.ChildID;
                const needed = (child.Quantity || 1) * targetQty;
                dynamicSafetyMap[childID] = Math.max(dynamicSafetyMap[childID] || 0, needed);
                calculateRecursive(childID, needed);
            });
        };

        fgSettings.forEach(fg => calculateRecursive(fg.PartID, fg.Threshold));
        return dynamicSafetyMap;
    }, [settings, bomMap]);

    // 공급사별 부품 필터링: 선택된 Vendor가 취급하는 부품만 노출
    const filteredPartsByVendor = useMemo(() => {
        if (!formData.VendorID) return [];
        const vendor = vendors.find(v => v.id === formData.VendorID);
        const vName = vendor?.Name || '';
        const vId = formData.VendorID;
        
        return parts.filter(p => {
            return (p.Maker === vId || p.Manufacturer === vId || p.VendorID === vId ||
                    (vName && (p.Maker === vName || p.Manufacturer === vName || p.VendorID === vName)));
        });
    }, [parts, formData.VendorID, vendors]);

    // 스마트 소요량 산출 리스트 (필터 적용)
    const smartNeedsList = useMemo(() => {
        if (!formData.VendorID) return [];

        const list = [];
        filteredPartsByVendor.forEach(p => {
            const pid = (p.PartID || '').trim().toUpperCase();
            const invRecord = inventory.find(i => (i.PartID || '').trim().toUpperCase() === pid);
            const onHand = Number(invRecord?.OnHand || 0);
            const reserved = Number(reservationResults.reservedMap[pid] || 0);
            const shortageVal = Number(reservationResults.shortageMap[pid] || 0);
            const safety = Number(safetyMap[pid] || p.SafetyStock || 0);
            
            // 부족 예약 재고 조건: 부족이 있거나 (shortage > 0)
            const isShortage = shortageVal > 0;
            // 위험 재고 조건: 가용 재고(OnHand - Reserved) < 안전 재고
            const available = Math.max(0, onHand - reserved);
            const isRisk = available < safety;

            let matches = false;
            if (filterShortage && isShortage) matches = true;
            if (filterRisk && isRisk) matches = true;

            if (matches) {
                // 권장 발주량 계산: 부족분이 있으면 부족분, 위험재고면 안전재고 - 가용재고
                let suggestQty = 0;
                if (isShortage) {
                    suggestQty = shortageVal;
                } else if (isRisk) {
                    suggestQty = safety - available;
                }
                
                list.push({
                    PartID: p.PartID,
                    PartName: p.Name,
                    OnHand: onHand,
                    Reserved: reserved,
                    Shortage: shortageVal,
                    Available: available,
                    Safety: safety,
                    UnitPrice: p.UnitPrice || 0,
                    SuggestQty: Math.max(1, suggestQty)
                });
            }
        });
        return list;
    }, [filteredPartsByVendor, inventory, reservationResults, safetyMap, filterShortage, filterRisk]);

    // 일괄 체크 여부
    const isAllChecked = useMemo(() => {
        if (smartNeedsList.length === 0) return false;
        return smartNeedsList.every(item => selectedSmartParts[item.PartID]);
    }, [smartNeedsList, selectedSmartParts]);

    const handleAllCheckToggle = () => {
        if (isAllChecked) {
            const updated = { ...selectedSmartParts };
            smartNeedsList.forEach(item => {
                updated[item.PartID] = false;
            });
            setSelectedSmartParts(updated);
        } else {
            const updated = { ...selectedSmartParts };
            smartNeedsList.forEach(item => {
                updated[item.PartID] = true;
            });
            setSelectedSmartParts(updated);
        }
    };

    const handleSmartPartCheckToggle = (partID) => {
        setSelectedSmartParts(prev => ({
            ...prev,
            [partID]: !prev[partID]
        }));
    };

    // 체크된 스마트 소요량 품목 일괄 추가
    const handleImportSelectedSmartNeeds = () => {
        const checkedItems = smartNeedsList.filter(item => selectedSmartParts[item.PartID]);
        if (checkedItems.length === 0) return alert('선택된 품목이 없습니다.');

        const newItems = checkedItems.map(s => ({
            ...createEmptyItem(),
            PartID: s.PartID,
            PartName: s.PartName,
            BasePartID: s.PartID.split('-')[0],
            Qty: s.SuggestQty,
            UnitPrice: s.UnitPrice
        }));

        setFormData(prev => ({ 
            ...prev, 
            Items: [...prev.Items.filter(i => i.PartID !== ''), ...newItems] 
        }));
        alert(`${checkedItems.length}개의 품목이 추가되었습니다.`);
    };

    const handleVendorChange = (e) => {
        const v = vendors.find(x => x.id === e.target.value);
        setFormData(prev => ({ ...prev, VendorID: v?.id || '', VendorName: v?.Name || '', Items: [createEmptyItem()] }));
        setSelectedSmartParts({});
    };

    const updateItem = (itemId, field, value) => {
        setFormData(prev => ({
            ...prev,
            Items: prev.Items.map(item => {
                if (item.id !== itemId) return item;
                const updated = { ...item, [field]: value };
                if (field === 'PartID') {
                    const selected = parts.find(p => p.id === value || p.PartID === value);
                    if (selected) {
                        // 중요: item.PartID 에는 실제 부품 번호(예: PART-001)를 저장
                        updated.PartID = selected.PartID;
                        updated.PartName = selected.Name;
                        updated.UnitPrice = selected.UnitPrice || 0;
                    }
                }
                return updated;
            })
        }));
    };

    const handleShowRFQStep = () => {
        if (!formData.VendorID) return alert('공급업체를 선택해주세요.');
        if (formData.Items.filter(i => i.PartID).length === 0) return alert('발주할 품목을 1개 이상 추가해주세요.');

        // 공급업체 이메일 연동
        const selectedVendor = vendors.find(v => v.id === formData.VendorID);
        if (selectedVendor?.Email) {
            setEmailRecipients([selectedVendor.Email]);
        } else {
            setEmailRecipients([]);
        }

        // 이메일 본문 생성 (단가/금액 제외)
        const itemRows = formData.Items.filter(i => i.PartID).map((item, idx) => {
            return `${idx + 1}. ${item.PartName} (${item.PartID})
   - 수량: ${item.Qty.toLocaleString()} EA`;
        }).join('\n\n');

        setEmailSubject(`[견적 요청] ${formData.VendorName} 귀하 - ${new Date().toISOString().slice(0,10)}`);
        setEmailBody(
`${formData.VendorName} 귀하,

안녕하세요. IR Assistant (주)입니다.
아래 품목에 대한 견적 확인을 요청드리오니 검토 후 회신 부탁드립니다.

[요청 내역]
${itemRows}

--------------------------------------
■ 납기 희망일: ${formData.DueDate || '협의'}
■ 비고: ${formData.Urgent ? '긴급 요청 건입니다.' : '없음'}
--------------------------------------

위 품목들에 대해 공급 가능 여부와 최적의 단가 및 납기를 회신해 주시면 감사하겠습니다.
내용 확인 후 회신 부탁드립니다.
감사합니다.`
        );
        setShowEmailStep(true);
    };

    const handleSendRFQAndSave = async () => {
        if (emailRecipients.length === 0) return alert('받는 사람 이메일을 입력해주세요.');
        
        setLoading(true);
        try {
            // 부족분 소스 정보 추출
            const finalShortageSources = {};
            formData.Items.forEach(item => {
                const pid = (item.PartID || '').trim().toUpperCase();
                if (reservationResults.shortageSources[pid]) {
                    finalShortageSources[pid] = reservationResults.shortageSources[pid];
                }
            });

            // 여기에 실제 이메일 발송 로직이 들어갈 수 있음 (현재는 mailto 또는 연동 서비스 가정)
            await onSave({ 
                ...formData, 
                ShortageSources: finalShortageSources,
                Status: 'RFQ_SENT', // 사용자 요구에 맞춰 '견적 요청' 상태로 저장
                RFQ_Recipients: emailRecipients,
                RFQ_Subject: emailSubject,
                RFQ_Body: emailBody
            });
            onClose();
        } catch (error) {
            console.error(error);
            alert('저장 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!formData.VendorID) return alert('공급업체를 선택해주세요.');
        if (formData.Items.filter(i => i.PartID).length === 0) return alert('발주할 품목을 1개 이상 추가해주세요.');
        
        setLoading(true);
        try {
            // 부족분 소스 정보 추출
            const finalShortageSources = {};
            formData.Items.forEach(item => {
                const pid = (item.PartID || '').trim().toUpperCase();
                if (reservationResults.shortageSources[pid]) {
                    finalShortageSources[pid] = reservationResults.shortageSources[pid];
                }
            });

            await onSave({ ...formData, Status: 'DRAFT', ShortageSources: finalShortageSources });
            onClose();
        } catch (error) { console.error(error); alert('저장 실패'); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    const totalPrice = formData.Items.reduce((acc, item) => acc + (item.Qty * (item.UnitPrice || 0)), 0);

    const mainContent = (
        <div className="bg-white rounded-2xl w-full max-w-7xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <ShoppingCart size={22} className="text-indigo-600" />
                        {initialData ? '발주 요청서 수정' : '신규 발주 요청 및 견적 요청'}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">Purchasing & RFQ Management</p>
                </div>
                <button onClick={onClose} className="p-2 bg-white rounded-xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={16} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {showEmailStep ? (
                    /* RFQ Email Step UI (Similar to ProductionRequestsPage) */
                    <div className="grid grid-cols-1 md:grid-cols-2 h-full min-h-[500px]">
                        {/* Left: Preview */}
                        <div className="bg-slate-50 p-6 border-r border-slate-200 overflow-y-auto">
                            <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-8 space-y-8 min-h-[700px] flex flex-col">
                                {/* Document Header */}
                                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-1">견적 요청서</h3>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Request for Quotation</p>
                                    </div>
                                    <div className="text-right">
                                        <h4 className="text-lg font-black text-slate-900">(주) 아이알로봇</h4>
                                        <p className="text-[10px] font-bold text-slate-500 mt-1">경기도 부천시 원미구 평천로 655</p>
                                        <p className="text-[10px] font-bold text-slate-500">부천테크노파크 401동 402호</p>
                                        <p className="text-[10px] font-bold text-slate-500">TEL: 032-326-0607</p>
                                    </div>
                                </div>

                                {/* Requester & Vendor Info Grid */}
                                <div className="grid grid-cols-2 gap-8 text-[11px]">
                                    <div className="space-y-3">
                                        <h5 className="font-black text-indigo-600 uppercase tracking-wider border-b border-indigo-100 pb-1 flex items-center gap-1.5">
                                            <Building2 size={12}/> 요청처 (Requester)
                                        </h5>
                                        <div className="grid grid-cols-[70px_1fr] gap-y-1.5">
                                            <span className="text-slate-400 font-bold">요청 부서</span>
                                            <span className="text-slate-900 font-black">{userProfile?.department || '생산 관리팀'}</span>
                                            <span className="text-slate-400 font-bold">담 당 자</span>
                                            <span className="text-slate-900 font-black">{userProfile?.displayName || '담당자'}</span>
                                            <span className="text-slate-400 font-bold">연 락 처</span>
                                            <span className="text-slate-900 font-black">{userProfile?.email || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <h5 className="font-black text-rose-600 uppercase tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                                            <Factory size={12}/> 수신처 (To)
                                        </h5>
                                        <div className="grid grid-cols-[70px_1fr] gap-y-1.5">
                                            <span className="text-slate-400 font-bold">업 체 명</span>
                                            <span className="text-slate-900 font-black">{formData.VendorName}</span>
                                            <span className="text-slate-400 font-bold">참 조</span>
                                            <span className="text-slate-900 font-black"></span>
                                            <span className="text-slate-400 font-bold">요청 일자</span>
                                            <span className="text-slate-900 font-black">{new Date().toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="flex-1">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900 text-white">
                                                <th className="py-2.5 px-4 text-[10px] font-black uppercase tracking-widest rounded-tl-lg">No</th>
                                                <th className="py-2.5 px-2 text-[10px] font-black uppercase tracking-widest">품목명 / 규격 (Description)</th>
                                                <th className="py-2.5 px-4 text-[10px] font-black uppercase tracking-widest text-right rounded-tr-lg">수량 (Qty)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 border-x border-b border-slate-200">
                                            {formData.Items.filter(i => i.PartID).map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50">
                                                    <td className="py-4 px-4 text-[11px] font-mono text-slate-400 font-bold w-12">{idx + 1}</td>
                                                    <td className="py-4 px-2">
                                                        <p className="text-xs font-black text-slate-900 mb-0.5">{item.PartName}</p>
                                                        <p className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">{item.PartID}</p>
                                                    </td>
                                                    <td className="py-4 px-4 text-right">
                                                        <span className="text-sm font-black text-slate-900">{item.Qty.toLocaleString()}</span>
                                                        <span className="text-[10px] text-slate-400 ml-1 font-bold">EA</span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Fill empty space */}
                                            {Array.from({ length: Math.max(0, 5 - formData.Items.filter(i => i.PartID).length) }).map((_, i) => (
                                                <tr key={`empty-${i}`}>
                                                    <td className="py-6 px-4" colSpan="3"></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer Summary */}
                                <div className="pt-6 border-t-2 border-slate-900 flex flex-col gap-4">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2">특이 사항 및 요청 (Remarks)</p>
                                        <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">
                                            * 위 품목에 대하여 최적의 견적과 단기 납기를 검토 부탁드립니다.<br/>
                                            * 납기 희망일: <span className="text-slate-900 font-black not-italic underline decoration-indigo-300 underline-offset-4">{formData.DueDate || '협의'}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase">전체 품목 수: {formData.Items.filter(i => i.PartID).length} 건</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Email Composition */}
                        <div className="p-5 flex flex-col space-y-4 overflow-y-auto">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                                    <Mail size={18} className="text-indigo-500"/> 이메일 작성
                                </h3>
                                <button onClick={() => setShowEmailStep(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-tight">← 이전 단계로</button>
                            </div>

                            <div className="space-y-3 flex-1 flex flex-col min-h-0">
                                {/* 받는 사람 - 한 줄로 컴팩트하게 */}
                                <div className="flex items-center gap-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase w-16 shrink-0">받는 사람</label>
                                    <div className="flex-1 bg-white border border-slate-200 rounded-xl p-1.5 min-h-[36px] flex flex-wrap gap-1.5 focus-within:border-indigo-400 transition-all">
                                        {emailRecipients.map((r, i) => (
                                            <span key={i} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-md">
                                                {r}
                                                <button onClick={() => setEmailRecipients(prev => prev.filter((_, idx) => idx !== i))} className="text-indigo-300 hover:text-indigo-600"><X size={10}/></button>
                                            </span>
                                        ))}
                                        <input 
                                            type="email" 
                                            placeholder="이메일 입력..."
                                            value={emailInput}
                                            onChange={e => setEmailInput(e.target.value)}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) {
                                                    e.preventDefault();
                                                    setEmailRecipients(prev => [...prev, emailInput.trim()]);
                                                    setEmailInput('');
                                                }
                                            }}
                                            className="flex-1 min-w-[100px] outline-none text-[11px] font-bold text-slate-700 bg-transparent"
                                        />
                                    </div>
                                </div>

                                {/* 제목 - 한 줄로 컴팩트하게 */}
                                <div className="flex items-center gap-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase w-16 shrink-0">메일 제목</label>
                                    <input 
                                        type="text" 
                                        value={emailSubject}
                                        onChange={e => setEmailSubject(e.target.value)}
                                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
                                    />
                                </div>

                                {/* 본문 - 최대한 확장 */}
                                <div className="flex-1 flex flex-col min-h-0 pt-1">
                                    <textarea 
                                        value={emailBody}
                                        onChange={e => setEmailBody(e.target.value)}
                                        placeholder="본문 내용을 입력하세요..."
                                        className="w-full flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-400 transition-all resize-none leading-relaxed shadow-inner"
                                    />
                                </div>
                            </div>

                            {/* 버튼 - 한 줄로 나란히 배치 */}
                            <div className="flex gap-2 pt-2 border-t border-slate-100">
                                <button 
                                    onClick={handleSendRFQAndSave}
                                    disabled={loading || emailRecipients.length === 0}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Send size={14}/> {loading ? '처리 중...' : '견적 요청 및 요청서 저장'}
                                </button>
                                <button 
                                    onClick={handleSubmit} 
                                    className="px-4 py-3 bg-white text-slate-400 rounded-xl text-xs font-black border border-slate-200 hover:bg-slate-50 transition-all"
                                >
                                    발송 생략
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 grid grid-cols-12 gap-5">
                        
                        {/* Left: Configuration & Automation */}
                        <div className="col-span-5 space-y-4">
                            <section className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50 space-y-3">
                                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                    <Package size={12}/> 기본 정보 설정
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 ml-1 block">공급업체 (Vendor)</label>
                                        <select value={formData.VendorID} onChange={handleVendorChange} className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required>
                                            <option value="">업체 선택...</option>
                                            {vendors.map(v => <option key={v.id} value={v.id}>{v.Name} ({v.Category})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 ml-1 block">최종 납기 희망일</label>
                                        <input type="date" value={formData.DueDate} onChange={e => setFormData(prev => ({ ...prev, DueDate: e.target.value }))} className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required />
                                    </div>
                                </div>
                            </section>

                            <section className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 space-y-3">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                        <ClipboardList size={12}/> 스마트 소요량 산출
                                    </h3>
                                    <div className="flex gap-3">
                                        <label className="flex items-center gap-1 cursor-pointer text-[9px] font-black text-slate-600">
                                            <input type="checkbox" checked={filterShortage} onChange={e => setFilterShortage(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5" />
                                            부족 예약
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer text-[9px] font-black text-slate-600">
                                            <input type="checkbox" checked={filterRisk} onChange={e => setFilterRisk(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5" />
                                            위험 재고
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {formData.VendorID ? (
                                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col max-h-[240px]">
                                            <div className="p-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-black text-slate-600">
                                                    <input type="checkbox" checked={isAllChecked} onChange={handleAllCheckToggle} className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5" />
                                                    일괄 체크
                                                </label>
                                                <span className="text-[9px] font-bold text-slate-400">대상: {smartNeedsList.length}건</span>
                                            </div>
                                            <div className="divide-y divide-slate-100 overflow-y-auto custom-scrollbar flex-1">
                                                {smartNeedsList.map(item => (
                                                    <div key={item.PartID} className="p-2 flex items-center justify-between text-[11px] hover:bg-slate-50">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <input type="checkbox" checked={!!selectedSmartParts[item.PartID]} onChange={() => handleSmartPartCheckToggle(item.PartID)} className="rounded text-emerald-600 focus:ring-emerald-500 shrink-0 w-3.5 h-3.5" />
                                                            <div className="text-left min-w-0">
                                                                <p className="font-bold text-slate-800 truncate">{item.PartName}</p>
                                                                <p className="text-[9px] font-mono text-slate-400">{item.PartID}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0 flex flex-col items-end gap-0.5 ml-2">
                                                            <div className="flex gap-1.5 text-[9px] font-bold">
                                                                <span className="text-slate-400 font-mono">현재고: {item.OnHand}</span>
                                                                {item.Shortage > 0 && <span className="text-rose-500 font-mono">부족: {item.Shortage}</span>}
                                                            </div>
                                                            <span className="bg-emerald-50 border border-emerald-100 text-[9px] text-emerald-700 font-extrabold px-1 rounded">권장: {item.SuggestQty}EA</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {smartNeedsList.length === 0 && (
                                                    <p className="text-center py-6 text-slate-400 text-[11px] font-bold">해당 필터 조건의 부족/위험 재고가 없습니다.</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border border-slate-200 border-dashed rounded-xl py-8 text-center text-slate-400 text-[11px] font-bold bg-white">
                                            공급업체를 먼저 선택해주십시오.
                                        </div>
                                    )}

                                    <button 
                                        type="button" 
                                        onClick={handleImportSelectedSmartNeeds} 
                                        disabled={!formData.VendorID || loading || smartNeedsList.length === 0} 
                                        className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100/50 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                        <Plus size={14}/> <span>선택된 스마트 소요량 품목 추가</span>
                                    </button>
                                </div>
                            </section>
                        </div>

                        {/* Right: Items List */}
                        <div className="col-span-7 space-y-3 flex flex-col">
                            <div className="flex justify-between items-center px-1">
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                                    <ShoppingCart size={15} className="text-indigo-500"/> 발주 요청 품목 리스트
                                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full ml-1.5">{formData.Items.length} ITEMS</span>
                                </h3>
                                <button type="button" onClick={() => setFormData(prev => ({...prev, Items: [...prev.Items, createEmptyItem()]}))} disabled={!formData.VendorID} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-black transition-all shadow-md disabled:opacity-50">
                                    <Plus size={12} /> 품목 직접 추가
                                </button>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white flex-1 flex flex-col min-h-[350px]">
                                {formData.VendorID ? (
                                    <table className="w-full border-collapse text-left text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                                <th className="py-2 px-3 text-center w-[50px]">순번</th>
                                                <th className="py-2 px-3">품목 선택</th>
                                                <th className="py-2 px-3 text-right w-[100px]">현재고</th>
                                                <th className="py-2 px-3 text-right w-[100px]">수량</th>
                                                <th className="py-2 px-3 text-center w-[50px]">삭제</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {formData.Items.map((item, index) => {
                                                const pid = (item.PartID || '').trim().toUpperCase();
                                                const invRecord = inventory.find(i => (i.PartID || '').trim().toUpperCase() === pid);
                                                const onHand = Number(invRecord?.OnHand || 0);
                                                const shortageVal = Number(reservationResults.shortageMap[pid] || 0);
                                                
                                                const stockStatusText = item.PartID ? (
                                                    shortageVal > 0 ? (
                                                        <span className="text-rose-500 font-extrabold font-mono">-{shortageVal.toLocaleString()} EA</span>
                                                    ) : (
                                                        <span className="text-slate-400 font-bold font-mono">{onHand.toLocaleString()} EA</span>
                                                    )
                                                ) : <span className="text-slate-300">-</span>;

                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-2 px-3 text-center text-slate-300 font-bold font-mono">{String(index + 1).padStart(2, '0')}</td>
                                                        <td className="py-2 px-3">
                                                            <div className="flex flex-col gap-1">
                                                                <select 
                                                                    value={item.PartID} 
                                                                    onChange={e => updateItem(item.id, 'PartID', e.target.value)} 
                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500"
                                                                >
                                                                    <option value="">품목 선택...</option>
                                                                    {filteredPartsByVendor.map(p => (
                                                                        <option key={p.id} value={p.PartID}>[{p.PartID}] {p.Name}</option>
                                                                    ))}
                                                                </select>
                                                                {item.PartID && ecnNotes[item.PartID] && (
                                                                    <span className="text-[9px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 font-bold self-start mt-0.5">
                                                                        ⚠️ 리비전 사유: {ecnNotes[item.PartID]}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-3 text-right">{stockStatusText}</td>
                                                        <td className="py-2 px-3 text-right">
                                                            <input type="number" min="1" value={item.Qty} onChange={e => updateItem(item.id, 'Qty', parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-900 text-right font-mono" />
                                                        </td>
                                                        <td className="py-2 px-3 text-center">
                                                            <button type="button" onClick={() => setFormData(prev => ({...prev, Items: prev.Items.filter(i => i.id !== item.id)}))} className="p-1 text-slate-350 hover:text-rose-500 transition-colors">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl py-14 text-slate-350 bg-slate-50/50">
                                        <ShoppingCart size={36} className="mb-2 opacity-20"/>
                                        <p className="font-black uppercase tracking-widest text-[10px]">공급업체를 선택하시면 품목 추가가 가능합니다</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            {!showEmailStep && (
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex gap-4">
                            <div className="text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase">품목 수</p>
                                <p className="text-sm font-black text-slate-700">{formData.Items.filter(i => i.PartID).length}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase">총 수량</p>
                                <p className="text-sm font-black text-slate-700">{formData.Items.reduce((acc, i) => acc + (i.Qty || 0), 0)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-black text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all">취소</button>
                        <button 
                            onClick={handleShowRFQStep} 
                            disabled={loading || formData.Items.filter(i => i.PartID).length === 0} 
                            className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                            {loading ? '처리 중...' : (initialData ? '요청서 수정' : '견적 요청 및 요청서 저장')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-3">
            {mainContent}
        </div>, document.body
    );
};

export default CreatePOModal;
