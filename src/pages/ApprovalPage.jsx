import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from '../database';
import { db } from '../database';
import { useAuth } from '../contexts/AuthContext';
import ApprovalForm from '../components/ApprovalForm';
import { ApprovalProcessor, ApprovalStatusViewer } from '../components/common/ApprovalSystem';
import { FileCheck, Plus, Trash2 } from 'lucide-react';

import { useLocation } from 'react-router-dom';

export default function ApprovalPage() {
    const { currentUser, userProfile } = useAuth();
    const location = useLocation();
    
    // Parse query params to optionally auto-start creating a specific document type
    const queryParams = new URLSearchParams(location.search);
    const initialDocType = queryParams.get('docType');
    const initialSubType = queryParams.get('subType');
    
    const [viewMode, setViewMode] = useState(initialDocType ? 'create' : 'list'); // list, create, edit, view
    const [activeTab, setActiveTab] = useState('pending'); // pending, my, draft, completed
    const [docTypeTab, setDocTypeTab] = useState('all'); // all, 지출결의서, 기안서 등
    const [approvalsData, setApprovalsData] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(
        initialDocType ? { docType: initialDocType, subType: initialSubType || '' } : null
    );

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'approvals'), orderBy('updatedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setApprovalsData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [currentUser]);

    const getFilteredData = () => {
        let filtered = approvalsData;
        
        if (activeTab === 'draft') filtered = filtered.filter(d => (d.userId === currentUser.uid || d.RequesterID === currentUser.uid) && (d.Status === 'Draft' || d.Status === 'DRAFT'));
        else if (activeTab === 'my') filtered = filtered.filter(d => (d.userId === currentUser.uid || d.RequesterID === currentUser.uid) && (d.Status !== 'Draft' && d.Status !== 'DRAFT'));
        else if (activeTab === 'pending') filtered = filtered.filter(d => 
            (d.Status === 'Pending' || d.Status === 'PENDING') && 
            (d.ApprovalSteps?.[d.CurrentStep || 0]?.approverUid === currentUser.uid || d.ApproverID === currentUser.uid)
        );
        else if (activeTab === 'completed') filtered = filtered.filter(d => ['Approved', 'APPROVED', 'Rejected', 'REJECTED'].includes(d.Status));
        else filtered = [];

        if (docTypeTab !== 'all') {
            filtered = filtered.filter(d => (d.docType || d.DocType || '기안서') === docTypeTab);
        }

        return filtered;
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
                    {data.docType === '근태신청서' && (
                        <>
                            <div><p className="text-xs font-bold text-slate-500">근태 종류</p><p>{data.subType}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">시작일</p><p>{data.startDate}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">종료일</p><p>{data.endDate}</p></div>
                            <div><p className="text-xs font-bold text-slate-500">목적지/장소</p><p>{data.location || '-'}</p></div>
                            <div className="col-span-2"><p className="text-xs font-bold text-slate-500">신청 사유</p><p>{data.reason}</p></div>
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
            <div className="p-6 max-w-5xl mx-auto pb-32 print:p-0 print:m-0 print:max-w-none">
                <div className="flex items-center justify-between mb-6 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('list')} className="p-2 hover:bg-slate-100 rounded-full">← 목록으로</button>
                        <h2 className="text-2xl font-bold text-slate-800">결재 문서 상세조회</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {userProfile?.role === 'admin' && (
                            <button 
                                onClick={async () => {
                                    if (window.confirm('정말 이 전자결재 문서를 삭제하시겠습니까?\n삭제된 문서는 복구할 수 없습니다.')) {
                                        try {
                                            await deleteDoc(doc(db, 'approvals', selectedRequest.id));
                                            setViewMode('list');
                                        } catch (e) {
                                            console.error('Delete failed:', e);
                                            alert('문서 삭제 중 오류가 발생했습니다.');
                                        }
                                    }
                                }}
                                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold flex items-center gap-2 transition-colors"
                            >
                                <Trash2 size={16} /> 삭제
                            </button>
                        )}
                        <button onClick={() => window.print()} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-2">
                            🖨️ 인쇄하기
                        </button>
                    </div>
                </div>
                
                {/* 인쇄용 결재선 표 (화면에는 안 보이고 인쇄할 때만 우측 상단에 표시) */}
                <div className="hidden print:flex justify-end mb-8 w-full">
                    <table className="border-collapse border-2 border-black text-center text-xs">
                        <tbody>
                            <tr>
                                <td rowSpan="3" className="bg-slate-100 border border-black font-bold p-2 w-8" style={{ writingMode: 'vertical-rl', letterSpacing: '0.2em' }}>결재</td>
                                {selectedRequest?.ApprovalSteps?.map((s, i) => (
                                    <td key={i} className="bg-slate-100 border border-black p-1 font-bold w-20">{s.label}</td>
                                ))}
                            </tr>
                            <tr>
                                {selectedRequest?.ApprovalSteps?.map((s, i) => {
                                    const h = selectedRequest?.ApprovalHistory?.find(x => x.step === i);
                                    return (
                                        <td key={i} className="border border-black h-20 align-middle">
                                            {h ? (h.action === 'Approve' ? '✅ 승인' : '❌ 반려') : ''}
                                        </td>
                                    );
                                })}
                            </tr>
                            <tr>
                                {selectedRequest?.ApprovalSteps?.map((s, i) => {
                                    const h = selectedRequest?.ApprovalHistory?.find(x => x.step === i);
                                    return (
                                        <td key={i} className="border border-black p-1 text-[10px]">
                                            {h ? new Date(h.timestamp).toLocaleDateString() : ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="print:hidden">
                    <ApprovalStatusViewer requestData={selectedRequest} />
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border mt-6 space-y-4 print:shadow-none print:border-none print:p-0">
                    {renderViewDetails()}
                </div>

                <div className="mt-6 print:hidden">
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

            {/* 문서 종류 탭 */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {['all', '지출결의서', '기안서', '설계변경서', '양산이관서', '이슈발생요청서', '근태신청서', '불출요청서'].map(type => (
                    <button 
                        key={type}
                        onClick={() => setDocTypeTab(type)} 
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors shadow-sm border ${docTypeTab === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'}`}
                    >
                        {type === 'all' ? '모두' : type}
                    </button>
                ))}
            </div>

            <div className="flex-1 bg-white rounded-2xl shadow-sm border overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="p-4 font-bold w-32">기안일</th>
                            <th className="p-4 font-bold w-32">종류</th>
                            <th className="p-4 font-bold">제목</th>
                            <th className="p-4 font-bold w-24">작성자</th>
                            <th className="p-4 font-bold w-28">결재자</th>
                            <th className="p-4 font-bold w-24">상태</th>
                            <th className="p-4 w-20"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {getFilteredData().length === 0 ? (
                            <tr><td colSpan="7" className="p-8 text-center text-slate-400">해당하는 문서가 없습니다.</td></tr>
                        ) : (
                            getFilteredData().map(doc => {
                                const status = doc.Status?.toLowerCase() || '';
                                const isPending = status === 'pending';
                                const isApproved = status === 'approved';
                                const isRejected = status === 'rejected';
                                const currentStep = doc.CurrentStep || 0;
                                const isMyTurn = isPending && (doc.ApprovalSteps?.[currentStep]?.approverUid === currentUser.uid || doc.ApproverID === currentUser.uid);
                                
                                let currentApproverName = '-';
                                if (isApproved) currentApproverName = '결재 완료';
                                else if (isRejected) currentApproverName = '반려됨';
                                else currentApproverName = doc.ApprovalSteps?.[currentStep]?.approverName || doc.ApproverName || (isPending ? '결재 대기중' : '-');

                                return (
                                    <tr key={doc.id} className="border-b last:border-none hover:bg-slate-50 transition-colors">
                                        <td className="p-4 text-slate-500">
                                            {doc.updatedAt?.toDate?.()?.toLocaleDateString() || doc.RequestedAt && new Date(doc.RequestedAt).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 text-slate-500 font-bold">{doc.docType || doc.DocType || '기안서'}</td>
                                        <td className="p-4 font-bold text-slate-800">
                                            {doc.title || doc.Title}
                                        </td>
                                        <td className="p-4 text-slate-600">{doc.userName || doc.RequesterName}</td>
                                        <td className="p-4">
                                            {isMyTurn ? (
                                                <span className="px-3 py-1 font-black rounded-lg text-xs animate-hard-blink shadow-md shadow-rose-200 inline-block transition-all duration-300">
                                                    {currentApproverName}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 font-bold">{currentApproverName}</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${(doc.Status === 'Draft' || doc.Status === 'DRAFT') ? 'bg-slate-100 text-slate-600' : (doc.Status === 'Pending' || doc.Status === 'PENDING') ? 'bg-blue-100 text-blue-600' : (doc.Status === 'Approved' || doc.Status === 'APPROVED') ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                {(doc.Status === 'Draft' || doc.Status === 'DRAFT') ? '임시저장' : (doc.Status === 'Pending' || doc.Status === 'PENDING') ? '진행중' : (doc.Status === 'Approved' || doc.Status === 'APPROVED') ? '승인완료' : '반려됨'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => { setSelectedRequest(doc); setViewMode(doc.Status === 'Draft' ? 'edit' : 'view'); }} 
                                                className="text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-3 py-1.5 rounded-lg whitespace-nowrap"
                                            >
                                                {doc.Status === 'Draft' ? '수정' : '보기'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
