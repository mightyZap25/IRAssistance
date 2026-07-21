import React, { useState } from 'react';
import { Database, UploadCloud, CheckCircle2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function OdooGoogleDriveSync() {
    const [syncingAll, setSyncingAll] = useState(false);
    const [syncingSchema, setSyncingSchema] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const triggerSync = async (actionType) => {
        if (actionType === 'schema') setSyncingSchema(true);
        else setSyncingAll(true);
        
        setErrorMsg('');
        setSuccessMsg('');

        try {
            let sessionId = null;
            if (window.electronAPI && window.electronAPI.getOdooSessionId) {
                sessionId = await window.electronAPI.getOdooSessionId();
            }

            const response = await fetch('/api/odoo/sync-google-drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actionType, sessionId })
            });
            
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Odoo 전송 실패');
            }
            
            setSuccessMsg(actionType === 'schema' ? '스키마 백업이 완료되었습니다!' : '전체 데이터 백업이 시작되었습니다. (백그라운드 진행)');
        } catch (err) {
            console.error(err);
            setErrorMsg("오류가 발생했습니다: " + err.message);
        } finally {
            if (actionType === 'schema') setSyncingSchema(false);
            else setSyncingAll(false);
        }
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 mt-6">
            <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <UploadCloud size={18} className="text-blue-600" /> 
                    Odoo to Google Drive 데이터/스키마 백업
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-bold">
                    Odoo의 기존 영업/구매/생산/재고 데이터를 구글 드라이브로 수동 전송하거나, 현재 테이블 구조(스키마)를 내보냅니다.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 p-5 rounded-xl flex flex-col justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-2">기존 데이터 전체 동기화</h4>
                        <p className="text-xs text-slate-500 mb-4">영업, 구매, 생산, 재고 모듈의 기존 전체 데이터를 백그라운드에서 구글 드라이브로 강제 전송합니다.</p>
                    </div>
                    <button
                        onClick={() => triggerSync('all_data')}
                        disabled={syncingAll}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-black text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-all w-full"
                    >
                        {syncingAll ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                        전체 데이터 백업 실행
                    </button>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-xl flex flex-col justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-2">DB 스키마 동기화</h4>
                        <p className="text-xs text-slate-500 mb-4">현재 동기화 중인 주요 테이블 구조(필드 목록)를 구글 드라이브에 CSV 형태로 저장합니다.</p>
                    </div>
                    <button
                        onClick={() => triggerSync('schema')}
                        disabled={syncingSchema}
                        className="px-4 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-800 font-black text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-all w-full"
                    >
                        {syncingSchema ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                        스키마 내보내기
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-start gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}
            
            {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold rounded-xl flex items-start gap-2">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}
        </div>
    );
}
