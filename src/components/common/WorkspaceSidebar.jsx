import React, { useState } from 'react';
import { 
    ChevronDown, ChevronRight, Folder, FolderPlus, FilePlus,
    Layout, Plus, MoreHorizontal, Briefcase, X 
} from 'lucide-react';

export default function WorkspaceSidebar({ 
    workspaces, 
    folders, 
    boards, 
    activeWorkspaceId, 
    activeBoardId, 
    onSelectWorkspace, 
    onSelectBoard,
    onCreateWorkspace,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onCreateBoard,
    onUpdateBoard
}) {
    // Folders toggle state
    const [openFolders, setOpenFolders] = useState({});
    const [isWsOpen, setIsWsOpen] = useState(false);

    // Inline inputs active state
    const [isAddingWs, setIsAddingWs] = useState(false);
    const [wsNameInput, setWsNameInput] = useState('');

    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [folderNameInput, setFolderNameInput] = useState('');

    const [isAddingBoard, setIsAddingBoard] = useState(false);
    const [boardNameInput, setBoardNameInput] = useState('');

    const [addingBoardFolderId, setAddingBoardFolderId] = useState(null);
    const [folderBoardNameInput, setFolderBoardNameInput] = useState('');

    // Folder edit states
    const [editingFolderId, setEditingFolderId] = useState(null);
    const [editingFolderName, setEditingFolderName] = useState('');
    const [activeMenuFolderId, setActiveMenuFolderId] = useState(null);

    // DND visual states
    const [draggedOverFolderId, setDraggedOverFolderId] = useState(null);
    const [isDraggedOverRoot, setIsDraggedOverRoot] = useState(false);

    const toggleFolder = (folderId) => {
        setOpenFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    // Filter folders and boards by current workspace
    const currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
    const workspaceFolders = folders.filter(f => f.workspaceId === activeWorkspaceId);
    
    // Uncategorized boards (boards with no folderId or folderId not in current workspace)
    const uncategorizedBoards = boards.filter(b => 
        b.workspaceId === activeWorkspaceId && 
        (!b.folderId || !workspaceFolders.find(f => f.id === b.folderId))
    );

    // DND Handlers
    const handleBoardDragStart = (e, boardId) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'board', boardId }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleFolderDragOver = (e, folderId) => {
        e.preventDefault();
        setDraggedOverFolderId(folderId);
    };

    const handleFolderDragLeave = () => {
        setDraggedOverFolderId(null);
    };

    const handleFolderDrop = (e, folderId) => {
        e.preventDefault();
        setDraggedOverFolderId(null);
        try {
            const dataStr = e.dataTransfer.getData('text/plain');
            if (!dataStr) return;
            const data = JSON.parse(dataStr);
            if (data.type === 'board' && data.boardId) {
                onUpdateBoard?.(data.boardId, { folderId });
            }
        } catch (err) {
            console.error("Drop failed on folder:", err);
        }
    };

    const handleRootDragOver = (e) => {
        e.preventDefault();
        setIsDraggedOverRoot(true);
    };

    const handleRootDragLeave = () => {
        setIsDraggedOverRoot(false);
    };

    const handleRootDrop = (e) => {
        e.preventDefault();
        setIsDraggedOverRoot(false);
        try {
            const dataStr = e.dataTransfer.getData('text/plain');
            if (!dataStr) return;
            const data = JSON.parse(dataStr);
            if (data.type === 'board' && data.boardId) {
                onUpdateBoard?.(data.boardId, { folderId: null });
            }
        } catch (err) {
            console.error("Drop failed on root projects area:", err);
        }
    };

    return (
        <div className="w-64 bg-slate-50 border-r border-slate-200 h-full flex flex-col shrink-0 text-slate-800 font-sans select-none">
            {/* 1. Workspace Header & Selection Dropdown */}
            <div className="p-4 border-b border-slate-200 relative shrink-0">
                <div 
                    onClick={() => setIsWsOpen(!isWsOpen)}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-200/50 rounded-lg cursor-pointer transition-colors group"
                >
                    <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-black text-xs">
                        {currentWorkspace?.name?.charAt(0) || 'W'}
                    </div>
                    <span className="flex-1 font-black text-slate-800 text-sm truncate">
                        {currentWorkspace?.name || 'Main Workspace'}
                    </span>
                    <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />
                </div>

                {/* Workspace Selection Dropdown (Integrated Workspace Creation Action) */}
                {isWsOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsWsOpen(false)} />
                        <div className="absolute top-[90%] left-4 right-4 bg-white border border-slate-200 rounded-xl shadow-xl z-[100] py-1.5 animate-in fade-in slide-in-from-top-2 duration-100 max-h-64 overflow-y-auto flex flex-col">
                            {/* Workspace List */}
                            <div className="flex-1 overflow-y-auto max-h-40">
                                {workspaces.map(ws => (
                                    <div
                                        key={ws.id}
                                        onClick={() => {
                                            onSelectWorkspace(ws.id);
                                            setIsWsOpen(false);
                                        }}
                                        className={`px-3 py-2 text-xs font-bold cursor-pointer transition-all hover:bg-slate-50 flex items-center gap-2 ${ws.id === activeWorkspaceId ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                                    >
                                        <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${ws.id === activeWorkspaceId ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                            {ws.name?.charAt(0) || 'W'}
                                        </div>
                                        <span className="truncate flex-1">{ws.name}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Create Workspace Inline Action inside dropdown */}
                            <div className="border-t border-slate-100 p-2 shrink-0 bg-slate-50/50">
                                {isAddingWs ? (
                                    <div className="flex items-center gap-1.5 animate-in fade-in">
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="새 워크스페이스 이름"
                                            value={wsNameInput}
                                            onChange={e => setWsNameInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && wsNameInput.trim()) {
                                                    onCreateWorkspace(wsNameInput.trim());
                                                    setIsAddingWs(false);
                                                    setWsNameInput('');
                                                    setIsWsOpen(false);
                                                }
                                                if (e.key === 'Escape') setIsAddingWs(false);
                                            }}
                                            className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold outline-none focus:border-indigo-500"
                                        />
                                        <button
                                            onClick={() => {
                                                if (wsNameInput.trim()) {
                                                    onCreateWorkspace(wsNameInput.trim());
                                                    setIsAddingWs(false);
                                                    setWsNameInput('');
                                                    setIsWsOpen(false);
                                                }
                                            }}
                                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black"
                                        >
                                            저장
                                        </button>
                                        <button
                                            onClick={() => setIsAddingWs(false)}
                                            className="p-1 hover:bg-slate-200 rounded text-slate-400"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setIsAddingWs(true)}
                                        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-black text-slate-500 hover:text-indigo-600 hover:bg-slate-200/50 py-1.5 rounded-lg transition-colors border border-dashed border-slate-300"
                                    >
                                        <Plus size={12} /> 새 워크스페이스 추가
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 2. Workspace Actions (Deleted - moved inside dropdown) */}

            {/* 3. Projects Section (Integrated Folders & Boards Tree) */}
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 mt-2">
                <div className="flex items-center justify-between px-3 py-1.5 select-none">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">프로젝트</span>
                    <div className="flex items-center gap-1.5">
                        <button 
                            onClick={() => {
                                setIsAddingFolder(!isAddingFolder);
                                setIsAddingBoard(false);
                            }}
                            className={`p-0.5 transition-colors ${isAddingFolder ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-indigo-600'}`}
                            title="새 폴더 추가"
                        >
                            <FolderPlus size={13} />
                        </button>
                        <button 
                            onClick={() => {
                                setIsAddingBoard(!isAddingBoard);
                                setIsAddingFolder(false);
                            }}
                            className={`p-0.5 transition-colors ${isAddingBoard ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-indigo-600'}`}
                            title="새 프로젝트(보드) 추가"
                        >
                            <FilePlus size={13} />
                        </button>
                    </div>
                </div>

                {/* Inline Form to add a folder */}
                {isAddingFolder && (
                    <div className="mx-2 my-1 flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 animate-in fade-in">
                        <input
                            autoFocus
                            type="text"
                            placeholder="폴더 이름"
                            value={folderNameInput}
                            onChange={e => setFolderNameInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && folderNameInput.trim()) {
                                    onCreateFolder(folderNameInput.trim());
                                    setIsAddingFolder(false);
                                    setFolderNameInput('');
                                }
                                if (e.key === 'Escape') setIsAddingFolder(false);
                            }}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-indigo-500"
                        />
                        <button
                            onClick={() => {
                                if (folderNameInput.trim()) {
                                    onCreateFolder(folderNameInput.trim());
                                    setIsAddingFolder(false);
                                    setFolderNameInput('');
                                }
                            }}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black shrink-0"
                        >
                            저장
                        </button>
                        <button onClick={() => setIsAddingFolder(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400 shrink-0">
                            <X size={12} />
                        </button>
                    </div>
                )}

                {/* Inline Form to add a project */}
                {isAddingBoard && (
                    <div className="mx-2 my-1 flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 animate-in fade-in">
                        <input
                            autoFocus
                            type="text"
                            placeholder="프로젝트 이름"
                            value={boardNameInput}
                            onChange={e => setBoardNameInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && boardNameInput.trim()) {
                                    onCreateBoard(boardNameInput.trim(), null);
                                    setIsAddingBoard(false);
                                    setBoardNameInput('');
                                }
                                if (e.key === 'Escape') setIsAddingBoard(false);
                            }}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-indigo-500"
                        />
                        <button
                            onClick={() => {
                                if (boardNameInput.trim()) {
                                    onCreateBoard(boardNameInput.trim(), null);
                                    setIsAddingBoard(false);
                                    setBoardNameInput('');
                                }
                            }}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black shrink-0"
                        >
                            저장
                        </button>
                        <button onClick={() => setIsAddingBoard(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400 shrink-0">
                            <X size={12} />
                        </button>
                    </div>
                )}

                {/* Unified Folders and Projects List */}
                <div className="space-y-0.5 mt-2">
                    {/* 1) Folders List */}
                    {workspaceFolders.map(folder => {
                        const isOpen = openFolders[folder.id];
                        const folderBoards = boards.filter(b => b.folderId === folder.id);
                        const isHovered = draggedOverFolderId === folder.id;

                        return (
                            <div 
                                key={folder.id} 
                                className={`space-y-0.5 rounded-lg transition-all ${
                                    isHovered ? 'bg-indigo-50 border border-dashed border-indigo-400 p-0.5 shadow-sm' : ''
                                }`}
                                onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                                onDragLeave={handleFolderDragLeave}
                                onDrop={(e) => handleFolderDrop(e, folder.id)}
                            >
                                <div 
                                    onClick={() => toggleFolder(folder.id)}
                                    className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-200/50 rounded-lg cursor-pointer transition-colors group relative"
                                >
                                    {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                    <Folder size={14} className={isOpen ? "text-indigo-500" : "text-slate-400"} />
                                    
                                    {editingFolderId === folder.id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editingFolderName}
                                            onChange={e => setEditingFolderName(e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    if (editingFolderName.trim()) {
                                                        onRenameFolder?.(folder.id, editingFolderName.trim());
                                                    }
                                                    setEditingFolderId(null);
                                                }
                                                if (e.key === 'Escape') {
                                                    setEditingFolderId(null);
                                                }
                                            }}
                                            onBlur={() => {
                                                if (editingFolderName.trim()) {
                                                    onRenameFolder?.(folder.id, editingFolderName.trim());
                                                }
                                                setEditingFolderId(null);
                                            }}
                                            className="flex-1 bg-white border border-slate-350 rounded px-1.5 py-0.5 text-[11px] font-bold outline-none focus:border-indigo-500"
                                        />
                                    ) : (
                                        <span 
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                setEditingFolderId(folder.id);
                                                setEditingFolderName(folder.name);
                                            }}
                                            className="flex-1 text-[11px] font-black text-slate-700 truncate"
                                            title="더블클릭하여 폴더 이름 변경"
                                        >
                                            {folder.name}
                                        </span>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenuFolderId(activeMenuFolderId === folder.id ? null : folder.id);
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors"
                                            title="더보기"
                                        >
                                            <MoreHorizontal size={12} />
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setAddingBoardFolderId(folder.id);
                                                setFolderBoardNameInput('');
                                                setOpenFolders(prev => ({ ...prev, [folder.id]: true }));
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                            title="새 프로젝트 추가"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>

                                    {/* Folder Action Popover Menu */}
                                    {activeMenuFolderId === folder.id && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setActiveMenuFolderId(null); }} />
                                            <div className="absolute right-2 top-8 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 w-28 animate-in fade-in slide-in-from-top-2 duration-100 flex flex-col text-left">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingFolderId(folder.id);
                                                        setEditingFolderName(folder.name);
                                                        setActiveMenuFolderId(null);
                                                    }}
                                                    className="px-3 py-1.5 text-[10px] font-black text-slate-650 hover:bg-slate-50 transition-colors text-left"
                                                >
                                                    이름 변경
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteFolder?.(folder.id);
                                                        setActiveMenuFolderId(null);
                                                    }}
                                                    className="px-3 py-1.5 text-[10px] font-black text-rose-505 hover:bg-rose-50 transition-colors border-t border-slate-100 text-left"
                                                >
                                                    폴더 삭제
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                
                                {/* Boards inside folder */}
                                {isOpen && (
                                    <div className="pl-6 space-y-0.5">
                                        {folderBoards.map(board => (
                                            <div 
                                                key={board.id}
                                                draggable={true}
                                                onDragStart={(e) => handleBoardDragStart(e, board.id)}
                                                onClick={() => onSelectBoard(board.id)}
                                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-colors ${
                                                    activeBoardId === board.id 
                                                        ? 'bg-indigo-100/50 text-indigo-700 font-black' 
                                                        : 'text-slate-600 hover:bg-slate-200/50 font-bold'
                                                }`}
                                            >
                                                <Layout size={13} className={activeBoardId === board.id ? 'text-indigo-600' : 'text-slate-400'} />
                                                <span className="text-[11px] truncate flex-1">{board.name}</span>
                                            </div>
                                        ))}
                                        
                                        {/* Inline Add Board Form inside folder */}
                                        {addingBoardFolderId === folder.id && (
                                            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 animate-in fade-in mr-2">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="새 보드 이름"
                                                    value={folderBoardNameInput}
                                                    onChange={e => setFolderBoardNameInput(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && folderBoardNameInput.trim()) {
                                                            onCreateBoard(folderBoardNameInput.trim(), folder.id);
                                                            setAddingBoardFolderId(null);
                                                            setFolderBoardNameInput('');
                                                        }
                                                        if (e.key === 'Escape') setAddingBoardFolderId(null);
                                                    }}
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold outline-none focus:border-indigo-500"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (folderBoardNameInput.trim()) {
                                                            onCreateBoard(folderBoardNameInput.trim(), folder.id);
                                                            setAddingBoardFolderId(null);
                                                            setFolderBoardNameInput('');
                                                        }
                                                    }}
                                                    className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[9px] font-black"
                                                >
                                                    저장
                                                </button>
                                                <button onClick={() => setAddingBoardFolderId(null)} className="p-0.5 hover:bg-slate-100 rounded text-slate-400">
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        )}

                                        {folderBoards.length === 0 && addingBoardFolderId !== folder.id && (
                                            <div className="px-2 py-1 text-[10px] text-slate-400 italic">보드가 없습니다</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* 2) Uncategorized Projects List (Root Projects drop target) */}
                    <div 
                        onDragOver={handleRootDragOver}
                        onDragLeave={handleRootDragLeave}
                        onDrop={handleRootDrop}
                        className={`space-y-0.5 rounded-lg transition-all ${
                            isDraggedOverRoot ? 'bg-indigo-50 border border-dashed border-indigo-400 p-1 shadow-sm' : ''
                        }`}
                    >
                        {uncategorizedBoards.map(board => (
                            <div 
                                key={board.id}
                                draggable={true}
                                onDragStart={(e) => handleBoardDragStart(e, board.id)}
                                onClick={() => onSelectBoard(board.id)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-colors ${
                                    activeBoardId === board.id 
                                        ? 'bg-indigo-100/50 text-indigo-700 font-black' 
                                        : 'text-slate-600 hover:bg-slate-200/50 font-bold'
                                }`}
                            >
                                <Layout size={13} className={activeBoardId === board.id ? 'text-indigo-600' : 'text-slate-400'} />
                                <span className="text-[11px] truncate flex-1">{board.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* Fallback empty message */}
                    {workspaceFolders.length === 0 && uncategorizedBoards.length === 0 && !isAddingFolder && !isAddingBoard && (
                        <div className="px-3 py-1.5 text-[10px] text-slate-400 italic">프로젝트가 없습니다</div>
                    )}
                </div>
            </div>
        </div>
    );
}
