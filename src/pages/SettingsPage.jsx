import React, { useState } from 'react';
import { Save, ShieldAlert, Mail, Database, Server, FileText, GitMerge } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import RoleGuard from '../components/common/RoleGuard';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('email');
    const { userProfile } = useAuth();
    const [loading, setLoading] = useState(false);

    const [emailSettings, setEmailSettings] = useState({
        imapHost: 'imap.gmail.com',
        imapPort: '993',
        smtpHost: 'smtp.gmail.com',
        smtpPort: '465',
        username: '',
        password: '' // App password
    });

    const [apiSettings, setApiSettings] = useState({
        ecountApiKey: '',
        ecountComCode: '',
        googleApiKey: ''
    });

    const [templateSettings, setTemplateSettings] = useState({
        poEmailSubject: '[발주서] {PONumber} - IR Assistant (주)',
        poEmailBody: '안녕하십니까, IR Assistant (주)입니다.\n아래와 같이 발주서를 송부드리오니 확인 후 납기 내 납품을 부탁드립니다.',
        quotationEmailSubject: '[견적요청] {PartName} 외 - IR Assistant (주)',
        quotationEmailBody: '안녕하십니까, IR Assistant (주)입니다.\n첨부된 항목에 대한 견적(단가 및 리드타임)을 회신 부탁드립니다.'
    });

    const [approvalSettings, setApprovalSettings] = useState({
        allowAdminMasterBypass: true,
        requireSalesApprovalForDerivatives: true,
        requireQAForProduction: true
    });

    const handleSaveEmail = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate save to Firebase config collection
        setTimeout(() => {
            alert('이메일 설정이 저장되었습니다.');
            setLoading(false);
        }, 800);
    };

    const handleSaveAPI = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate save
        setTimeout(() => {
            alert('API 연동 설정이 저장되었습니다.');
            setLoading(false);
        }, 800);
    };

    const handleSaveTemplates = async (e) => {
        e.preventDefault();
        setLoading(true);
        setTimeout(() => {
            alert('이메일 템플릿 설정이 저장되었습니다.');
            setLoading(false);
        }, 800);
    };

    const handleSaveApproval = async (e) => {
        e.preventDefault();
        setLoading(true);
        setTimeout(() => {
            alert('결재 및 워크플로우 설정이 저장되었습니다.');
            setLoading(false);
        }, 800);
    };

    return (
        <RoleGuard requiredRole="admin">
            <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-4 animate-fade-in text-slate-800 p-4">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/10 rounded-2xl text-white backdrop-blur-sm">
                            <Server size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white">시스템 환경설정 (Admin Settings)</h1>
                            <p className="text-slate-300 mt-1 text-xs font-bold">ERP 통합 관리를 위한 이메일, API, 권한 설정을 제어합니다.</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 gap-4 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2 shrink-0">
                        <button onClick={() => setActiveTab('email')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'email' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <Mail size={18} /> A/S 이메일 연동 (CS)
                        </button>
                        <button onClick={() => setActiveTab('api')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'api' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <Database size={18} /> 외부 API 연동 (ECount 등)
                        </button>
                        <button onClick={() => setActiveTab('templates')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'templates' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <FileText size={18} /> 이메일/문서 템플릿
                        </button>
                        <button onClick={() => setActiveTab('approval')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'approval' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <GitMerge size={18} /> 결재 워크플로우 설정
                        </button>
                        <button onClick={() => setActiveTab('roles')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'roles' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <ShieldAlert size={18} /> 권한 및 부서 매핑
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-y-auto p-8 relative">
                        
                        {activeTab === 'email' && (
                            <div className="max-w-2xl animate-fade-in">
                                <h2 className="text-lg font-black text-slate-900 mb-2">고객지원(A/S) 이메일 자동 수집 설정</h2>
                                <p className="text-sm text-slate-500 font-medium mb-8">대표 고객지원 이메일로 인입되는 메일을 A/S Task로 자동 변환하기 위한 IMAP 설정을 입력하세요.</p>
                                
                                <form onSubmit={handleSaveEmail} className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-700">IMAP 호스트</label>
                                            <input type="text" value={emailSettings.imapHost} onChange={e => setEmailSettings({...emailSettings, imapHost: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-700">IMAP 포트</label>
                                            <input type="text" value={emailSettings.imapPort} onChange={e => setEmailSettings({...emailSettings, imapPort: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-slate-700">이메일 계정 (Username)</label>
                                        <input type="email" value={emailSettings.username} onChange={e => setEmailSettings({...emailSettings, username: e.target.value})} placeholder="cs@yourcompany.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-black text-slate-700">앱 비밀번호 (App Password)</label>
                                        <input type="password" value={emailSettings.password} onChange={e => setEmailSettings({...emailSettings, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                        <p className="text-[10px] text-slate-400 font-bold mt-1">보안을 위해 2단계 인증이 적용된 구글 앱 비밀번호 등을 사용하세요.</p>
                                    </div>
                                    <div className="pt-4 border-t border-slate-100">
                                        <button type="submit" disabled={loading} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-sm">
                                            <Save size={16} /> 저장 및 연결 테스트
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'api' && (
                            <div className="max-w-2xl animate-fade-in">
                                <h2 className="text-lg font-black text-slate-900 mb-2">외부 API 연동 설정</h2>
                                <p className="text-sm text-slate-500 font-medium mb-8">ECount ERP, Google Workspace 등 서드파티 서비스 연동 키를 관리합니다.</p>
                                
                                <form onSubmit={handleSaveAPI} className="space-y-6">
                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <Database size={16} className="text-indigo-500"/> ECount ERP (생산/경리 전송용)
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-slate-700">회사 코드 (COM_CODE)</label>
                                                <input type="text" value={apiSettings.ecountComCode} onChange={e => setApiSettings({...apiSettings, ecountComCode: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-slate-700">API Key / Session ID</label>
                                                <input type="password" value={apiSettings.ecountApiKey} onChange={e => setApiSettings({...apiSettings, ecountApiKey: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <Database size={16} className="text-rose-500"/> Google Workspace 연동
                                        </h3>
                                        <div className="space-y-1.5 mt-3">
                                            <label className="text-xs font-black text-slate-700">Google API Key</label>
                                            <input type="password" value={apiSettings.googleApiKey} onChange={e => setApiSettings({...apiSettings, googleApiKey: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <button type="submit" disabled={loading} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-sm">
                                            <Save size={16} /> API 키 저장
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'templates' && (
                            <div className="max-w-2xl animate-fade-in">
                                <h2 className="text-lg font-black text-slate-900 mb-2">이메일/문서 템플릿 설정</h2>
                                <p className="text-sm text-slate-500 font-medium mb-8">발주서 전송, 견적 요청 등 자동 생성되는 이메일의 기본 포맷을 설정합니다.</p>
                                
                                <form onSubmit={handleSaveTemplates} className="space-y-6">
                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <Mail size={16} className="text-indigo-500"/> 구매 발주서 (PO) 메일 템플릿
                                        </h3>
                                        <div className="space-y-3 mt-3">
                                            <div>
                                                <label className="text-xs font-black text-slate-700">메일 제목</label>
                                                <input type="text" value={templateSettings.poEmailSubject} onChange={e => setTemplateSettings({...templateSettings, poEmailSubject: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 mt-1" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-black text-slate-700">메일 본문 (기본 인사말)</label>
                                                <textarea value={templateSettings.poEmailBody} onChange={e => setTemplateSettings({...templateSettings, poEmailBody: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 mt-1 h-24" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <Mail size={16} className="text-emerald-500"/> 견적 요청 메일 템플릿
                                        </h3>
                                        <div className="space-y-3 mt-3">
                                            <div>
                                                <label className="text-xs font-black text-slate-700">메일 제목</label>
                                                <input type="text" value={templateSettings.quotationEmailSubject} onChange={e => setTemplateSettings({...templateSettings, quotationEmailSubject: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 mt-1" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-black text-slate-700">메일 본문 (기본 인사말)</label>
                                                <textarea value={templateSettings.quotationEmailBody} onChange={e => setTemplateSettings({...templateSettings, quotationEmailBody: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 mt-1 h-24" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <button type="submit" disabled={loading} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-sm">
                                            <Save size={16} /> 템플릿 저장
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'approval' && (
                            <div className="max-w-2xl animate-fade-in">
                                <h2 className="text-lg font-black text-slate-900 mb-2">결재 워크플로우 및 권한 상세 설정</h2>
                                <p className="text-sm text-slate-500 font-medium mb-8">ECN, 생산 등 시스템 전반의 프로세스 흐름을 제어합니다.</p>
                                
                                <form onSubmit={handleSaveApproval} className="space-y-6">
                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <ShieldAlert size={16} className="text-rose-500"/> 결재 우회 (Bypass) 설정
                                        </h3>
                                        <div className="space-y-3 mt-3">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={approvalSettings.allowAdminMasterBypass} onChange={e => setApprovalSettings({...approvalSettings, allowAdminMasterBypass: e.target.value})} className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500" />
                                                <span className="text-sm font-bold text-slate-700">관리자(Admin)에게 결재 마스터 승인(Bypass) 권한 부여 허용</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <GitMerge size={16} className="text-indigo-500"/> 프로세스 필수 조건 설정
                                        </h3>
                                        <div className="space-y-3 mt-3 flex flex-col gap-3">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={approvalSettings.requireSalesApprovalForDerivatives} onChange={e => setApprovalSettings({...approvalSettings, requireSalesApprovalForDerivatives: e.target.checked})} className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500" />
                                                <span className="text-sm font-bold text-slate-700">ECN 파생 모델(Derivatives) 변경 시 영업부서 검토 필수화</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input type="checkbox" checked={approvalSettings.requireQAForProduction} onChange={e => setApprovalSettings({...approvalSettings, requireQAForProduction: e.target.checked})} className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500" />
                                                <span className="text-sm font-bold text-slate-700">생산 완료 후 무조건 QA 검사(Waiting Inspection) 단계 거치기</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <button type="submit" disabled={loading} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-sm">
                                            <Save size={16} /> 정책 저장
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'roles' && (
                            <div className="max-w-2xl animate-fade-in text-center py-20">
                                <ShieldAlert size={48} className="text-slate-300 mx-auto mb-4" />
                                <h2 className="text-lg font-black text-slate-900 mb-2">권한 및 역할 매핑</h2>
                                <p className="text-sm text-slate-500 font-medium">유저별 세부 권한 매핑 기능은 준비 중입니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </RoleGuard>
    );
}
