import React, { useState } from 'react';
import { 
    ChevronDown, ChevronRight, Folder, 
    Layout, Plus, MoreHorizontal, Briefcase 
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
    onCreateBoard 
}) {
    // Folders toggle state
    const [openFolders, setOpenFolders] = useState({});

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

    return (
        <div className="w-64 bg-slate-50 border-r border-slate-200 h-full flex flex-col shrink-0">
            {/* 1. Workspace Header */}
            <div className="p-4 border-b border-slate-200">
                <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-200/50 rounded-lg cursor-pointer transition-colors group">
                    <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-black text-xs">
                        {currentWorkspace?.name?.charAt(0) || 'W'}
                    </div>
                    <span className="flex-1 font-black text-slate-800 text-sm truncate">
                        {currentWorkspace?.name || 'Main Workspace'}
                    </span>
                    <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />
                </div>
            </div>

            {/* 2. Workspace Actions */}
            <div className="p-4 pb-2 space-y-2">
                <button 
                    onClick={() => {
                        const name = window.prompt("새 워크스페이스 이름을 입력하세요:");
                        if (name) onCreateWorkspace(name);
                    }}
                    className="w-full flex items-center gap-2 text-xs font-bold text-slate-500 hover:bg-slate-200/50 px-2 py-1.5 rounded-lg transition-colors"
                >
                    <Plus size={14} /> 새 워크스페이스 추가
                </button>
            </div>

            {/* 3. Folders & Boards Tree */}
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 mt-2">
                
                {/* Folders */}
                {workspaceFolders.map(folder => {
                    const isOpen = openFolders[folder.id];
                    const folderBoards = boards.filter(b => b.folderId === folder.id);

                    return (
                        <div key={folder.id} className="space-y-0.5">
                            <div 
                                onClick={() => toggleFolder(folder.id)}
                                className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-200/50 rounded-lg cursor-pointer transition-colors group"
                            >
                                {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                <Folder size={14} className={isOpen ? "text-indigo-500" : "text-slate-400"} />
                                <span className="flex-1 text-[11px] font-black text-slate-700 truncate">{folder.name}</span>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const name = window.prompt(`[${folder.name}]에 새 보드 추가:`);
                                        if (name) onCreateBoard(name, folder.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 transition-opacity"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                            
                            {/* Boards inside folder */}
                            {isOpen && (
                                <div className="pl-6 space-y-0.5">
                                    {folderBoards.map(board => (
                                        <div 
                                            key={board.id}
                                            onClick={() => onSelectBoard(board.id)}
                                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                                                activeBoardId === board.id 
                                                    ? 'bg-indigo-100/50 text-indigo-700 font-black' 
                                                    : 'text-slate-600 hover:bg-slate-200/50 font-bold'
                                            }`}
                                        >
                                            <Layout size={13} className={activeBoardId === board.id ? 'text-indigo-600' : 'text-slate-400'} />
                                            <span className="text-[11px] truncate flex-1">{board.name}</span>
                                        </div>
                                    ))}
                                    {folderBoards.length === 0 && (
                                        <div className="px-2 py-1 text-[10px] text-slate-400 italic">보드가 없습니다</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Uncategorized Boards */}
                {uncategorizedBoards.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-slate-200/60 space-y-0.5">
                        <div className="px-3 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Boards</div>
                        {uncategorizedBoards.map(board => (
                            <div 
                                key={board.id}
                                onClick={() => onSelectBoard(board.id)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
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
                )}
            </div>

            {/* 4. Add Folder / Board */}
            <div className="p-4 border-t border-slate-200 bg-slate-100/50 space-y-2">
                <button 
                    onClick={() => {
                        const name = window.prompt("새 폴더 이름을 입력하세요:");
                        if (name) onCreateFolder(name);
                    }}
                    className="w-full flex items-center gap-2 text-xs font-bold text-slate-500 hover:bg-slate-200/50 px-2 py-1.5 rounded-lg transition-colors"
                >
                    <Folder size={14} /> 새 폴더 추가
                </button>
                <button 
                    onClick={() => {
                        const name = window.prompt("새 보드(프로젝트)를 입력하세요:");
                        if (name) onCreateBoard(name, null);
                    }}
                    className="w-full flex items-center gap-2 text-xs font-bold text-indigo-500 hover:bg-indigo-50 px-2 py-1.5 rounded-lg transition-colors"
                >
                    <Plus size={14} /> 새 보드 추가
                </button>
            </div>
        </div>
    );
}
