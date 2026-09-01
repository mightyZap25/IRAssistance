import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    FolderOpen, FilePlus, FolderPlus, Trash2, ChevronRight, ChevronDown,
    Save, FileText, Search, X, MoreVertical, ImagePlus, Code, Eye
} from 'lucide-react';
import { ResizableBox } from 'react-resizable';
import { useAuth } from '../contexts/AuthContext';
import FindInPageBar from '../components/common/FindInPageBar';
import 'react-resizable/css/styles.css';
import { BlockNoteEditor } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// ─── BlockNote 에디터 래퍼 ─────────────────────────────────────
function BlockNoteEditorWrapper({ initialMarkdown, onChange, vaultPath, filePath, editorRef }) {
    const [editor, setEditor] = useState(null);

    useEffect(() => {
        let isMounted = true;
        async function initEditor() {
            try {
                // 1. GitHub 알림 구문을 볼드체로 자동 치환
                let normalizedMd = (initialMarkdown || '')
                    .replace(/^>\s*\[!CAUTION\]/gim, '> **CAUTION**')
                    .replace(/^>\s*\[!WARNING\]/gim, '> **WARNING**')
                    .replace(/^>\s*\[!NOTE\]/gim, '> **NOTE**')
                    .replace(/^>\s*\[!TIP\]/gim, '> **TIP**');

                // 2. Obsidian 스타일 이미지 ![[...]] 치환 (로컬 파일 탐색)
                const imageRegex = /!\[\[([^\]]+\.(?:png|jpg|jpeg|gif|svg|webp))\]\]/gi;
                const matches = [...normalizedMd.matchAll(imageRegex)];
                
                if (matches.length > 0) {
                    await Promise.all(matches.map(async (match) => {
                        const filename = match[1];
                        let absPath = null;
                        
                        if (window.electronAPI?.notes?.findFile && vaultPath) {
                            absPath = await window.electronAPI.notes.findFile(vaultPath, filename);
                        }
                        
                        // Fallback: If not found in vault, assume it's in the same directory as the markdown file
                        if (!absPath && filePath) {
                            const dir = filePath.substring(0, Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')));
                            absPath = `${dir}\\${filename}`;
                        }

                        if (absPath) {
                            // BlockNote 파서가 file:/// URI를 차단할 수 있으므로, 로컬 Express 서버를 통해 우회하여 서빙합니다.
                            const fileUri = `http://localhost:5050/api/local-image?path=${encodeURIComponent(absPath)}`;
                            // 중요: BlockNote는 '인라인(Inline) 이미지'를 지원하지 않습니다. 
                            // 텍스트와 이미지 사이에 빈 줄이 없으면 인라인으로 파싱되어 텍스트로 무시됩니다.
                            normalizedMd = normalizedMd.replace(match[0], `\n\n![${filename}](${fileUri})\n\n`);
                        }
                    }));
                }
                // 3. 복잡한 마크다운 테이블 정규화
                // Phase 1: \ 줄이음 멀티라인 셀을 먼저 한 줄로 합치기
                //   예) "| h1 | h2\         ← 이 줄은 \로 끝나므로
                //         continued |"      ← 다음 줄과 이어짐
                const rawLines = normalizedMd.split('\n');
                const joinedLines = [];
                let i = 0;
                while (i < rawLines.length) {
                    let line = rawLines[i];
                    // 줄이 \로 끝나고 (공백 제거 후) 다음 줄이 있으면 이어붙이기
                    while (/\\\s*$/.test(line) && i + 1 < rawLines.length) {
                        // 끝의 \ 제거하고 다음 줄과 합치기
                        line = line.replace(/\\\s*$/, ' ') + rawLines[i + 1].trim();
                        i++;
                    }
                    joinedLines.push(line);
                    i++;
                }

                // Phase 1.5: 테이블 행 사이의 빈 줄 제거 (빈 줄이 있으면 테이블이 끊어짐)
                const contiguousLines = [];
                for (let j = 0; j < joinedLines.length; j++) {
                    const line = joinedLines[j];
                    if (line.trim() === '') {
                        // 이전 유효 라인 찾기
                        let prev = '';
                        for (let l = contiguousLines.length - 1; l >= 0; l--) {
                            if (contiguousLines[l].trim() !== '') {
                                prev = contiguousLines[l].trim();
                                break;
                            }
                        }
                        // 다음 유효 라인 찾기
                        let k = j + 1;
                        while (k < joinedLines.length && joinedLines[k].trim() === '') k++;
                        let next = k < joinedLines.length ? joinedLines[k].trim() : '';

                        const isPrevTable = prev.startsWith('|') && prev.endsWith('|');
                        const isNextTable = next.startsWith('|') && next.endsWith('|');

                        if (isPrevTable && isNextTable) {
                            continue; // 테이블 사이의 빈 줄은 무시하여 하나로 이어지게 함
                        }
                    }
                    contiguousLines.push(line);
                }

                // Phase 2: 테이블 행 단위 정리
                normalizedMd = contiguousLines.reduce((acc, line) => {
                    const trimmed = line.trim();
                    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');
                    if (isTableRow) {
                        // 셀 내부 연속 공백 정리 (정렬용 패딩 제거)
                        let cleanLine = line.replace(/[ \t]{2,}/g, ' ');
                        
                        // 구분선 행인지 확인
                        const isSeparator = /^\|\s*[-:]+[-|\s:]*\|$/.test(trimmed);
                        if (!isSeparator) {
                            // 모든 데이터 셀이 비어있는 행은 제거 (병합 셀 시각 표현 제거)
                            const cells = cleanLine.split('|').slice(1, -1);
                            const allEmpty = cells.every(c => c.trim() === '');
                            if (allEmpty) return acc;
                        }
                        acc.push(cleanLine);
                    } else {
                        acc.push(line);
                    }
                    return acc;
                }, []).join('\n');

                const tempEditor = BlockNoteEditor.create();
                const blocks = await tempEditor.tryParseMarkdownToBlocks(normalizedMd);
                if (!isMounted) return;
                
                const newEditor = BlockNoteEditor.create({ 
                    initialContent: blocks,
                    dictionary: ko,
                    uploadFile: async (file) => {
                        const arrayBuffer = await file.arrayBuffer();
                        let targetDir = vaultPath;
                        if (filePath) {
                            targetDir = filePath.substring(0, Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')));
                        }
                        
                        // Obsidian 스타일의 파일명 생성 (예: Pasted image 123456789.png)
                        let ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.png';
                        const newFileName = `Pasted image ${new Date().getTime()}${ext}`;
                        const targetPath = `${targetDir}\\${newFileName}`;
                        
                        const success = await window.electronAPI.notes.saveImage(targetPath, arrayBuffer);
                        if (success) {
                            return `http://localhost:5050/api/local-image?path=${encodeURIComponent(targetPath)}`;
                        }
                        throw new Error('Failed to save image locally');
                    }
                });
                if (editorRef) editorRef.current = newEditor;
                setEditor(newEditor);
            } catch (e) {
                console.error("Failed to parse markdown:", e);
                if (isMounted) {
                    setEditor(BlockNoteEditor.create());
                }
            }
        }
        initEditor();
        return () => { isMounted = false; };
    }, []); // mount 시 한 번만 실행 (key={selectedPath} 로 제어됨)

    if (!editor) return <div className="p-8 text-slate-400 text-sm">에디터 로딩 중...</div>;

    const isDark = document.documentElement.classList.contains('dark');

    return (
        <BlockNoteView 
            editor={editor} 
            onChange={async () => {
                let md = await editor.blocksToMarkdownLossy(editor.document);
                
                // 역치환: 로컬 HTTP 경로로 저장된 이미지를 원래의 Obsidian ![[...]] 형태로 복구
                // alt 텍스트 대신 실제 파일 경로(path 파라미터)에서 파일명을 추우해서 완벽하게 복구
                const backRegex = /!\[([^\]]*)\]\(http:\/\/localhost:5050\/api\/local-image\?path=([^)]+)\)/gi;
                md = md.replace(backRegex, (match, alt, encodedPath) => {
                    const decodedPath = decodeURIComponent(encodedPath);
                    const filename = decodedPath.split(/[\/\\]/).pop();
                    return `![[${filename}]]`;
                });
                
                onChange(md);
            }} 
            theme={isDark ? 'dark' : 'light'}
            className="h-full pt-6 bg-white dark:bg-slate-900"
        />
    );
}

// ─── 파일 트리 노드 ─────────────────────────────────────────────
function FileNode({ node, depth = 0, onSelect, selectedPath, onRefresh, onDelete }) {
    const [open, setOpen] = useState(false);
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

    // 폴더 깊이에 따른 색상 팔레트 (폴더 캡슐용)
    const folderBoxColors = [
        'bg-indigo-50/80 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
        'bg-emerald-50/80 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        'bg-amber-50/80 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        'bg-rose-50/80 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        'bg-sky-50/80 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    ];

    const folderClass = node.isDir ? folderBoxColors[depth % 5] : '';
    
    // 파일 색상 (텍스트형)
    const fileClass = isSelected
        ? 'bg-sky-50 dark:bg-slate-800 text-sky-700 dark:text-sky-400 font-bold'
        : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70';

    const renderMenu = () => (
        showMenu && (
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
        )
    );

    if (node.isDir) {
        return (
            <div>
                {/* 폴더 캡슐 */}
                <div
                    className={`group flex items-center gap-1.5 py-[5px] px-2 mb-1.5 rounded-xl cursor-pointer text-[12px] font-semibold transition-colors relative ${folderClass}`}
                    style={{ marginLeft: `${depth * 14}px` }}
                    onClick={() => setOpen(v => !v)}
                >
                    {open ? <ChevronDown size={12} className="shrink-0 opacity-70" /> : <ChevronRight size={12} className="shrink-0 opacity-70" />}
                    <span className="truncate flex-1">{node.name}</span>
                    <button
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/40 transition-all shrink-0"
                        onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
                    >
                        <MoreVertical size={11} />
                    </button>
                    {renderMenu()}
                </div>
                
                {/* 폴더 하위 내용물 */}
                {open && loaded && (
                    <div className="flex flex-col">
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

    return (
        <div
            draggable={!node.isDir}
            onDragStart={(e) => {
                if (!node.isDir) {
                    e.dataTransfer.setData('application/json', JSON.stringify(node));
                    e.dataTransfer.effectAllowed = 'copy';
                }
            }}
            className={`group flex items-center gap-1.5 py-[3px] px-2 mb-0.5 rounded-lg cursor-pointer text-[12px] transition-all relative ${fileClass}`}
            style={{ marginLeft: `${depth * 14}px` }}
            onClick={() => { if (!node.isDir) onSelect(node); }}
        >
            <span className="w-[12px] shrink-0" />
            <span className="truncate flex-1">{node.name.replace(/\.md$/, '')}</span>
            <button
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shrink-0"
                onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
            >
                <MoreVertical size={11} />
            </button>
            {renderMenu()}
        </div>
    );
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function NotesPage() {
    const [vaultPath, setVaultPath] = useState(() => localStorage.getItem('notes_vault') || null);
    const [rootItems, setRootItems] = useState([]);
    
    // Initialize state synchronously from localStorage to prevent race conditions
    const [tabs, setTabs] = useState(() => {
        try {
            const savedTabs = localStorage.getItem('notes_opened_tabs');
            if (savedTabs) {
                const parsed = JSON.parse(savedTabs);
                if (parsed.length > 0) {
                    return parsed.map(t => ({
                        node: t.node,
                        viewMode: t.viewMode || 'editor',
                        content: '',
                        savedContent: '',
                        loadKey: 0,
                        isLoaded: false
                    }));
                }
            }
        } catch (e) { console.error('Failed to restore tabs:', e); }
        return [];
    });

    const [activeTabPath, setActiveTabPath] = useState(() => {
        const savedActive = localStorage.getItem('notes_active_tab');
        if (savedActive) return savedActive;
        // fallback to first tab if exists but no active tab saved
        try {
            const savedTabs = localStorage.getItem('notes_opened_tabs');
            if (savedTabs) {
                const parsed = JSON.parse(savedTabs);
                if (parsed.length > 0) return parsed[0].node.path;
            }
        } catch(e) {}
        return null;
    });

    const [refreshKey, setRefreshKey] = useState(0);
    const [newItemName, setNewItemName] = useState('');
    const [showNewFile, setShowNewFile] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadingFile, setLoadingFile] = useState(false);
    const [editorWidth, setEditorWidth] = useState(800); // 기본 폭 A4 사이즈 정도
    const saveTimerRef = useRef(null);
    const editorRef = useRef(null);

    const activeTab = useMemo(() => tabs.find(t => t.node.path === activeTabPath), [tabs, activeTabPath]);
    const selectedNode = activeTab?.node || null;
    const content = activeTab?.content || '';
    const savedContent = activeTab?.savedContent || '';
    const viewMode = activeTab?.viewMode || 'editor';
    const loadKey = activeTab?.loadKey || 0;

    const isDirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

    // State updaters for active tab
    const setContent = (newContent) => {
        setTabs(prev => prev.map(t => t.node.path === activeTabPath ? { ...t, content: typeof newContent === 'function' ? newContent(t.content) : newContent } : t));
    };
    const setViewMode = (newMode) => {
        setTabs(prev => prev.map(t => t.node.path === activeTabPath ? { ...t, viewMode: typeof newMode === 'function' ? newMode(t.viewMode) : newMode } : t));
    };
    const setLoadKey = (keyFunc) => {
        setTabs(prev => prev.map(t => t.node.path === activeTabPath ? { ...t, loadKey: typeof keyFunc === 'function' ? keyFunc(t.loadKey) : keyFunc } : t));
    };

    // ── 상태 유지 (로컬 스토리지) ──────────────────────────────────────────

    useEffect(() => {
        try {
            const minimalTabs = tabs.map(t => ({ node: t.node, viewMode: t.viewMode }));
            localStorage.setItem('notes_opened_tabs', JSON.stringify(minimalTabs));
            if (activeTabPath) localStorage.setItem('notes_active_tab', activeTabPath);
            else localStorage.removeItem('notes_active_tab');
        } catch (e) {}
    }, [tabs, activeTabPath]);

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
            setTabs([]);
            setActiveTabPath(null);
        }
    };

    // ── 탭 및 파일 콘텐츠 로드 ──────────────────────────────────────────
    const loadTabContent = async (path) => {
        setLoadingFile(true);
        const text = await window.electronAPI.notes.readFile(path);
        setTabs(prev => prev.map(t => {
            if (t.node.path === path) {
                return { ...t, content: text ?? '', savedContent: text ?? '', isLoaded: true, loadKey: Date.now() };
            }
            return t;
        }));
        setLoadingFile(false);
    };

    useEffect(() => {
        if (!activeTab || activeTab.isLoaded) return;
        
        const load = async () => {
            setLoadingFile(true);
            const ext = activeTab.node.name.includes('.') ? activeTab.node.name.substring(activeTab.node.name.lastIndexOf('.')).toLowerCase() : '';
            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
            
            if (imageExts.includes(ext) || ext === '.pdf') {
                setTabs(prev => prev.map(t => t.node.path === activeTabPath ? { ...t, isLoaded: true } : t));
            } else {
                const text = await window.electronAPI.notes.readFile(activeTab.node.path);
                setTabs(prev => prev.map(t => t.node.path === activeTabPath ? { 
                    ...t, content: text ?? '', savedContent: text ?? '', isLoaded: true, loadKey: Date.now() 
                } : t));
            }
            setLoadingFile(false);
        };
        load();
    }, [activeTab, activeTabPath]);

    // ── 파일 선택 (트리 클릭 시) ────────────────────────────────────────────
    const handleSelect = async (node) => {
        const existingTab = tabs.find(t => t.node.path === node.path);
        if (existingTab) {
            setActiveTabPath(node.path);
            return;
        }

        const ext = node.name.includes('.') ? node.name.substring(node.name.lastIndexOf('.')).toLowerCase() : '';
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
        
        let initialViewMode = 'editor';
        if (imageExts.includes(ext)) initialViewMode = 'image';
        else if (ext === '.pdf') initialViewMode = 'pdf';

        const newTab = {
            node,
            viewMode: initialViewMode,
            content: '',
            savedContent: '',
            loadKey: Date.now(),
            isLoaded: false
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabPath(node.path);
    };

    // ── 탭 닫기 ─────────────────────────────────────────────────
    const closeTab = (pathToClose, e) => {
        e.stopPropagation();
        const tabToClose = tabs.find(t => t.node.path === pathToClose);
        if (!tabToClose) return;

        if (tabToClose.content !== tabToClose.savedContent) {
            saveTab(tabToClose.node.path, tabToClose.content);
        }

        setTabs(prev => {
            const filtered = prev.filter(t => t.node.path !== pathToClose);
            if (activeTabPath === pathToClose) {
                if (filtered.length > 0) setActiveTabPath(filtered[filtered.length - 1].node.path);
                else setActiveTabPath(null);
            }
            return filtered;
        });
    };

    // ── 저장 ─────────────────────────────────────────────────
    const saveTab = useCallback(async (tabPath, tabContent) => {
        setSaving(true);
        await window.electronAPI.notes.writeFile(tabPath, tabContent);
        setTabs(prev => prev.map(t => t.node.path === tabPath ? { ...t, savedContent: tabContent } : t));
        setSaving(false);
    }, []);

    const saveActiveTab = useCallback(() => {
        if (!activeTab || activeTab.content === activeTab.savedContent) return;
        saveTab(activeTab.node.path, activeTab.content);
    }, [activeTab, saveTab]);

    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveActiveTab(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [saveActiveTab]);

    useEffect(() => {
        if (!activeTab || activeTab.content === activeTab.savedContent) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => saveTab(activeTab.node.path, activeTab.content), 3000);
        return () => clearTimeout(saveTimerRef.current);
    }, [activeTab, saveTab]);

    // ── 인용문 GitHub Alerts (CAUTION, WARNING, NOTE, TIP) 동적 스타일링 ──
    useEffect(() => {
        const editorContainer = document.querySelector('.notes-blocknote-editor');
        if (!editorContainer) return;

        const applyAlerts = () => {
            const bqs = editorContainer.querySelectorAll('blockquote');
            bqs.forEach(bq => {
                const text = bq.textContent.trim().toUpperCase();
                if (text.startsWith('CAUTION') || text.startsWith('[!CAUTION]')) bq.setAttribute('data-alert', 'caution');
                else if (text.startsWith('WARNING') || text.startsWith('[!WARNING]')) bq.setAttribute('data-alert', 'warning');
                else if (text.startsWith('NOTE') || text.startsWith('[!NOTE]')) bq.setAttribute('data-alert', 'note');
                else if (text.startsWith('TIP') || text.startsWith('[!TIP]')) bq.setAttribute('data-alert', 'tip');
                else bq.removeAttribute('data-alert');
            });
        };

        const observer = new MutationObserver(applyAlerts);
        observer.observe(editorContainer, { childList: true, subtree: true, characterData: true });
        
        // Initial apply (needs a slight delay for BlockNote to render)
        setTimeout(applyAlerts, 100);

        return () => observer.disconnect();
    }, [selectedNode]); // Re-attach when file changes

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

            {/* ─── 파일 트리 사이드바 ─── */}
            <div className="w-[260px] shrink-0 flex flex-col p-2.5 bg-slate-50/70 dark:bg-slate-950/60 border-r border-slate-100 dark:border-slate-800">
                <div className="flex-1 flex flex-col border border-emerald-500 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
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
            </div>

            {/* ─── 에디터 영역 ─── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <FindInPageBar nativeDOM={true} />
                {tabs.length > 0 ? (
                    <>
                        {/* 탭 바 */}
                        <div className="flex bg-slate-100 dark:bg-slate-900 overflow-x-auto custom-scrollbar border-b border-slate-200 dark:border-slate-800">
                            {tabs.map(tab => (
                                <div 
                                    key={tab.node.path}
                                    onClick={() => setActiveTabPath(tab.node.path)}
                                    className={`flex items-center gap-2 px-3 py-2 text-[11px] font-medium border-r border-slate-200 dark:border-slate-800 cursor-pointer min-w-[120px] max-w-[200px] group ${
                                        activeTabPath === tab.node.path 
                                            ? 'bg-white dark:bg-slate-950 text-sky-600 dark:text-sky-400 border-b-2 border-b-sky-500' 
                                            : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="truncate flex-1" title={tab.node.name}>
                                        {tab.content !== tab.savedContent ? '● ' : ''}{tab.node.name}
                                    </span>
                                    <button 
                                        onClick={(e) => closeTab(tab.node.path, e)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-opacity text-slate-400 hover:text-rose-500"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {activeTab ? (
                            <>
                                {/* 상단 바 */}
                                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
                            <FileText size={13} className="text-slate-400 shrink-0" />
                            <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 truncate flex-1">
                                {selectedNode.name}
                            </span>

                            {/* 폭 조절 슬라이더 */}
                            <div className="flex items-center gap-2 mr-2 opacity-50 hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">폭 조절</span>
                                <input 
                                    type="range" 
                                    min="500" 
                                    max="1600" 
                                    value={editorWidth} 
                                    onChange={(e) => setEditorWidth(Number(e.target.value))}
                                    className="w-20 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                />
                            </div>

                            {/* 숨겨진 파일 인풋 (필요시 사용) */}
                            <input
                                type="file"
                                id="notes-image-picker"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !editorRef.current) return;
                                    e.target.value = '';
                                    const arrayBuffer = await file.arrayBuffer();
                                    let targetDir = vaultPath;
                                    if (selectedNode?.path) {
                                        targetDir = selectedNode.path.substring(0, Math.max(selectedNode.path.lastIndexOf('\\'), selectedNode.path.lastIndexOf('/')));
                                    }
                                    let ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.png';
                                    const newFileName = `Pasted image ${Date.now()}${ext}`;
                                    const targetPath = `${targetDir}\\${newFileName}`;
                                    const success = await window.electronAPI.notes.saveImage(targetPath, arrayBuffer);
                                    if (success) {
                                        const fileUri = `http://localhost:5050/api/local-image?path=${encodeURIComponent(targetPath)}`;
                                        const editor = editorRef.current;
                                        editor.insertBlocks(
                                            [{ type: 'image', props: { url: fileUri, name: newFileName } }],
                                            editor.getTextCursorPosition().block,
                                            'after'
                                        );
                                    }
                                }}
                            />

                            {/* 보기 모드 토글 */}
                            {(!selectedNode.name.match(/\.(png|jpe?g|gif|svg|webp|pdf)$/i)) && (
                                <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                                    <button
                                        onClick={() => setViewMode('editor')}
                                        title="에디터 모드"
                                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                            viewMode === 'editor'
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <Eye size={11} /> 에디터
                                    </button>
                                    <button
                                        onClick={() => setViewMode('markdown')}
                                        title="마크다운 원문 보기"
                                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition-colors border-l border-slate-200 dark:border-slate-700 ${
                                            viewMode === 'markdown'
                                                ? 'bg-slate-700 text-white'
                                                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <Code size={11} /> MD
                                    </button>
                                </div>
                            )}

                            {/* 저장 상태 */}
                            <span className={`text-[10px] font-semibold transition-colors ${isDirty ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {saving ? '저장 중...' : isDirty ? '● 미저장' : '✓ 저장됨'}
                            </span>
                            <button
                                onClick={saveActiveTab}
                                disabled={!isDirty || ['image', 'pdf'].includes(viewMode)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 rounded-lg text-[11px] font-bold transition-colors hover:bg-sky-600 disabled:cursor-default"
                            >
                                <Save size={12} /> 저장
                            </button>
                        </div>

                        {/* ─── 표시 영역 ─── */}
                        {viewMode === 'image' ? (
                            <div className="flex-1 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-8 overflow-auto">
                                <img 
                                    src={`http://localhost:5050/api/local-image?path=${encodeURIComponent(selectedNode.path)}`}
                                    alt={selectedNode.name}
                                    className="max-w-full max-h-full object-contain rounded shadow-lg bg-white"
                                />
                            </div>
                        ) : viewMode === 'pdf' ? (
                            <div className="flex-1 bg-slate-900">
                                <iframe 
                                    src={`http://localhost:5050/api/local-image?path=${encodeURIComponent(selectedNode.path)}`}
                                    className="w-full h-full border-none"
                                    title={selectedNode.name}
                                />
                            </div>
                        ) : viewMode === 'markdown' ? (
                            <div className="flex-1 overflow-hidden flex flex-col bg-slate-950">
                                <div className="px-4 py-1.5 border-b border-slate-800 bg-slate-900 flex items-center gap-2">
                                    <Code size={11} className="text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Markdown Source</span>
                                    <span className="text-[10px] text-slate-600 ml-auto">읽기 전용 | 편집하려면 에디터 모드로 전환하세요</span>
                                </div>
                                <textarea
                                    readOnly
                                    value={content}
                                    className="flex-1 w-full p-6 font-mono text-[12px] text-slate-200 bg-slate-950 resize-none focus:outline-none leading-relaxed custom-scrollbar"
                                    style={{ tabSize: 2 }}
                                />
                            </div>
                        ) : (
                            <div 
                                className="flex-1 overflow-y-auto custom-scrollbar notes-blocknote-editor flex justify-center bg-slate-50 dark:bg-slate-950"
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        const data = e.dataTransfer.getData('application/json');
                                        if (data && editorRef.current) {
                                            const node = JSON.parse(data);
                                            const editor = editorRef.current;
                                            const ext = node.name.includes('.') ? node.name.substring(node.name.lastIndexOf('.')).toLowerCase() : '';
                                            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
                                            
                                            const currentBlock = editor.getTextCursorPosition()?.block || editor.document[editor.document.length - 1];

                                            if (imageExts.includes(ext)) {
                                                const fileUri = `http://localhost:5050/api/local-image?path=${encodeURIComponent(node.path)}`;
                                                editor.insertBlocks(
                                                    [{ type: 'image', props: { url: fileUri, name: node.name } }],
                                                    currentBlock,
                                                    'after'
                                                );
                                            } else {
                                                editor.insertBlocks(
                                                    [{ type: 'paragraph', content: [{ type: 'link', href: `file:///${node.path.replace(/\\/g, '/')}`, content: node.name }] }],
                                                    currentBlock,
                                                    'after'
                                                );
                                            }
                                        }
                                    } catch(err) {
                                        console.error('Drop error:', err);
                                    }
                                }}
                            >
                                <div 
                                    style={{ width: `${editorWidth}px`, maxWidth: '100%', transition: 'width 0.2s ease-out' }}
                                    className="bg-white dark:bg-slate-900 min-h-full shadow-sm border-x border-slate-100 dark:border-slate-800"
                                >
                                    {loadingFile ? (
                                        <div className="flex-1 h-full flex items-center justify-center text-slate-400">
                                            <span className="text-[11px] font-semibold">로딩 중...</span>
                                        </div>
                                    ) : (
                                        <BlockNoteEditorWrapper
                                            key={`${selectedNode.path}-${loadKey}`}
                                            initialMarkdown={savedContent}
                                            onChange={(md) => setContent(md)}
                                            vaultPath={vaultPath}
                                            filePath={selectedNode.path}
                                            editorRef={editorRef}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-950">
                        <FileText size={40} />
                        <p className="text-sm font-medium">선택된 탭이 없습니다</p>
                    </div>
                )}
                </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                        <FileText size={40} />
                        <p className="text-sm font-medium">문서를 열어주세요</p>
                        <p className="text-xs text-slate-300 dark:text-slate-700">좌측 파일 목록에서 파일을 클릭하면 탭으로 열립니다</p>
                    </div>
                )}
            </div>
        </div>
    );
}
