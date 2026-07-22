import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserPlus, Trash2, Save, CheckCircle2, XCircle, MessageSquare, Clock, User, Star, ChevronRight } from 'lucide-react';
import { db } from '../../database';
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, doc, updateDoc, arrayUnion, getDoc } from '../../database';
import { useAuth } from '../../contexts/AuthContext';

async function createNotification(targetIdentifier, title, message, link = '') {
    try {
        let userEmail = '';
        let targetUid = '';

        if (targetIdentifier) {
            if (targetIdentifier.includes('@')) {
                userEmail = targetIdentifier;
            } else {
                targetUid = targetIdentifier;
                try {
                    const userSnap = await getDoc(doc(db, 'users', targetIdentifier));
                    if (userSnap.exists()) userEmail = userSnap.data().email || '';
                } catch(e) {}
            }
        }
        
        await addDoc(collection(db, 'notifications'), {
            userEmail: userEmail || targetIdentifier || '',
            targetEmail: userEmail || '',
            targetUid: targetUid || '',
            targetIdentifier: targetIdentifier || '',
            title, 
            message, 
            link, 
            read: false, 
            createdAt: serverTimestamp()
        });
        console.log(`[Approval Notification] Sent to ${userEmail || targetIdentifier} (${title})`);
    } catch (err) { console.error("Notification failed:", err); }
}

export function ApprovalLineEditor({ onSelectTemplate, initialSteps = [], onStepsChange }) {
    const { currentUser } = useAuth();
    const [steps, setSteps] = useState(initialSteps);
    const [alias, setAlias] = useState('');
    const [savedTemplates, setSavedTemplates] = useState([]);
    const [allUsers, setAllUsers] = useState([]);

    useEffect(() => {
        if (onStepsChange) onStepsChange(steps);
    }, [steps]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                // 1순위: Odoo DB에서 사내 전체 직원 조회
                const res = await fetch('http://localhost:5050/api/sql/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql: "SELECT u.login as email, p.name FROM res_users u JOIN res_partner p ON u.partner_id = p.id WHERE u.active = true" })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.rows && data.rows.length > 0) {
                        const users = data.rows.map(row => ({
                            uid: row.email,
                            displayName: row.name,
                            email: row.email
                        })).filter(u => u.email);
                        
                        users.sort((a, b) => a.displayName.localeCompare(b.displayName));
                        setAllUsers(users);
                        return;
                    }
                }
            } catch (err) { console.warn("Odoo 직원 목록 조회 실패, 로컬 DB로 폴백:", err); }

            // 2순위: 로컬 DB 폴백
            const snap = await getDocs(collection(db, 'users'));
            setAllUsers(snap.docs.map(d => ({ uid: d.email || d.id, ...d.data() })).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')));
        };
        fetchUsers();
    }, [currentUser]);

    const handleSave = async () => {
        if (!alias || !steps.length) return alert('명칭과 단계를 입력하세요.');
        await addDoc(collection(db, 'users', currentUser.uid, 'approval_templates'), {
            name: alias, steps: steps.map((s, i) => ({ label: s.label, approverUid: s.approverUid, order: i })), createdAt: serverTimestamp()
        });
        setAlias(''); // Keep steps so they can still submit
        alert('템플릿이 저장되었습니다.');
    };

    return (
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <h3 className="text-lg font-black flex items-center gap-2 mb-6"><ShieldCheck className="text-blue-600"/> 결재선 설정</h3>
            <div className="flex flex-col gap-6">
                <div className="space-y-3">
                    <div className="flex justify-between">
                         <button type="button" onClick={() => setSteps([...steps, { id: Date.now(), label: '', approverUid: '' }])} className="text-xs font-bold text-blue-600">+ 단계 추가</button>
                         <p className="text-[10px] text-slate-400">신청 시 첫 결재자에게 알림</p>
                    </div>
                    {steps.map((s, i) => (
                        <div key={s.id || i} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-black w-4 text-center">{i+1}</span>
                            <select value={s.approverUid} onChange={e => setSteps(steps.map(x => (x.id === s.id || x === s) ? {...x, approverUid: e.target.value} : x))} className="flex-1 border px-2 py-1.5 rounded-lg text-[10px] font-bold">
                                <option value="">결재자 선택</option>
                                {allUsers.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                            </select>
                            <button type="button" onClick={() => setSteps(steps.filter(x => x !== s))}><Trash2 size={14} className="text-slate-300 hover:text-rose-500" /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function ApprovalProcessor({ requestData, collectionName, onAction }) {
    const { currentUser, userProfile } = useAuth();
    const [comment, setComment] = useState('');
    const curIdx = requestData.CurrentStep || 0;
    const curStep = requestData.ApprovalSteps?.[curIdx];
    const isMyTurn = curStep?.approverUid === currentUser?.uid;

    if (!isMyTurn || requestData.Status !== 'Pending') return null;

    const handleAction = async (action) => {
        if (action === 'Reject' && !comment) return alert('반려 사유를 적어주세요.');
        const isLast = curIdx + 1 >= requestData.ApprovalSteps.length;
        const newStatus = action === 'Approve' ? (isLast ? 'Approved' : 'Pending') : 'Rejected';
        const entry = { step: curIdx, approverName: userProfile?.displayName || currentUser.displayName, action, comment, timestamp: new Date().toISOString() };
        await updateDoc(doc(db, collectionName, requestData.id), { 
            Status: newStatus, 
            CurrentStep: action === 'Approve' ? curIdx + 1 : curIdx, 
            ApprovalHistory: arrayUnion(entry) 
        });
        if (action === 'Approve') {
            if (!isLast) await createNotification(requestData.ApprovalSteps[curIdx + 1].approverUid, '결재 대기', `'${requestData.title || '새 요청'}' 결재 차례입니다.`);
            else await createNotification(requestData.userId, '최종 승인', `'${requestData.title || '요청'}' 건이 승인되었습니다.`);
        } else await createNotification(requestData.userId, '반려 알림', `'${requestData.title || '요청'}' 건이 반려되었습니다. 사유: ${comment}`);
        if (onAction) onAction(action);
    };

    return (
        <div className="bg-white rounded-2xl border-2 border-blue-500 p-6 space-y-4 shadow-xl">
            <p className="text-sm font-black flex items-center gap-2"><ShieldCheck className="text-blue-600"/> 결재 처리: {curStep.label}</p>
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="의견 입력..." className="w-full border p-3 rounded-xl text-xs" rows="2"/>
            <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleAction('Reject')} className="bg-rose-50 text-rose-600 py-2 rounded-xl font-bold text-xs">반려</button>
                <button onClick={() => handleAction('Approve')} className="bg-blue-600 text-white py-2 rounded-xl font-bold text-xs">승인</button>
            </div>
        </div>
    );
}

export async function notifyFirstApprover(data) {
    if (data.ApprovalSteps?.[0]) await createNotification(data.ApprovalSteps[0].approverUid, '신규 결재 요청', `'${data.title || '새 요청'}' 건 결재가 왔습니다.`);
}

export function ApprovalStatusViewer({ requestData }) {
    const steps = requestData.ApprovalSteps || [], history = requestData.ApprovalHistory || [], curIdx = requestData.CurrentStep || 0;
    return (
        <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">결재 현황</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {steps.map((s, i) => {
                    const h = history.find(x => x.step === i);
                    const state = i < curIdx ? 'Passed' : i === curIdx ? (requestData.Status === 'Rejected' ? 'Rejected' : 'Active') : 'Waiting';
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <div className={`flex flex-col items-center min-w-[80px] ${state === 'Active' ? 'opacity-100' : 'opacity-60'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${state === 'Passed' ? 'bg-emerald-500 border-emerald-500 text-white' : state === 'Rejected' ? 'bg-rose-500 border-rose-500 text-white' : state === 'Active' ? 'border-blue-600 text-blue-600 animate-pulse' : 'border-slate-200 text-slate-300'}`}>
                                    {state === 'Passed' ? <CheckCircle2 size={16}/> : state === 'Rejected' ? <XCircle size={16}/> : i+1}
                                </div>
                                <p className="text-[9px] font-black mt-1 text-center">{s.label}</p>
                            </div>
                            {i < steps.length - 1 && <ChevronRight size={14} className="text-slate-200"/>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
