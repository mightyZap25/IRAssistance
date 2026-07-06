import React, { useState } from 'react';
import { Save, ShieldAlert, Mail, Database, Server, FileText, GitMerge, RefreshCw, Building2, Briefcase } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import RoleGuard from '../components/common/RoleGuard';
import { getAllUsers, updateUserRoleAndDepartment, USER_ROLES, ROLE_LABELS } from '../services/userService';
import OdooBulkBOMSync from '../components/OdooBulkBOMSync';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('database');
    const { userProfile } = useAuth();
    const [loading, setLoading] = useState(false);

    // Auto Update States
    const [currentVersion, setCurrentVersion] = useState('0.0.0');
    const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [updateError, setUpdateError] = useState(null);

    // User Roles Mapping States
    const [usersList, setUsersList] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [userUpdates, setUserUpdates] = useState({}); // { [uid]: { role, department } }
    const [savingRoles, setSavingRoles] = useState(false);

    React.useEffect(() => {
        if (activeTab === 'roles') {
            setLoadingUsers(true);
            getAllUsers()
                .then(list => {
                    setUsersList(list || []);
                    const initialUpdates = {};
                    list.forEach(u => {
                        initialUpdates[u.uid] = {
                            role: u.role || 'viewer',
                            department: u.department || ''
                        };
                    });
                    setUserUpdates(initialUpdates);
                })
                .catch(err => console.error("Failed to load users:", err))
                .finally(() => setLoadingUsers(false));
        }
    }, [activeTab]);

    const handleSaveRoles = async (e) => {
        e.preventDefault();
        
        // 관리자 권한 최소 1명 존재성 및 본인 권한 보호 방어
        const myUid = userProfile?.uid || userProfile?.id;
        if (myUid && userUpdates[myUid] && userUpdates[myUid].role !== 'admin') {
            const hasOtherAdmin = usersList.some(u => u.uid !== myUid && (userUpdates[u.uid]?.role === 'admin' || (!userUpdates[u.uid] && u.role === 'admin')));
            if (!hasOtherAdmin) {
                alert('최소한 한 명의 마스터 관리자(Admin)가 존재해야 합니다. 본인의 관리자 권한을 해제할 수 없습니다.');
                return;
            }
        }

        setSavingRoles(true);
        try {
            const promises = Object.entries(userUpdates).map(async ([uid, data]) => {
                const originalUser = usersList.find(u => u.uid === uid);
                if (!originalUser) return;
                
                const isRoleChanged = originalUser.role !== data.role;
                const isDeptChanged = originalUser.department !== data.department;
                
                if (isRoleChanged || isDeptChanged) {
                    await updateUserRoleAndDepartment(uid, data.role, data.department);
                }
            });

            await Promise.all(promises);
            alert('권한 및 부서 매핑이 정상적으로 저장되었습니다.');
            
            const list = await getAllUsers();
            setUsersList(list || []);
        } catch (err) {
            console.error("Error saving roles:", err);
            alert('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setSavingRoles(false);
        }
    };

    React.useEffect(() => {
        if (window.electronAPI) {
            // Get current version
            window.electronAPI.getAppVersion().then(version => {
                setCurrentVersion(version);
            }).catch(err => console.error("Failed to get app version:", err));

            // Register IPC message listener
            const unsubscribe = window.electronAPI.onUpdateMessage((data) => {
                setUpdateStatus(data.status);
                if (data.status === 'downloading') {
                    setDownloadPercent(data.percent || 0);
                } else if (data.status === 'available') {
                    setUpdateInfo(data.info);
                } else if (data.status === 'downloaded') {
                    setUpdateInfo(data.info);
                    setDownloadPercent(100);
                } else if (data.status === 'error') {
                    setUpdateError(data.error);
                }
            });

            return () => {
                if (unsubscribe) unsubscribe();
            };
        }
    }, []);

    const handleCheckForUpdates = () => {
        if (!window.electronAPI) return; // Electron 환경에서만 동작
        setUpdateStatus('checking');
        setUpdateError(null);
        setDownloadPercent(0);
        window.electronAPI.checkForUpdates();
    };

    const handleStartDownload = () => {
        if (!window.electronAPI) return; // Electron 환경에서만 동작
        setUpdateStatus('downloading');
        setDownloadPercent(0);
        window.electronAPI.startDownload();
    };

    const handleRestartApp = () => {
        if (!window.electronAPI) return; // Electron 환경에서만 동작
        window.electronAPI.restartApp();
    };

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

    const [dbSettings, setDbSettings] = useState({
        currentProfile: 'local',
        local: {
            host: '',
            port: '15432',
            user: '',
            password: '',
            database: ''
        },
        remote: {
            host: '',
            port: '15432',
            user: '',
            password: '',
            database: ''
        }
    });
    const [dbTesting, setDbTesting] = useState(false);
    const [dbSaving, setDbSaving] = useState(false);

    React.useEffect(() => {
        if (activeTab === 'database') {
            fetch('/api/config/db')
                .then(res => res.json())
                .then(data => {
                    if (data && data.local && data.remote) {
                        setDbSettings({
                            currentProfile: data.currentProfile || 'local',
                            local: {
                                host: data.local.host || '',
                                port: data.local.port || '15432',
                                user: data.local.user || '',
                                database: data.local.database || '',
                                password: ''
                            },
                            remote: {
                                host: data.remote.host || '',
                                port: data.remote.port || '15432',
                                user: data.remote.user || '',
                                database: data.remote.database || '',
                                password: ''
                            }
                        });
                    }
                })
                .catch(err => console.error("Failed to load DB config:", err));
        }
    }, [activeTab]);

    const handleTestDB = async (profileType) => {
        setDbTesting(true);
        try {
            const targetConfig = dbSettings[profileType];
            const res = await fetch('/api/config/db/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...targetConfig,
                    profileType
                })
            });
            
            let result;
            try {
                result = await res.json();
            } catch (jsonErr) {
                throw new Error(`서버 응답 파싱 실패 (HTTP ${res.status})`);
            }

            if (res.ok && result.success) {
                alert(`[${profileType === 'local' ? '사내 로컬' : '외부 원격'}] 연결 테스트 성공: ` + result.message);
            } else {
                alert(`[${profileType === 'local' ? '사내 로컬' : '외부 원격'}] 연결 테스트 실패: ` + (result?.error || result?.message || '알 수 없는 오류'));
            }
        } catch (err) {
            alert('연결 테스트 에러: ' + err.message);
        } finally {
            setDbTesting(false);
        }
    };

    const handleSaveDB = async (e) => {
        e.preventDefault();
        setDbSaving(true);
        try {
            const res = await fetch('/api/config/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dbSettings)
            });
            
            let result;
            try {
                result = await res.json();
            } catch (jsonErr) {
                throw new Error(`서버 응답 파싱 실패 (HTTP ${res.status})`);
            }

            if (res.ok && result.success) {
                alert('설정이 성공적으로 저장되었습니다.');
                // Refresh settings state from server to update password placeholders securely
                fetch('/api/config/db')
                    .then(r => r.json())
                    .then(data => {
                        if (data && data.local && data.remote) {
                            setDbSettings({
                                currentProfile: data.currentProfile || 'local',
                                local: {
                                    ...data.local,
                                    password: '' // Clear input field while holding server side state
                                },
                                remote: {
                                    ...data.remote,
                                    password: ''
                                }
                            });
                        }
                    });
            } else {
                alert('설정 저장 실패: ' + (result?.error || result?.message || '알 수 없는 오류'));
            }
        } catch (err) {
            alert('설정 저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setDbSaving(false);
        }
    };

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
        <>
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

                        <button onClick={() => setActiveTab('database')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'database' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <Database size={18} /> DB 연동 설정 (PostgreSQL)
                        </button>
                        <button onClick={() => setActiveTab('email')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'email' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <Mail size={18} /> A/S 이메일 연동 (CS)
                        </button>
                        <button onClick={() => setActiveTab('api')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'api' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <Database size={18} strokeWidth={2} className="opacity-40" /> 외부 API 연동 (ECount 등)
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
                        <button onClick={() => setActiveTab('update')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === 'update' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <RefreshCw size={18} /> 시스템 자동 업데이트
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-y-auto p-8 relative">
                        
                        {activeTab === 'database' && (
                            <div className="max-w-3xl animate-fade-in">
                                <h2 className="text-lg font-black text-slate-900 mb-2">NAS PostgreSQL 데이터베이스 연동 설정</h2>
                                <p className="text-sm text-slate-500 font-medium mb-6">Synology NAS 등에 설치된 PostgreSQL 데이터베이스와의 실시간 동기화를 설정합니다. 설정을 변경하면 실시간으로 접속 풀이 갱신됩니다.</p>
                                
                                <form onSubmit={handleSaveDB} className="space-y-6">
                                    {/* Profile Switcher */}
                                    <div className="flex justify-between items-center mb-6">
                                        <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 w-fit">
                                            <button
                                                type="button"
                                                onClick={() => setDbSettings({ ...dbSettings, currentProfile: 'local' })}
                                                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dbSettings.currentProfile === 'local' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                사내 로컬 접속 Profile
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDbSettings({ ...dbSettings, currentProfile: 'remote' })}
                                                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dbSettings.currentProfile === 'remote' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                외부 원격(Tailscale) 접속 Profile
                                            </button>
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDbSettings({
                                                    ...dbSettings,
                                                    remote: {
                                                        ...dbSettings.local,
                                                        host: dbSettings.remote.host // Keep remote host
                                                    }
                                                })}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                                            >
                                                사내 설정을 외부로 복사 📋
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDbSettings({
                                                    ...dbSettings,
                                                    local: {
                                                        ...dbSettings.remote,
                                                        host: dbSettings.local.host // Keep local host
                                                    }
                                                })}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                                            >
                                                외부 설정을 사내로 복사 📋
                                            </button>
                                        </div>
                                    </div>

                                    {/* Local Connection Profile Forms */}
                                    {dbSettings.currentProfile === 'local' && (
                                        <div className="space-y-5 border border-indigo-200 rounded-2xl p-6 bg-slate-50/50 ring-2 ring-indigo-500/10">
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                                                <h3 className="text-sm font-black text-slate-800">1. 사내 로컬 접속 설정 (Local Presets)</h3>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800">
                                                    활성 상태
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">호스트 IP (Host)</label>
                                                    <input type="text" value={dbSettings.local.host} onChange={e => setDbSettings({...dbSettings, local: {...dbSettings.local, host: e.target.value}})} placeholder="192.168.0.7" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">포트 (Port)</label>
                                                    <input type="text" value={dbSettings.local.port} onChange={e => setDbSettings({...dbSettings, local: {...dbSettings.local, port: e.target.value}})} placeholder="15432" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">접속 계정 (Username)</label>
                                                    <input type="text" value={dbSettings.local.user} onChange={e => setDbSettings({...dbSettings, local: {...dbSettings.local, user: e.target.value}})} placeholder="postgres" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">데이터베이스 이름 (Database)</label>
                                                    <input type="text" value={dbSettings.local.database} onChange={e => setDbSettings({...dbSettings, local: {...dbSettings.local, database: e.target.value}})} placeholder="postgres" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-slate-700">비밀번호 (Password)</label>
                                                <input type="password" value={dbSettings.local.password} onChange={e => setDbSettings({...dbSettings, local: {...dbSettings.local, password: e.target.value}})} placeholder="변경시에만 입력하세요 (기존 암호 보존됨)" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleTestDB('local')} disabled={dbTesting || dbSaving} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black">
                                                    로컬 연결 테스트
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Remote Connection Profile Forms */}
                                    {dbSettings.currentProfile === 'remote' && (
                                        <div className="space-y-5 border border-indigo-200 rounded-2xl p-6 bg-slate-50/50 ring-2 ring-indigo-500/10">
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                                                <h3 className="text-sm font-black text-slate-800">2. 외부 원격 접속 설정 (Remote/Tailscale Presets)</h3>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800">
                                                    활성 상태
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">호스트 IP (Host/Tailscale IP)</label>
                                                    <input type="text" value={dbSettings.remote.host} onChange={e => setDbSettings({...dbSettings, remote: {...dbSettings.remote, host: e.target.value}})} placeholder="100.x.y.z" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">포트 (Port)</label>
                                                    <input type="text" value={dbSettings.remote.port} onChange={e => setDbSettings({...dbSettings, remote: {...dbSettings.remote, port: e.target.value}})} placeholder="15432" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">접속 계정 (Username)</label>
                                                    <input type="text" value={dbSettings.remote.user} onChange={e => setDbSettings({...dbSettings, remote: {...dbSettings.remote, user: e.target.value}})} placeholder="postgres" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-black text-slate-700">데이터베이스 이름 (Database)</label>
                                                    <input type="text" value={dbSettings.remote.database} onChange={e => setDbSettings({...dbSettings, remote: {...dbSettings.remote, database: e.target.value}})} placeholder="postgres" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" required />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-slate-700">비밀번호 (Password)</label>
                                                <input type="password" value={dbSettings.remote.password} onChange={e => setDbSettings({...dbSettings, remote: {...dbSettings.remote, password: e.target.value}})} placeholder="변경시에만 입력하세요 (기존 암호 보존됨)" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleTestDB('remote')} disabled={dbTesting || dbSaving} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black">
                                                    원격 연결 테스트
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="pt-4 border-t border-slate-100 flex gap-3">
                                        <button type="submit" disabled={dbTesting || dbSaving} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-sm">
                                            <Save size={16} /> 설정 저장 및 활성 프로필 적용
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

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

                                    {/* Odoo Bulk Sync Section */}
                                    <OdooBulkBOMSync />

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
                                <p className="text-sm text-slate-500 font-medium mb-8">ECO, 생산 등 시스템 전반의 프로세스 흐름을 제어합니다.</p>
                                
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
                                                <span className="text-sm font-bold text-slate-700">ECO 파생 모델(Derivatives) 변경 시 영업부서 검토 필수화</span>
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
                            <div className="max-w-4xl animate-fade-in text-slate-800">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                            <ShieldAlert className="text-indigo-600" size={22} /> 가입 사용자 권한 및 부서 설정
                                        </h2>
                                        <p className="text-sm text-slate-500 font-medium mt-1">
                                            가입된 팀원들의 계정을 확인하고, 각 팀원의 역할 권한(Role)과 부서(Department)를 매핑합니다.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleSaveRoles}
                                        disabled={loadingUsers || savingRoles || usersList.length === 0}
                                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-2.5 rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
                                    >
                                        <Save size={16} /> 변경 사항 저장
                                    </button>
                                </div>

                                {loadingUsers ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                                        <RefreshCw size={36} className="animate-spin text-indigo-500" />
                                        <span className="text-sm font-bold">가입 사용자 목록을 읽어오는 중...</span>
                                    </div>
                                ) : usersList.length === 0 ? (
                                    <div className="text-center py-20 bg-slate-50 border border-slate-200 border-dashed rounded-2xl">
                                        <ShieldAlert size={40} className="text-slate-300 mx-auto mb-3" />
                                        <p className="text-sm font-black text-slate-500">가입된 사용자가 없습니다</p>
                                        <p className="text-xs text-slate-400 mt-1">사용자 계정이 가입되면 여기에 자동으로 표시됩니다.</p>
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-400 uppercase tracking-wider select-none h-11">
                                                    <th className="px-6">사용자 정보</th>
                                                    <th className="px-6 w-[180px]">이메일 주소</th>
                                                    <th className="px-6 w-[160px]">소속 부서 (Department)</th>
                                                    <th className="px-6 w-[200px]">시스템 역할 권한 (Role)</th>
                                                    <th className="px-6 w-[130px] text-right">최근 로그인</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-150">
                                                {usersList.map((user) => {
                                                    const currentUpdate = userUpdates[user.uid] || {
                                                        role: user.role || 'viewer',
                                                        department: user.department || ''
                                                    };
                                                    
                                                    const formattedDate = user.lastLogin?.toDate 
                                                        ? user.lastLogin.toDate().toLocaleDateString('ko-KR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})
                                                        : (user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('ko-KR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '기록 없음');

                                                    return (
                                                        <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors h-14 text-xs font-bold text-slate-700">
                                                            {/* 정보 */}
                                                            <td className="px-6">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center overflow-hidden font-black text-xs shadow-inner animate-fade-in">
                                                                        {user.photoURL ? (
                                                                            <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            user.displayName?.[0] || '?'
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-black text-slate-900 text-xs">{user.displayName || '이름 없음'}</span>
                                                                        <span className="text-[10px] text-slate-400 font-bold mt-0.5">UID: {user.uid.slice(0, 8)}...</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            
                                                            {/* 이메일 */}
                                                            <td className="px-6 text-slate-500 text-xs font-medium truncate max-w-[180px]" title={user.email}>
                                                                {user.email}
                                                            </td>
                                                            
                                                            {/* 부서 */}
                                                            <td className="px-6">
                                                                <input
                                                                    type="text"
                                                                    value={currentUpdate.department}
                                                                    onChange={(e) => {
                                                                        setUserUpdates({
                                                                            ...userUpdates,
                                                                            [user.uid]: {
                                                                                ...currentUpdate,
                                                                                department: e.target.value
                                                                            }
                                                                        });
                                                                    }}
                                                                    placeholder="부서명 입력 (예: R&D)"
                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-inner"
                                                                />
                                                            </td>
                                                            
                                                            {/* 권한 */}
                                                            <td className="px-6">
                                                                <select
                                                                    value={currentUpdate.role}
                                                                    onChange={(e) => {
                                                                        setUserUpdates({
                                                                            ...userUpdates,
                                                                            [user.uid]: {
                                                                                ...currentUpdate,
                                                                                role: e.target.value
                                                                            }
                                                                        });
                                                                    }}
                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-inner"
                                                                >
                                                                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                                        <option key={val} value={val}>{label}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            
                                                            {/* 최근로그인 */}
                                                            <td className="px-6 text-right text-[10px] text-slate-400 font-medium">
                                                                {formattedDate}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'update' && (
                            <div className="max-w-2xl animate-fade-in text-slate-800">
                                <h2 className="text-lg font-black text-slate-900 mb-2">시스템 자동 업데이트 (GitHub Releases)</h2>
                                <p className="text-sm text-slate-500 font-medium mb-6">
                                    GitHub Releases를 연동하여 IR Assistant ERP 프로그램의 최신 버전을 검사하고 자동으로 설치합니다.
                                </p>

                                <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50 space-y-6 shadow-sm">
                                    {/* 현재 버전 & 상태 */}
                                    <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                                        <div>
                                            <span className="text-xs font-black text-slate-400 block">현재 버전 (Current Version)</span>
                                            <span className="text-lg font-bold text-slate-700">v{currentVersion}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs font-black text-slate-400 block text-right">상태 (Status)</span>
                                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-black mt-1 ${
                                                updateStatus === 'idle' ? 'bg-slate-200 text-slate-700' :
                                                updateStatus === 'checking' ? 'bg-amber-100 text-amber-800' :
                                                updateStatus === 'available' ? 'bg-blue-100 text-blue-800' :
                                                updateStatus === 'not-available' ? 'bg-emerald-100 text-emerald-800' :
                                                updateStatus === 'downloading' ? 'bg-indigo-100 text-indigo-800' :
                                                updateStatus === 'downloaded' ? 'bg-teal-100 text-teal-800' :
                                                'bg-rose-100 text-rose-800'
                                            }`}>
                                                {updateStatus === 'idle' && '대기 중'}
                                                {updateStatus === 'checking' && '업데이트 확인 중...'}
                                                {updateStatus === 'available' && '새 업데이트 발견!'}
                                                {updateStatus === 'not-available' && '최신 버전 사용 중'}
                                                {updateStatus === 'downloading' && '다운로드 중...'}
                                                {updateStatus === 'downloaded' && '다운로드 완료 (설치 대기)'}
                                                {updateStatus === 'error' && '에러 발생'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 상세 영역 */}
                                    {updateStatus === 'checking' && (
                                        <div className="flex items-center gap-3 py-2 text-slate-600 font-bold">
                                            <RefreshCw size={20} className="animate-spin text-indigo-500" />
                                            <span>새로운 버전이 있는지 GitHub에서 검색하는 중입니다...</span>
                                        </div>
                                    )}

                                    {updateStatus === 'not-available' && (
                                        <div className="py-2 text-emerald-700 font-bold">
                                            ✓ 현재 사용하고 있는 프로그램이 최신 버전입니다. 추가 조치가 필요하지 않습니다.
                                        </div>
                                    )}

                                    {updateStatus === 'available' && updateInfo && (
                                        <div className="space-y-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                                            <h3 className="text-sm font-black text-blue-800">
                                                새로운 버전(v{updateInfo.version})을 다운로드할 수 있습니다!
                                            </h3>
                                            {updateInfo.releaseNotes && (
                                                <div className="text-xs text-blue-600 font-medium">
                                                    <strong className="block mb-1">업데이트 노트:</strong>
                                                    <p className="whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-blue-100/60 mt-1 max-h-40 overflow-y-auto">{updateInfo.releaseNotes}</p>
                                                </div>
                                            )}
                                            <button
                                                onClick={handleStartDownload}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl text-sm transition-all mt-2 shadow-sm"
                                            >
                                                업데이트 다운로드 시작
                                            </button>
                                        </div>
                                    )}

                                    {updateStatus === 'downloading' && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-black text-slate-500">
                                                <span>업데이트 파일 다운로드 중...</span>
                                                <span>{Math.round(downloadPercent)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-indigo-600 h-full transition-all duration-300"
                                                    style={{ width: `${downloadPercent}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {updateStatus === 'downloaded' && (
                                        <div className="space-y-4 p-4 bg-teal-50 border border-teal-100 rounded-xl">
                                            <h3 className="text-sm font-black text-teal-800">
                                                업데이트 파일 다운로드가 완료되었습니다.
                                            </h3>
                                            <p className="text-xs text-teal-600 font-medium">
                                                프로그램을 재시작하면 새 버전(v{updateInfo?.version || ''})의 설치가 진행됩니다. 지금 재시작하시겠습니까?
                                            </p>
                                            <button
                                                onClick={handleRestartApp}
                                                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm"
                                            >
                                                설치 및 프로그램 재시작
                                            </button>
                                        </div>
                                    )}

                                    {updateStatus === 'error' && (
                                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl space-y-2">
                                            <h3 className="text-sm font-black text-rose-800 flex items-center gap-1.5">
                                                ⚠️ 업데이트 오류 발생
                                            </h3>
                                            <p className="text-xs text-rose-600 font-medium whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-rose-100/60 max-h-32 overflow-y-auto">
                                                {updateError || '알 수 없는 네트워크 오류가 발생했습니다.'}
                                            </p>
                                            <button
                                                onClick={handleCheckForUpdates}
                                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-lg transition-all"
                                            >
                                                재시도
                                            </button>
                                        </div>
                                    )}

                                    {/* 업데이트 시작 버튼 (idle / not-available 일 때 노출) */}
                                    {(updateStatus === 'idle' || updateStatus === 'not-available') && (
                                        <button
                                            onClick={handleCheckForUpdates}
                                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-2.5 rounded-xl text-sm shadow-md transition-all"
                                        >
                                            <RefreshCw size={16} />
                                            업데이트 확인
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
