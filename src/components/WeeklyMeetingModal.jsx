import React, { useState } from 'react';
import { X, Loader, Table2 } from 'lucide-react';
import { fetchDrive } from '../services/googleService';

const DEPARTMENTS = ['개발부서', '생산부서', '품질부서', '영업부서'];

// 주간 회의록 최상위 폴더 ID (본인 환경의 Drive 폴더 ID로 교체 필요)
const WEEKLY_ROOT_FOLDER_ID = '1ri7Wac0KxC5ze9mLinX01xUTfzRzkrWL';

/**
 * 특정 부모 폴더 아래에 해당 이름의 폴더가 있으면 ID를 반환하고,
 * 없으면 새로 생성 후 ID를 반환한다.
 */
async function getOrCreateFolder(parentFolderId, folderName) {
    // 기존 폴더 검색
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`
    )}&fields=files(id,name)`;

    const res = await fetchDrive(searchUrl);
    if (res.files && res.files.length > 0) {
        return res.files[0].id;
    }

    // 새 폴더 생성
    const createRes = await fetchDrive('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId]
        })
    });
    return createRes.id;
}

/**
 * 연도 > 부서명 폴더 경로에 구글 시트 파일 자동 생성
 */
async function createWeeklySheet({ department, year, dateStr }) {
    // 1. 연도 폴더 확보
    const yearFolderId = await getOrCreateFolder(WEEKLY_ROOT_FOLDER_ID, `${year}년`);
    // 2. 부서 폴더 확보
    const deptFolderId = await getOrCreateFolder(yearFolderId, department);

    // 3. 문서 제목
    const title = `${dateStr} ${department} 주간 업무 보고`;

    // 4. CSV 템플릿
    const csvContent = `\uFEFF주간 업무 보고서,,,
부서,${department},,
작성일,${dateStr},,
작성자,,,

1. 이번 주 완료 업무
업무 내용,담당자,완료일,비고
,,,
,,,

2. 다음 주 계획
업무 내용,담당자,예정일,비고
,,,
,,,

3. 이슈 / 문제점
내용,중요도,담당자,해결 예정일
,,,
,,,
`;

    // 5. multipart upload
    const metadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [deptFolderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([csvContent], { type: 'text/csv' }));

    const file = await fetchDrive(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        { method: 'POST', body: form }
    );

    const link = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
    return { fileId: file.id, link, title };
}

export default function WeeklyMeetingModal({ isOpen, onClose, onSave }) {
    const [department, setDepartment] = useState(DEPARTMENTS[0]);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        setError('');
        setCreating(true);
        try {
            const year = date.slice(0, 4);
            const { fileId, link, title } = await createWeeklySheet({
                department,
                year,
                dateStr: date
            });

            await onSave({
                department,
                date: new Date(date),
                year: Number(year),
                link,
                fileId,
                title
            });

            onClose();
        } catch (err) {
            console.error('[WeeklyMeetingModal] Error:', err);
            setError(err.message || '구글 시트 생성 중 오류가 발생했습니다.');
        } finally {
            setCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">주간 보고서 신규 생성</h2>
                        <p className="text-xs text-slate-400 font-bold mt-1">부서와 날짜를 선택하면 구글 시트를 자동으로 만들어드립니다.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* 부서 선택 */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">담당 부서</label>
                        <div className="grid grid-cols-2 gap-2">
                            {DEPARTMENTS.map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setDepartment(d)}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-black border-2 transition-all ${
                                        department === d
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                                    }`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 날짜 선택 */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider ml-1">회의 일자</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>

                    {/* 생성될 경로 미리보기 */}
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <p className="text-[10px] font-black text-emerald-700 mb-1">📁 생성 경로</p>
                        <p className="text-[11px] font-bold text-emerald-600">주간 회의 &gt; {date.slice(0, 4)}년 &gt; {department}</p>
                        <p className="text-[10px] text-emerald-500 mt-0.5 truncate">📊 {date} {department} 주간 업무 보고</p>
                    </div>

                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                            <p className="text-[11px] font-bold text-rose-600">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-6 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-all">
                        취소
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-200 transition-all"
                    >
                        {creating ? (
                            <><Loader size={14} className="animate-spin" /> 생성 중...</>
                        ) : (
                            <><Table2 size={14} /> 구글 시트 자동 생성</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
