import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from '../database';
import { db } from '../database';
import { useAuth } from '../contexts/AuthContext';
import ApprovalForm from '../components/ApprovalForm';
import { ApprovalProcessor, ApprovalStatusViewer } from '../components/common/ApprovalSystem';
import { FileCheck, Plus } from 'lucide-react';

export default function ApprovalPage() {
    const { currentUser } = useAuth();
    const [viewMode, setViewMode] = useState('list'); // list, create, edit, view
    const [activeTab, setActiveTab] = useState('pending'); // pending, my, draft, completed
    const [approvalsData, setApprovalsData] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'approvals'), orderBy('updatedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setApprovalsData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [currentUser]);

    const getFilteredData = () => {
        if (activeTab === 'draft') return approvalsData.filter(d => d.userId === currentUser.uid && d.Status === 'Draft');
        if (activeTab === 'my') return approvalsData.filter(d => d.userId === currentUser.uid && d.Status !== 'Draft');
        if (activeTab === 'pending') return approvalsData.filter(d => d.Status === 'Pending' && d.ApprovalSteps?.[d.CurrentStep || 0]?.approverUid === currentUser.uid);
        if (activeTab === 'completed') return approvalsData.filter(d => d.Status === 'Approved' || d.Status === 'Rejected');
        return [];
    };

    if (viewMode === 'create' || viewMode === 'edit') {
        return <ApprovalForm existingData={selectedRequest} onBack={() => setViewMode('list')} onSaved={() => setViewMode('list')} />;
    }

    if (viewMode === 'view' && selectedRequest) {
        const renderViewDetails = () => {
            const data = selectedRequest;
            return (
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 text-lg font-black text-blue-700 border-b pb-2 mb-2">{data.docType} 상세</div>
                    <div><p className="text-xs font-bold text-slate-500">결재 제목</p><p className="font-bold">{data.title}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">작성자</p><p>{data.userName}</p></div>
                    
                    {data.docType === '설계변경서' && (
                        <>
                            <div><p className="text-xs font-bold text-slate-500">시방 No.</p><p>{data.specNo}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">발행일자</p><p>{data.issueDate}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">적용모델 (제품군)</p><p>{data.modelFamily}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">시방구분</p><p>{data.specCategory}</p></div>
                            <div className="col-span-2"><p className="text-xs font-bold text-slate-500">변경사유</p><p>{data.changeReason}</p></div>
                            <div className="col-span-2"><p className="text-xs font-bold text-slate-500">개선효과</p><p>{data.improvementEffect}</p></div>
                        </>
                    )}
                    {data.docType === '지출결의서' && (
                        <>
                            <div><p className="text-xs font-bold text-slate-500">사용 부서 / 직급</p><p>{data.department} / {data.position}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">날짜</p><p>{data.issueDate}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">거래처명 / 금액</p><p>{data.vendor} / {data.amount}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">사용자</p><p>{data.user}</p></div>
                            <div className="col-span-2"><p className="text-xs font-bold text-slate-500">상세내용</p><p>{data.content}</p></div>
                        </>
                    )}
                    {data.docType === '양산이관서' && (
                        <>
                            <div><p className="text-xs font-bold text-slate-500">양산이관 번호</p><p>{data.transferNo}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">발행일자</p><p>{data.issueDate}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">제품군 / 모델</p><p>{data.productFamily} / {data.transferModel}</p></div>
                            <div className="col-span-2"><p className="text-xs font-bold text-slate-500">폴더경로</p><p>{data.folderPath}</p></div>
                        </>
                    )}
                    {data.docType === '기안서' && (
                        <div 
                            className="col-span-2 bg-slate-50 p-6 rounded-xl mt-2 prose prose-sm max-w-none prose-slate" 
                            dangerouslySetInnerHTML={{ __html: data.content }}
                        />
                    )}
                    {data.docType === '불출요청서' && (
                        <>
                            <div><p className="text-xs font-bold text-slate-500">불출요청일</p><p>{data.requestDate}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">고객사</p><p>{data.customer}</p></div>
                            <div className="col-span-2"><p className="text-xs font-bold text-slate-500">사용목적</p><p>{data.purpose}</p></div>
                        </>
                    )}
                    
                    {data.items && data.items.length > 0 && (
                        <div className="col-span-2 mt-4">
                            <p className="text-xs font-bold text-slate-500 mb-2">항목 리스트 ({data.items.length}건)</p>
                            <div className="bg-slate-50 p-3 rounded-lg text-sm border overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead><tr className="border-b"><th className="pb-1">품명/내용</th><th className="pb-1">수량/기타</th></tr></thead>
                                    <tbody>
                                        {data.items.map((i, idx) => (
                                            <tr key={idx} className="border-b last:border-0">
                                                <td className="py-1">{i.name || i.itemNo || i.oldSpec || '(이름없음)'}</td>
                                                <td className="py-1">{i.qty || i.version || i.price || i.applyDate || ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        return (
            <div className="p-6 max-w-5xl mx-auto pb-32">
                <div className="flex items-center gap-4 mb-6">
                    <button onClick={() => setViewMode('list')} className="p-2 hover:bg-slate-100 rounded-full">← 목록으로</button>
                    <h2 className="text-2xl font-bold text-slate-800">결재 문서 상세조회</h2>
                </div>
                
                <ApprovalStatusViewer requestData={selectedRequest} />

                <div className="bg-white p-6 rounded-2xl shadow-sm border mt-6 space-y-4">
                    {renderViewDetails()}
                </div>

                <div className="mt-6">
                    <ApprovalProcessor 
                        requestData={selectedRequest} 
                        collectionName="approvals" 
                        onAction={(action) => setViewMode('list')} 
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto min-h-[calc(100vh-64px)] flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-lg text-blue-600"><FileCheck size={24}/></div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">통합 전자결재</h1>
                        <p className="text-slate-500 text-sm">기안, 지출, 설계변경, 양산이관 등 다양한 문서를 결재합니다.</p>
                    </div>
                </div>
                <button onClick={() => { setSelectedRequest(null); setViewMode('create'); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700">
                    <Plus size={18}/> 새 결재 작성
                </button>
            </div>

            <div className="flex gap-4 border-b mb-6">
                <button onClick={() => setActiveTab('pending')} className={`pb-2 px-2 font-bold ${activeTab === 'pending' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}>결재 대기중</button>
                <button onClick={() => setActiveTab('my')} className={`pb-2 px-2 font-bold ${activeTab === 'my' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}>내 상신 내역</button>
                <button onClick={() => setActiveTab('draft')} className={`pb-2 px-2 font-bold ${activeTab === 'draft' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}>임시저장</button>
                <button onClick={() => setActiveTab('completed')} className={`pb-2 px-2 font-bold ${activeTab === 'completed' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}>완료된 결재</button>
            </div>

            <div className="flex-1 bg-white rounded-2xl shadow-sm border overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="p-4 font-bold w-32">종류</th>
                            <th className="p-4 font-bold">제목</th>
                            <th className="p-4 font-bold w-24">작성자</th>
                            <th className="p-4 font-bold w-24">상태</th>
                            <th className="p-4 font-bold w-32">기안일</th>
                            <th className="p-4 w-20"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {getFilteredData().length === 0 ? (
                            <tr><td colSpan="6" className="p-8 text-center text-slate-400">해당하는 문서가 없습니다.</td></tr>
                        ) : (
                            getFilteredData().map(doc => (
                                <tr key={doc.id} className="border-b last:border-none hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-slate-500 font-bold">{doc.docType || '기안서'}</td>
                                    <td className="p-4 font-bold text-slate-800">{doc.title}</td>
                                    <td className="p-4 text-slate-600">{doc.userName}</td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${doc.Status === 'Draft' ? 'bg-slate-100 text-slate-600' : doc.Status === 'Pending' ? 'bg-blue-100 text-blue-600' : doc.Status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                            {doc.Status === 'Draft' ? '임시저장' : doc.Status === 'Pending' ? '진행중' : doc.Status === 'Approved' ? '승인완료' : '반려됨'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-500">{doc.updatedAt?.toDate()?.toLocaleDateString()}</td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => { setSelectedRequest(doc); setViewMode(doc.Status === 'Draft' ? 'edit' : 'view'); }} 
                                            className="text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-3 py-1.5 rounded-lg whitespace-nowrap"
                                        >
                                            {doc.Status === 'Draft' ? '수정' : '보기'}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
