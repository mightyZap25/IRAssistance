import React, { useState, useEffect, useRef, useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    FolderOpen, FilePlus, FolderPlus, Trash2, ChevronRight, ChevronDown,
    Save, FileText, Search, X, MoreVertical, Eye, Edit3, Columns, Table
} from 'lucide-react';

// ─── 파일 트리 노드 ─────────────────────────────────────────────
function FileNode({ node, depth = 0, onSelect, selectedPath, onRefresh, onDelete }) {
    const [open, setOpen] = useState(depth === 0);
    const [children, setChildren] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);

    const loadChildren = useCallback(async () => {
        if (!node.isDir) return;
        const items = await window.electronAPI.notes.listDir(node.path);
        setChildren(items);
        setLoaded(true);
    }, [node.path, node.isDir]);

    useEffect(() => {
        if (node.isDir && open && !loaded) loadChildren();
    }, [open, loaded, node.isDir, loadChildren]);

    useEffect(() => {
        if (node.isDir && open) loadChildren();
    }, [onRefresh]); // eslint-disable-line

    useEffect(() => {
        const close = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const isSelected = selectedPath === node.path;
    const isMd = !node.isDir && node.name.endsWith('.md');

    return (
        <div>
            <div
                className={`group flex items-center gap-1 px-2 py-[3px] rounded-md cursor-pointer text-[12px] transition-colors relative
                    ${isSelected
                        ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                onClick={() => {
                    if (node.isDir) setOpen(v => !v);
                    else if (isMd) onSelect(node);
                }}
            >
                {node.isDir
                    ? (open
                        ? <ChevronDown size={11} className="shrink-0 text-slate-400" />
                        : <ChevronRight size={11} className="shrink-0 text-slate-400" />)
                    : <span className="w-[11px] shrink-0" />
                }
                <span className="truncate flex-1">{node.name.replace(/\.md$/, '')}</span>

                <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shrink-0"
                    onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
                >
                    <MoreVertical size={11} />
                </button>
                {showMenu && (
                    <div ref={menuRef} className="absolute right-2 top-6 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 min-w-[120px]">
                        <button
                            className="w-full text-left px-3 py-1.5 text-[11px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                            onClick={async (e) => {
                                e.stopPropagation();
                                setShowMenu(false);
                                if (confirm(`"${node.name}"을(를) 삭제할까요?`)) {
                                    await window.electronAPI.notes.deleteFile(node.path);
                                    onDelete(node.path);
                                    onRefresh();
                                }
                            }}
                        >
                            <Trash2 size={11} /> 삭제
                        </button>
                    </div>
                )}
            </div>
            {node.isDir && open && loaded && (
                <div>
                    {children.map(child => (
                        <FileNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                            onRefresh={onRefresh}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── 표 삽입 팝업 ─────────────────────────────────────────────
function TableInsertModal({ onClose, onInsert }) {
    const [rows, setRows] = useState(3);
    const [cols, setCols] = useState(3);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 min-w-[280px] border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">표 삽입</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={15} /></button>
                </div>
                <div className="flex gap-4 mb-5">
                    <label className="flex flex-col gap-1 flex-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">열 (Column)</span>
                        <input type="number" min={1} max={10} value={cols} onChange={e => setCols(+e.target.value)}
                            className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-center bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    </label>
                    <label className="flex flex-col gap-1 flex-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">행 (Row)</span>
                        <input type="number" min={1} max={20} value={rows} onChange={e => setRows(+e.target.value)}
                            className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-center bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    </label>
                </div>
                <div className="mb-5 overflow-auto max-h-[120px]">
                    <table className="border-collapse text-[10px] w-full">
                        {Array.from({ length: rows + 1 }).map((_, r) => (
                            <tr key={r}>
                                {Array.from({ length: cols }).map((_, c) => (
                                    <td key={c} className={`border border-slate-300 dark:border-slate-600 px-2 py-1 ${r === 0 ? 'bg-slate-100 dark:bg-slate-700 font-bold text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {r === 0 ? `열${c + 1}` : '·'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </table>
                </div>
                <button
                    onClick={() => { onInsert(rows, cols); onClose(); }}
                    className="w-full py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                    삽입
                </button>
            </div>
        </div>
    );
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function NotesPage() {
    const [vaultPath, setVaultPath] = useState(() => localStorage.getItem('notes_vault') || null);
    const [rootItems, setRootItems] = useState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [content, setContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'live' | 'preview'
    const [refreshKey, setRefreshKey] = useState(0);
    const [newItemName, setNewItemName] = useState('');
    const [showNewFile, setShowNewFile] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [showTableModal, setShowTableModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const saveTimerRef = useRef(null);

    const isDirty = content !== savedContent;

    // ── 볼트 로드 ────────────────────────────────────────────
    const loadRoot = useCallback(async (p) => {
        const items = await window.electronAPI.notes.listDir(p);
        setRootItems(items);
    }, []);

    useEffect(() => {
        if (vaultPath) loadRoot(vaultPath);
    }, [vaultPath, refreshKey, loadRoot]);

    const openFolder = async () => {
        const p = await window.electronAPI.notes.openFolder();
        if (p) {
            setVaultPath(p);
            localStorage.setItem('notes_vault', p);
            setSelectedNode(null);
            setContent('');
            setSavedContent('');
        }
    };

    // ── 파일 선택 ────────────────────────────────────────────
    const handleSelect = async (node) => {
        if (isDirty && selectedNode) {
            if (!confirm('저장하지 않은 변경사항이 있습니다. 이동할까요?')) return;
        }
        setSelectedNode(node);
        const text = await window.electronAPI.notes.readFile(node.path);
        setContent(text ?? '');
        setSavedContent(text ?? '');
    };

    // ── 저장 ─────────────────────────────────────────────────
    const save = useCallback(async () => {
        if (!selectedNode) return;
        setSaving(true);
        await window.electronAPI.notes.writeFile(selectedNode.path, content);
        setSavedContent(content);
        setSaving(false);
    }, [selectedNode, content]);

    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [save]);

    useEffect(() => {
        if (!selectedNode || content === savedContent) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(save, 3000);
        return () => clearTimeout(saveTimerRef.current);
    }, [content, save, selectedNode, savedContent]);

    // ── 새 파일/폴더 ─────────────────────────────────────────
    const createFile = async () => {
        if (!newItemName.trim() || !vaultPath) return;
        const dir = selectedNode?.isDir ? selectedNode.path : vaultPath;
        const p = await window.electronAPI.notes.createFile(dir, newItemName.trim());
        setNewItemName('');
        setShowNewFile(false);
        setRefreshKey(k => k + 1);
        if (p) {
            const node = { name: newItemName.trim().replace(/\.md$/, '') + '.md', path: p, isDir: false };
            handleSelect(node);
        }
    };

    const createFolder = async () => {
        if (!newItemName.trim() || !vaultPath) return;
        const dir = selectedNode?.isDir ? selectedNode.path : vaultPath;
        await window.electronAPI.notes.createDir(dir, newItemName.trim());
        setNewItemName('');
        setShowNewFolder(false);
        setRefreshKey(k => k + 1);
    };

    // ── 표 삽입 ───────────────────────────────────────────────
    const insertTable = (rows, cols) => {
        const header = '| ' + Array.from({ length: cols }, (_, i) => `열${i + 1}`).join(' | ') + ' |';
        const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
        const dataRow = '| ' + Array.from({ length: cols }, () => '  ').join(' | ') + ' |';
        const tableStr = '\n' + header + '\n' + sep + '\n' + Array.from({ length: rows }, () => dataRow).join('\n') + '\n';
        setContent(prev => prev + tableStr);
    };

    const filterItems = (items, q) => {
        if (!q) return items;
        return items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
    };

    // ── 빈 상태 ───────────────────────────────────────────────
    if (!vaultPath) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-5 bg-slate-50 dark:bg-slate-900">
                <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center">
                    <FileText size={32} className="text-violet-500" />
                </div>
                <div className="text-center">
                    <p className="text-slate-800 dark:text-slate-200 font-bold text-lg">노트 폴더를 선택하세요</p>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Obsidian Vault 또는 .md 파일이 있는 폴더를 선택하면 시작됩니다</p>
                </div>
                <button
                    onClick={openFolder}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-violet-200 dark:shadow-violet-900/30"
                >
                    <FolderOpen size={16} /> 폴더 열기
                </button>
            </div>
        );
    }

    const displayItems = filterItems(rootItems, searchQuery);

    return (
        <div className="h-full flex bg-white dark:bg-slate-900 overflow-hidden font-sans" data-color-mode="light">
            {showTableModal && (
                <TableInsertModal
                    onClose={() => setShowTableModal(false)}
                    onInsert={insertTable}
                />
            )}

            {/* ─── 파일 트리 사이드바 ─── */}
            <div className="w-56 shrink-0 border-r border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50/70 dark:bg-slate-950/60">
                <div className="px-3 pt-3 pb-2 shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate max-w-[100px]">
                            {vaultPath.split('/').pop()}
                        </span>
                        <div className="flex items-center gap-0.5">
                            <button onClick={() => { setShowNewFile(true); setShowNewFolder(false); setNewItemName(''); }} title="새 노트" className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><FilePlus size={13} /></button>
                            <button onClick={() => { setShowNewFolder(true); setShowNewFile(false); setNewItemName(''); }} title="새 폴더" className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><FolderPlus size={13} /></button>
                            <button onClick={openFolder} title="폴더 바꾸기" className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><FolderOpen size={13} /></button>
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="파일 검색..."
                            className="w-full pl-6 pr-2 py-1 text-[11px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:text-slate-300 placeholder-slate-400"
                        />
                    </div>
                </div>

                {(showNewFile || showNewFolder) && (
                    <div className="px-3 pb-2 shrink-0 flex gap-1">
                        <input
                            autoFocus
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') showNewFile ? createFile() : createFolder();
                                if (e.key === 'Escape') { setShowNewFile(false); setShowNewFolder(false); }
                            }}
                            placeholder={showNewFile ? '파일명.md' : '폴더명'}
                            className="flex-1 px-2 py-1 text-[11px] rounded-lg border border-sky-400 focus:outline-none bg-white dark:bg-slate-800 dark:text-white"
                        />
                        <button onClick={showNewFile ? createFile : createFolder} className="px-2 py-1 bg-sky-500 text-white rounded-lg text-[11px] font-bold hover:bg-sky-600">생성</button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
                    {displayItems.map(item => (
                        <FileNode
                            key={item.path}
                            node={item}
                            depth={0}
                            onSelect={handleSelect}
                            selectedPath={selectedNode?.path}
                            onRefresh={() => setRefreshKey(k => k + 1)}
                            onDelete={(p) => {
                                if (selectedNode?.path === p) {
                                    setSelectedNode(null);
                                    setContent('');
                                    setSavedContent('');
                                }
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* ─── 에디터 영역 ─── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {selectedNode ? (
                    <>
                        {/* 상단 바 */}
                        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
                            <FileText size={13} className="text-slate-400 shrink-0" />
                            <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 truncate flex-1">
                                {selectedNode.name}
                            </span>

                            {/* 표 삽입 */}
                            {viewMode !== 'preview' && (
                                <button
                                    onClick={() => setShowTableModal(true)}
                                    title="표 삽입"
                                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                >
                                    <Table size={14} />
                                </button>
                            )}

                            {/* 뷰 모드 토글 */}
                            <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                                <button
                                    onClick={() => setViewMode('edit')}
                                    title="편집 모드"
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'edit' ? 'bg-sky-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                >
                                    <Edit3 size={13} />
                                </button>
                                <button
                                    onClick={() => setViewMode('live')}
                                    title="편집 + 실시간 미리보기"
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'live' ? 'bg-sky-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                >
                                    LIVE
                                </button>
                                <button
                                    onClick={() => setViewMode('preview')}
                                    title="미리보기 전용"
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'preview' ? 'bg-sky-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                >
                                    <Eye size={13} />
                                </button>
                            </div>

                            {/* 저장 상태 */}
                            <span className={`text-[10px] font-semibold transition-colors ${isDirty ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {saving ? '저장 중...' : isDirty ? '● 미저장' : '✓ 저장됨'}
                            </span>
                            <button
                                onClick={save}
                                disabled={!isDirty}
                                className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 rounded-lg text-[11px] font-bold transition-colors hover:bg-sky-600 disabled:cursor-default"
                            >
                                <Save size={12} /> 저장
                            </button>
                        </div>

                        {/* ─── MDEditor ─── */}
                        <div className="flex-1 overflow-hidden notes-md-editor">
                            {viewMode === 'preview' ? (
                                // 읽기 전용 프리뷰
                                <div className="h-full overflow-y-auto p-8 bg-white dark:bg-slate-900 custom-scrollbar">
                                    <div className="max-w-3xl mx-auto prose prose-slate dark:prose-invert
                                        prose-headings:font-bold prose-headings:text-slate-800 dark:prose-headings:text-slate-200
                                        prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-relaxed
                                        prose-a:text-sky-600 dark:prose-a:text-sky-400
                                        prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-rose-600
                                        prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950 prose-pre:rounded-xl
                                        prose-blockquote:border-l-4 prose-blockquote:border-sky-400 prose-blockquote:bg-sky-50 dark:prose-blockquote:bg-sky-950/30 prose-blockquote:py-1
                                        prose-table:w-full prose-th:bg-slate-100 dark:prose-th:bg-slate-800 prose-th:font-semibold
                                        prose-li:text-slate-700 dark:prose-li:text-slate-300
                                        prose-hr:border-slate-200 dark:prose-hr:border-slate-700">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}
                                            components={{ input: ({ node, ...props }) => <input {...props} className="mr-1.5 accent-sky-500" /> }}
                                        >
                                            {content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ) : (
                                // MDEditor (edit = 편집만, live = 편집+미리보기 분할)
                                <MDEditor
                                    value={content}
                                    onChange={(val) => setContent(val ?? '')}
                                    preview={viewMode === 'live' ? 'live' : 'edit'}
                                    height="100%"
                                    visibleDragbar={false}
                                    hideToolbar={false}
                                    style={{ height: '100%', borderRadius: 0, border: 'none' }}
                                    textareaProps={{
                                        placeholder: '마크다운으로 작성하세요...',
                                        style: { fontSize: '14px', lineHeight: '1.7' }
                                    }}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                        <FileText size={40} />
                        <p className="text-sm font-medium">파일을 선택하세요</p>
                        <p className="text-xs text-slate-300 dark:text-slate-700">왼쪽 파일 목록에서 .md 파일을 클릭하세요</p>
                    </div>
                )}
            </div>
        </div>
    );
}
