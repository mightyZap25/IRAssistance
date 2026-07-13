import React, { useState, useEffect } from 'react';
import { ArrowDownToLine, RefreshCw, AlertCircle, Sparkles, X, CheckCircle } from 'lucide-react';

export default function UpdateNotificationModal() {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [status, setStatus] = useState('idle'); // idle | checking | available | not-available | downloading | downloaded | error
    const [percent, setPercent] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;

        let isManual = false; // 수동/자동 체크 구분용 플래그

        // 리스너 등록
        const unsubscribe = window.electronAPI.onUpdateMessage((data) => {
            console.log('[UpdateModal] Received update message:', data);
            const { status: updateStatus, info, percent: pct, error } = data;
            
            // 자동 백그라운드 체크 중 'not-available'(최신버전)인 경우 팝업을 띄우지 않고 조용히 무시함
            if (!isManual && updateStatus === 'not-available') {
                setStatus('idle');
                return;
            }
            
            setStatus(updateStatus);

            if (updateStatus === 'available') {
                setUpdateInfo(info);
                setIsOpen(true);
            } else if (updateStatus === 'downloading') {
                setPercent(pct || 0);
            } else if (updateStatus === 'downloaded') {
                setPercent(100);
            } else if (updateStatus === 'error') {
                // 자동 백그라운드 체크 중 에러가 발생한 경우 방해되지 않도록 팝업 미노출
                if (isManual) {
                    setErrorMsg(error || '업데이트 확인 중 에러가 발생했습니다.');
                } else {
                    setStatus('idle');
                }
            }

            // 조회 완료 시 플래그 초기화
            if (updateStatus === 'not-available' || updateStatus === 'error') {
                isManual = false;
            }
        });

        // 수동 업데이트 체크 리스너
        const handleManualCheck = () => {
            isManual = true;
            setIsOpen(true);
            setStatus('checking');
            setErrorMsg('');
            if (window.electronAPI) {
                window.electronAPI.checkForUpdates();
            }
        };

        window.addEventListener('manual-update-check', handleManualCheck);

        // 앱 켜지고 10초 후 백그라운드 체크 1회 자동 실행
        const timer = setTimeout(() => {
            if (window.electronAPI) window.electronAPI.checkForUpdates();
        }, 10000);

        // 2시간마다 주기적으로 백그라운드 업데이트 체크 실행
        const intervalTimer = setInterval(() => {
            if (window.electronAPI) window.electronAPI.checkForUpdates();
        }, 2 * 60 * 60 * 1000);

        return () => {
            if (unsubscribe) unsubscribe();
            window.removeEventListener('manual-update-check', handleManualCheck);
            clearTimeout(timer);
            clearInterval(intervalTimer);
        };
    }, []);

    const handleDownload = () => {
        if (window.electronAPI) {
            window.electronAPI.startDownload();
        }
        setStatus('downloading');
        setPercent(0);
    };

    const handleInstall = () => {
        if (window.electronAPI) {
            window.electronAPI.restartApp();
        }
    };

    // 사용자가 팝업을 닫았거나 idle 상태일 때만 렌더링 안 함
    if (!isOpen || status === 'idle') return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 rounded-3xl w-full max-w-[420px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col backdrop-blur-md relative transform scale-100 transition-all animate-in zoom-in-95 duration-200">
                
                {/* Close Button (다운로드 도중에는 닫지 못하도록 방지) */}
                {status !== 'downloading' && (
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-1.5 rounded-full transition-colors z-10"
                    >
                        <X size={14} />
                    </button>
                )}

                {/* Header Style (Gradient) */}
                <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 px-6 py-8 text-white flex flex-col items-center justify-center text-center relative overflow-hidden select-none">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl -translate-y-8 translate-x-8" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/20 rounded-full blur-lg translate-y-8 -translate-x-8" />
                    
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-4 border border-white/10 shadow-inner">
                        {status === 'downloaded' ? (
                            <CheckCircle size={24} className="text-emerald-300 animate-bounce" />
                        ) : (
                            <Sparkles size={24} className="text-yellow-300 animate-pulse" />
                        )}
                    </div>
                    
                    <h2 className="text-lg font-black tracking-tight">시스템 업데이트 안내</h2>
                    <p className="text-[11px] text-indigo-200 font-bold mt-1">IR Assistant ERP의 새로운 빌드가 감지되었습니다.</p>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col gap-5 bg-white">
                    {/* Checking Stage */}
                    {status === 'checking' && (
                        <div className="flex flex-col items-center justify-center py-6 gap-3">
                            <RefreshCw size={24} className="animate-spin text-indigo-600" />
                            <span className="text-xs font-bold text-slate-500">최신 업데이트 정보를 조회하는 중...</span>
                        </div>
                    )}

                    {/* Not Available (Up to date) Stage */}
                    {status === 'not-available' && (
                        <div className="p-4 bg-sky-50 border border-sky-100 rounded-2xl text-center flex flex-col gap-1">
                            <span className="text-xs font-extrabold text-sky-850">
                                ✨ 최신 버전을 사용하고 있습니다.
                            </span>
                            <p className="text-[10px] text-sky-600 font-bold leading-normal">
                                현재 프로그램 버전은 최신 상태입니다.
                            </p>
                        </div>
                    )}

                    {/* Version Display */}
                    {updateInfo && (status !== 'checking' && status !== 'not-available') && (
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">신규 버전</span>
                                <span className="text-sm font-black text-slate-800">v{updateInfo.version}</span>
                            </div>
                            {updateInfo.releaseDate && (
                                <div className="flex flex-col text-right">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">배포 일자</span>
                                    <span className="text-xs font-bold text-slate-600">{new Date(updateInfo.releaseDate).toLocaleDateString('ko-KR')}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Release Notes */}
                    {status === 'available' && updateInfo?.releaseNotes && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">주요 변경 사항</span>
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs font-bold text-slate-600 max-h-32 overflow-y-auto leading-relaxed whitespace-pre-wrap shadow-inner">
                                {updateInfo.releaseNotes}
                            </div>
                        </div>
                    )}

                    {/* Downloading Status */}
                    {status === 'downloading' && (
                        <div className="flex flex-col gap-2.5">
                            <div className="flex justify-between items-center text-xs font-black text-indigo-655">
                                <span className="flex items-center gap-1.5">
                                    <RefreshCw size={12} className="animate-spin text-indigo-500" />
                                    최신 버전 다운로드 중...
                                </span>
                                <span>{Math.round(percent)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 border border-slate-200/50 h-3 rounded-full overflow-hidden p-0.5 shadow-inner">
                                <div 
                                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Downloaded / Final Stage */}
                    {status === 'downloaded' && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                            <span className="text-[11px] font-black text-emerald-800">
                                📦 다운로드 완료! 즉시 설치 준비가 되었습니다.
                            </span>
                            <p className="text-[10px] text-emerald-600 font-bold mt-1 leading-normal">
                                프로그램을 재시작하면 새 버전의 설치 마법사가 자동으로 작동합니다.
                            </p>
                        </div>
                    )}

                    {/* Error Stage */}
                    {status === 'error' && (
                        <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5">
                            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <span className="text-xs font-black text-rose-800">업데이트 처리 중 에러 발생</span>
                                <p className="text-[10px] text-rose-650 font-bold mt-0.5 truncate">{errorMsg || '알 수 없는 네트워크 오류'}</p>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="pt-2">
                        {status === 'checking' && (
                            <button 
                                disabled
                                className="w-full bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed font-black py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} className="animate-spin text-slate-400" /> 최신 버전 확인 중...
                            </button>
                        )}
                        {status === 'not-available' && (
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                            >
                                확인
                            </button>
                        )}
                        {status === 'available' && (
                            <button 
                                onClick={handleDownload}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-indigo-100 hover:shadow-lg flex items-center justify-center gap-2"
                            >
                                <ArrowDownToLine size={16} /> 업데이트 다운로드 시작
                            </button>
                        )}
                        {status === 'downloading' && (
                            <button 
                                disabled
                                className="w-full bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed font-black py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} className="animate-spin" /> 다운로드 완료 대기 중...
                            </button>
                        )}
                        {status === 'downloaded' && (
                            <button 
                                onClick={handleInstall}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-emerald-100 hover:shadow-lg flex items-center justify-center gap-2"
                            >
                                🚀 지금 설치 및 재시작
                            </button>
                        )}
                        {status === 'error' && (
                            <button 
                                onClick={() => {
                                    setStatus('checking');
                                    if (window.electronAPI) window.electronAPI.checkForUpdates();
                                }}
                                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-rose-100 flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} /> 다시 시도
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
