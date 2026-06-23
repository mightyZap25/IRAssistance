import React, { useState, useEffect } from 'react';
import { nasDbService } from '../services/nasDbService';
import { useAuth } from '../contexts/AuthContext';
import { Briefcase, FileText, Terminal, Zap, Microscope, Factory, Ship } from 'lucide-react';
import WorkspaceSidebar from '../components/common/WorkspaceSidebar';
import ProjectProcessPanel from '../components/ProjectProcessPanel';

const PROCESS_STAGES = [
    { id: 'planning', label: '개발 기획', icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-50' },
    { id: 'development', label: '개발', icon: Terminal, color: 'text-indigo-500', bgColor: 'bg-indigo-50' },
    { id: 'dev_pp', label: '개발 PP', icon: Zap, color: 'text-amber-500', bgColor: 'bg-amber-50' },
    { id: 'qa_test', label: 'QA Test', icon: Microscope, color: 'text-purple-500', bgColor: 'bg-purple-50' },
    { id: 'prod_pp', label: '생산 PP', icon: Factory, color: 'text-emerald-500', bgColor: 'bg-emerald-50' },
    { id: 'mp_transfer', label: '양산이관', icon: Ship, color: 'text-rose-500', bgColor: 'bg-rose-50' },
];

export default function ProjectManagementPage() {
    const { currentUser, userProfile } = useAuth();

    // States for Monday.com hierarchy
    const [workspaces, setWorkspaces] = useState([]);
    const [folders, setFolders] = useState([]);
    const [projects, setProjects] = useState([]); // boards
    const [users, setUsers] = useState([]);

    const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
    const [activeBoardId, setActiveBoardId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const list = await nasDbService.getAll('users');
            setUsers(list);
        } catch (err) {
            console.error("Failed to fetch users:", err);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const wsList = await nasDbService.getAll('workspaces');
            const fList = await nasDbService.getAll('folders');
            const pList = await nasDbService.getAll('projects');

            // Default workspace creation if empty
            if (wsList.length === 0) {
                const defaultWs = { id: 'ws_main', name: 'Main Workspace', createdAt: new Date().toISOString() };
                await nasDbService.upsert('workspaces', defaultWs.id, defaultWs);
                wsList.push(defaultWs);
            }

            setWorkspaces(wsList);
            setFolders(fList);

            // Map legacy projects to default workspace if they lack workspaceId
            const mappedProjects = await Promise.all(pList.map(async p => {
                if (!p.workspaceId) {
                    const updated = { ...p, workspaceId: wsList[0].id };
                    await nasDbService.upsert('projects', p.id, updated);
                    return updated;
                }
                return p;
            }));

            setProjects(mappedProjects);

            if (wsList.length > 0 && !activeWorkspaceId) {
                setActiveWorkspaceId(wsList[0].id);
            }
        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateWorkspace = async (name) => {
        try {
            const id = 'ws_' + Date.now();
            const newWs = { id, name, createdAt: new Date().toISOString() };
            await nasDbService.upsert('workspaces', id, newWs);
            setWorkspaces(prev => [...prev, newWs]);
            setActiveWorkspaceId(id);
        } catch (err) {
            console.error("Workspace creation failed:", err);
            alert("워크스페이스 생성 실패: " + err.message);
        }
    };

    const handleCreateFolder = async (name) => {
        if (!activeWorkspaceId) return;
        try {
            const id = 'fd_' + Date.now();
            const newFd = { id, name, workspaceId: activeWorkspaceId, createdAt: new Date().toISOString() };
            await nasDbService.upsert('folders', id, newFd);
            setFolders(prev => [...prev, newFd]);
        } catch (err) {
            console.error("Folder creation failed:", err);
            alert("폴더 생성 실패: " + err.message);
        }
    };

    const handleRenameFolder = async (folderId, newName) => {
        try {
            const existing = folders.find(f => f.id === folderId);
            if (!existing) return;
            const updated = { ...existing, name: newName };
            await nasDbService.upsert('folders', folderId, updated);
            setFolders(prev => prev.map(f => f.id === folderId ? updated : f));
        } catch (err) {
            console.error("Folder rename failed:", err);
            alert("폴더 이름 변경 실패: " + err.message);
        }
    };

    const handleDeleteFolder = async (folderId) => {
        if (!window.confirm("정말로 이 폴더를 삭제하시겠습니까?\n(폴더 안의 프로젝트들은 삭제되지 않고 '미분류'로 이동합니다.)")) return;
        try {
            await nasDbService.delete('folders', folderId);
            setFolders(prev => prev.filter(f => f.id !== folderId));
            
            // 이 폴더에 소속된 프로젝트들의 folderId를 null로 업데이트
            const affectedProjects = projects.filter(p => p.folderId === folderId);
            await Promise.all(affectedProjects.map(p => 
                handleUpdateProject(p.id, { folderId: null })
            ));
        } catch (err) {
            console.error("Folder deletion failed:", err);
            alert("폴더 삭제 실패: " + err.message);
        }
    };

    const handleCreateBoard = async (name, folderId) => {
        if (!activeWorkspaceId) return;

        try {
            // Generate code
            const year = new Date().getFullYear();
            const prefix = `IR-${year}-`;
            let maxIdx = 0;
            projects.forEach(p => {
                if (p.code && p.code.startsWith(prefix)) {
                    const idxStr = p.code.replace(prefix, '');
                    const idx = parseInt(idxStr, 10);
                    if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
                }
            });
            const code = `${prefix}${String(maxIdx + 1).padStart(3, '0')}`;

            const id = 'pj_' + Date.now();

            // Initial setup for board
            const initialSchedules = {};
            ['planning', 'development', 'dev_pp', 'qa_test', 'prod_pp', 'mp_transfer'].forEach(s => {
                initialSchedules[s] = { start: '', end: '', status: 'pending' };
            });

            const newBoard = {
                id,
                name,
                code,
                workspaceId: activeWorkspaceId,
                folderId: folderId || null,
                currentStage: 'planning',
                progress: 10,
                owner: currentUser?.email || 'admin@irrocot.com',
                ownerName: userProfile?.name || currentUser?.displayName || '로컬 마스터',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                schedules: initialSchedules,
                stageHistory: [{ stage: 'planning', date: new Date().toISOString(), note: '프로젝트 생성' }],
                documents: { planning: [], development: [], dev_pp: [], qa_test: [], prod_pp: [], mp_transfer: [] }
            };

            await nasDbService.upsert('projects', id, newBoard);
            setProjects(prev => [newBoard, ...prev]);
            setActiveBoardId(id);
        } catch (err) {
            console.error("Board creation failed:", err);
            alert("보드 생성 실패: " + err.message);
        }
    };

    const handleUpdateProject = async (projectId, updateData) => {
        try {
            const existingProject = projects.find(p => p.id === projectId) || {};
            const updated = { ...existingProject, ...updateData, updatedAt: new Date().toISOString() };
            await nasDbService.upsert('projects', projectId, updated);

            setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
        } catch (err) {
            console.error("Project update failed:", err);
        }
    };

    const handleDeleteProject = async (projectId) => {
        if (!window.confirm("정말로 이 프로젝트(보드)를 삭제하시겠습니까?")) return;
        try {
            await nasDbService.delete('projects', projectId);
            setProjects(prev => prev.filter(p => p.id !== projectId));
            setActiveBoardId(null);
        } catch (err) {
            console.error("Project deletion failed:", err);
            alert("프로젝트 삭제 실패: " + err.message);
        }
    };

    const selectedProject = projects.find(p => p.id === activeBoardId);

    if (loading) {
        return <div className="h-full flex items-center justify-center font-black text-slate-400">Loading IR Workspace...</div>;
    }

    return (
        <div className="p-5 bg-slate-50 h-full w-full flex flex-col overflow-hidden font-sans">
            <div className="flex-1 flex bg-white overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm min-h-0">
                {/* Sidebar (Workspaces > Folders > Boards) */}
                <WorkspaceSidebar
                    workspaces={workspaces}
                    folders={folders}
                    boards={projects}
                    activeWorkspaceId={activeWorkspaceId}
                    activeBoardId={activeBoardId}
                    onSelectWorkspace={setActiveWorkspaceId}
                    onSelectBoard={setActiveBoardId}
                    onCreateWorkspace={handleCreateWorkspace}
                    onCreateFolder={handleCreateFolder}
                    onRenameFolder={handleRenameFolder}
                    onDeleteFolder={handleDeleteFolder}
                    onCreateBoard={handleCreateBoard}
                    onUpdateBoard={handleUpdateProject}
                />

                {/* Main Board View */}
                <div className="flex-1 relative overflow-hidden bg-white flex flex-col">
                    {selectedProject ? (
                        <ProjectProcessPanel
                            isOpen={true}
                            onClose={() => setActiveBoardId(null)}
                            project={selectedProject}
                            stages={PROCESS_STAGES}
                            onUpdate={handleUpdateProject}
                            onDelete={handleDeleteProject}
                            users={users}
                            currentUser={currentUser}
                            userProfile={userProfile}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                                <Briefcase size={32} className="text-slate-300" />
                            </div>
                            <h2 className="text-lg font-black text-slate-500">좌측에서 보드를 선택하거나 새로 생성하세요</h2>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
