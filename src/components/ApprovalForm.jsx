import React, { useState } from 'react';
import { db } from '../database';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from '../database';
import { useAuth } from '../contexts/AuthContext';
import { ApprovalLineEditor, notifyFirstApprover } from './common/ApprovalSystem';
import { Save, Send, Plus, Trash2, ArrowLeft } from 'lucide-react';
import JoditEditor from 'jodit-react';

export default function ApprovalForm({ existingData = null, onBack, onSaved }) {
    const { currentUser, userProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState(existingData || {
        docType: '설계변경서',
        title: '',
        
        // ECO fields
        specNo: '', issueDate: new Date().toISOString().split('T')[0], modelFamily: '', commMethod: '', appliedModels: '', 
        specCategory: '정규', publicSpecChange: '변경 안됨', changeReason: '', changeContent: '', improvementEffect: '', deptOpinion: '', revisionNo: '',
        
        // Expense fields
        drafter: userProfile?.displayName || currentUser.displayName, department: '', position: '', vendor: '', user: '', amount: '', content: '', note: '',
        
        // Mass Prod fields
        transferNo: '', productFamily: '', transferModel: '', detailModel: '', folderPath: '',
        
        // Release Request fields
        requestDate: new Date().toISOString().split('T')[0], customer: '', purpose: '',
    });

    const [items, setItems] = useState(existingData?.items || []);
    const [approvalSteps, setApprovalSteps] = useState(existingData?.ApprovalSteps || []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleDocTypeChange = (e) => {
        const type = e.target.value;
        setFormData({ ...formData, docType: type, title: '' });
        setItems([]);
    };

    const handleItemChange = (id, field, value) => setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
    const addItem = () => setItems([...items, { id: Date.now() }]);
    const removeItem = (id) => setItems(items.filter(i => i.id !== id));

    const handleSave = async (status) => {
        if (!formData.title) return alert('제목을 입력해주세요.');
        if (status === 'Pending' && approvalSteps.length === 0) return alert('결재 상신 시 결재선을 지정해야 합니다.');

        setLoading(true);
        try {
            const docData = {
                ...formData,
                items,
                ApprovalSteps: approvalSteps,
                Status: status,
                CurrentStep: 0,
                userId: currentUser.uid,
                userName: userProfile?.displayName || currentUser.displayName,
                updatedAt: serverTimestamp()
            };

            let docId = existingData?.id;
            if (docId) {
                await updateDoc(doc(db, 'approvals', docId), docData);
            } else {
                docData.createdAt = serverTimestamp();
                const docRef = await addDoc(collection(db, 'approvals'), docData);
                docId = docRef.id;
            }

            if (status === 'Pending') {
                await notifyFirstApprover({ ...docData, id: docId });
                alert('결재가 성공적으로 상신되었습니다.');
            } else {
                alert('임시저장 되었습니다.');
            }
            if (onSaved) onSaved();
        } catch (err) {
            console.error(err);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // ----------------------------------------------------
    // Field Renderers
    // ----------------------------------------------------
    const renderECOFields = () => (
        <>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">시방No.</label><input name="specNo" value={formData.specNo||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">발행일자</label><input type="date" name="issueDate" value={formData.issueDate||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">적용모델 (제품군)</label><input name="modelFamily" value={formData.modelFamily||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">Servo 통신방법</label><input name="commMethod" value={formData.commMethod||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">적용모델 (상세)</label><input name="appliedModels" value={formData.appliedModels||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">시방구분</label>
                <select name="specCategory" value={formData.specCategory||'정규'} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm">
                    <option value="정규">정규</option><option value="임시">임시</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">공표사양 변경여부</label>
                <select name="publicSpecChange" value={formData.publicSpecChange||'변경 안됨'} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm">
                    <option value="변경 안됨">변경 안됨</option><option value="변경 됨">변경 됨</option>
                </select>
            </div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">변경사유</label><textarea name="changeReason" value={formData.changeReason||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm h-20"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">변경내용 (공표사양변경시)</label><textarea name="changeContent" value={formData.changeContent||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm h-20"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">개선효과</label><textarea name="improvementEffect" value={formData.improvementEffect||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm h-20"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">발행부서 의견</label><textarea name="deptOpinion" value={formData.deptOpinion||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm h-20"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Revision No.</label><input name="revisionNo" value={formData.revisionNo||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
        </>
    );

    const renderExpenseFields = () => (
        <>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">기안자</label><input name="drafter" value={formData.drafter||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">날짜</label><input type="date" name="issueDate" value={formData.issueDate||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">사용 부서</label><input name="department" value={formData.department||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">직급</label><input name="position" value={formData.position||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">사용자</label><input name="user" value={formData.user||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">거래처명</label><input name="vendor" value={formData.vendor||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">금액</label><input type="text" name="amount" value={formData.amount||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">상세내용</label><textarea name="content" value={formData.content||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm h-20"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">기타</label><input name="note" value={formData.note||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
        </>
    );

    const renderTransferFields = () => (
        <>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">발행일자</label><input type="date" name="issueDate" value={formData.issueDate||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">양산이관 번호</label><input name="transferNo" value={formData.transferNo||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">제품군</label><input name="productFamily" value={formData.productFamily||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">이관 모델(시리즈)</label><input name="transferModel" value={formData.transferModel||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">세부 모델명</label><input name="detailModel" value={formData.detailModel||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">양산이관 폴더경로</label><input name="folderPath" value={formData.folderPath||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">발행부서 의견</label><textarea name="deptOpinion" value={formData.deptOpinion||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm h-20"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">비고</label><input name="note" value={formData.note||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
        </>
    );

    const renderDraftFields = () => (
        <>
            <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-2">상세 기안 내용 (자유 양식)</label>
                <div className="bg-white">
                    <JoditEditor
                        value={formData.content || ''}
                        config={{
                            height: 400,
                            language: 'ko',
                            placeholder: '기안 내용을 자세히 작성해 주세요...',
                        }}
                        onBlur={newContent => setFormData({ ...formData, content: newContent })}
                    />
                </div>
            </div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">비고</label><input name="note" value={formData.note||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
        </>
    );

    const renderReleaseFields = () => (
        <>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">불출요청일</label><input type="date" name="requestDate" value={formData.requestDate||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">고객사</label><input name="customer" value={formData.customer||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1">사용목적</label><input name="purpose" value={formData.purpose||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">비고</label><input name="note" value={formData.note||''} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm"/></div>
        </>
    );

    // ----------------------------------------------------
    // Table Renderers
    // ----------------------------------------------------
    const renderTable = () => {
        if (formData.docType === '설계변경서') {
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500">
                                <th className="p-2 border">품명</th><th className="p-2 border">LIST No.</th><th className="p-2 border">수정 전 규격</th><th className="p-2 border">수정 후 규격</th><th className="p-2 border">수량(EA)</th><th className="p-2 border">적용 일자</th><th className="p-2 border">비고</th><th className="p-2 border w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td className="p-1 border"><input value={item.name||''} onChange={e => handleItemChange(item.id, 'name', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.listNo||''} onChange={e => handleItemChange(item.id, 'listNo', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.oldSpec||''} onChange={e => handleItemChange(item.id, 'oldSpec', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.newSpec||''} onChange={e => handleItemChange(item.id, 'newSpec', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input type="number" value={item.qty||''} onChange={e => handleItemChange(item.id, 'qty', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.applyDate||''} onChange={e => handleItemChange(item.id, 'applyDate', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.note||''} onChange={e => handleItemChange(item.id, 'note', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border text-center"><button onClick={() => removeItem(item.id)} className="text-rose-400 hover:text-rose-600 p-1"><Trash2 size={14}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        if (formData.docType === '양산이관서') {
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500">
                                <th className="p-2 border">이관자료 목록</th><th className="p-2 border">Version</th><th className="p-2 border">이관완료 일자</th><th className="p-2 border">비고</th><th className="p-2 border w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td className="p-1 border"><input value={item.name||''} onChange={e => handleItemChange(item.id, 'name', e.target.value)} className="w-full p-1 text-xs outline-none" placeholder="예: BOM, Datasheet..."/></td>
                                    <td className="p-1 border"><input value={item.version||''} onChange={e => handleItemChange(item.id, 'version', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input type="date" value={item.applyDate||''} onChange={e => handleItemChange(item.id, 'applyDate', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.note||''} onChange={e => handleItemChange(item.id, 'note', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border text-center"><button onClick={() => removeItem(item.id)} className="text-rose-400 hover:text-rose-600 p-1"><Trash2 size={14}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        if (formData.docType === '불출요청서') {
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500">
                                <th className="p-2 border">품목번호</th><th className="p-2 border">자재/제품명</th><th className="p-2 border">수량</th><th className="p-2 border">공급가</th><th className="p-2 border">금액</th><th className="p-2 border">비고</th><th className="p-2 border w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td className="p-1 border"><input value={item.itemNo||''} onChange={e => handleItemChange(item.id, 'itemNo', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.name||''} onChange={e => handleItemChange(item.id, 'name', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input type="number" value={item.qty||''} onChange={e => handleItemChange(item.id, 'qty', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input type="number" value={item.price||''} onChange={e => handleItemChange(item.id, 'price', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input type="number" value={item.amount||''} onChange={e => handleItemChange(item.id, 'amount', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border"><input value={item.note||''} onChange={e => handleItemChange(item.id, 'note', e.target.value)} className="w-full p-1 text-xs outline-none" /></td>
                                    <td className="p-1 border text-center"><button onClick={() => removeItem(item.id)} className="text-rose-400 hover:text-rose-600 p-1"><Trash2 size={14}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="max-w-7xl mx-auto pb-20 px-4">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
                <h2 className="text-2xl font-bold text-slate-800">{existingData ? '결재 문서 수정' : '새 전자결재 작성'}</h2>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className="flex-1 space-y-6 w-full min-w-0">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border space-y-4 border-t-4 border-t-blue-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">문서 종류</label>
                                <select name="docType" value={formData.docType} onChange={handleDocTypeChange} disabled={!!existingData} className="w-full border p-2 rounded-lg text-sm bg-slate-50 font-bold">
                                    <option value="설계변경서">설계변경서 (ECO)</option>
                                    <option value="지출결의서">지출결의서</option>
                                    <option value="양산이관서">양산이관서</option>
                                    <option value="기안서">기안서</option>
                                    <option value="불출요청서">불출요청서</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">결재 제목</label>
                                <input name="title" value={formData.title} onChange={handleChange} className="w-full border p-2 rounded-lg text-sm font-bold bg-blue-50 text-blue-900" placeholder="결재 제목을 입력하세요."/>
                            </div>
                            
                            {formData.docType === '설계변경서' && renderECOFields()}
                            {formData.docType === '지출결의서' && renderExpenseFields()}
                            {formData.docType === '양산이관서' && renderTransferFields()}
                            {formData.docType === '기안서' && renderDraftFields()}
                            {formData.docType === '불출요청서' && renderReleaseFields()}
                        </div>
                    </div>

                    {['설계변경서', '양산이관서', '불출요청서'].includes(formData.docType) && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-slate-800">목록/항목 상세</h3>
                                <button onClick={addItem} className="text-xs flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100">
                                    <Plus size={14}/> 항목 추가
                                </button>
                            </div>
                            {renderTable()}
                        </div>
                    )}
                </div>

                <div className="w-full lg:w-80 shrink-0 sticky top-6">
                    <ApprovalLineEditor onSelectTemplate={(t) => setApprovalSteps(t.steps)} initialSteps={approvalSteps} onStepsChange={setApprovalSteps} />
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-center gap-4 shadow-2xl z-40 ml-16 md:ml-64">
                <button onClick={() => handleSave('Draft')} disabled={loading} className="px-6 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold flex items-center gap-2">
                    <Save size={18}/> 임시저장
                </button>
                <button onClick={() => handleSave('Pending')} disabled={loading} className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200">
                    <Send size={18}/> 상신하기
                </button>
            </div>
        </div>
    );
}
