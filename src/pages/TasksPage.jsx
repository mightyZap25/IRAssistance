import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { nasDbService } from '../services/nasDbService';
import {
    getPersonalTasks,
    createPersonalTask,
    updatePersonalTask,
    deletePersonalTask
} from '../services/taskService';
import {
    Plus, Search, Filter, MoreVertical, CheckCircle2, Circle,
    Clock, AlertTriangle, Calendar, Trash2, Edit2, X, Check,
    Bell, BellOff, RotateCcw, ListChecks, LayoutGrid, List,
    Link as LinkIcon, Briefcase
} from 'lucide-react';
import MondayBoard from '../components/common/MondayBoard';
import TaskCardView from '../components/TaskCardView';
import TaskDetailPanel from '../components/TaskDetailPanel';
import RichMemoEditor from '../components/common/RichMemoEditor';

const PRIORITY_MAP = {
    urgent: { label: '긴급', color: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
    high: { label: '높음', color: 'bg-orange-100 text-orange-700', icon: Clock },
    medium: { label: '보통', color: 'bg-blue-100 text-blue-700', icon: Clock },
    low: { label: '낮음', color: 'bg-slate-100 text-slate-700', icon: Clock },
};

const STATUS_MAP = {
    todo: { label: '할 일', color: 'text-slate-500' },
    in_progress: { label: '진행 중', color: 'text-blue-600' },
    completed: { label: '완료', color: 'text-emerald-600' },
};

export default function TasksPage() {
    const { currentUser } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [viewMode, setViewMode] = useState('list'); // list | card

    // Modal & Panel states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [taskForm, setTaskForm] = useState({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        status: 'todo',
        alarmEnabled: false,
        recurring: 'none',
        subtasks: [],
        budget: 0
    });
    const [newSubtask, setNewSubtask] = useState('');
    const [newSubtaskLink, setNewSubtaskLink] = useState('');

    useEffect(() => {
        if (currentUser) {
            fetchTasks();
        }
    }, [currentUser]);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            // 1. 개인 태스크 가져오기
            const personalTasks = await getPersonalTasks(currentUser.uid);
            
            // 2. 프로젝트에서 할당된 태스크 가져오기
            const projects = await nasDbService.getAll('projects');
            const projectTasks = [];
            
            projects.forEach(project => {
                if (project.tests) {
                    Object.keys(project.tests).forEach(stageId => {
                        const stageTasks = project.tests[stageId] || [];
                        stageTasks.forEach(task => {
                            if (task.assigneeUid === currentUser.uid) {
                                projectTasks.push({
                                    id: `proj_${project.id}_${task.id}`,
                                    title: task.title || task.child,
                                    description: `[프로젝트: ${project.title || '미지정'}]\n${task.notes || ''}`,
                                    status: task.completed ? 'completed' : (task.status === 'in_progress' ? 'in_progress' : 'todo'),
                                    priority: task.priority ? task.priority.toLowerCase() : 'medium',
                                    dueDate: task.dueDate || task.endDate || null,
                                    createdAt: new Date(task.updatedAt || Date.now()),
                                    isProjectTask: true,
                                    projectId: project.id,
                                    stageId: stageId,
                                    originalTaskId: task.id,
                                    projectTitle: project.title,
                                    ownerUid: currentUser.uid,
                                    assigneeUid: task.assigneeUid || currentUser.uid
                                });
                            }
                        });
                    });
                }
            });

            // 3. 병합 및 정렬
            const allTasks = [...personalTasks, ...projectTasks];
            allTasks.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
            });

            setTasks(allTasks);
        } catch (error) {
            console.error("Failed to fetch tasks:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (task.description || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
            const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
            return matchesSearch && matchesStatus && matchesPriority;
        });
    }, [tasks, searchTerm, statusFilter, priorityFilter]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        try {
            const dataToSave = {
                ...taskForm,
                dueDate: taskForm.dueDate ? new Date(taskForm.dueDate) : null
            };
            await createPersonalTask(currentUser.uid, dataToSave);
            setIsCreateModalOpen(false);
            fetchTasks();
            setTaskForm({
                title: '',
                description: '',
                priority: 'medium',
                dueDate: '',
                status: 'todo',
                alarmEnabled: false,
                recurring: 'none',
                subtasks: [],
                budget: 0
            });
        } catch (error) {
            console.error("Failed to save task:", error);
            alert("저장 중 오류가 발생했습니다.");
        }
    };

    const handleCreateSubtask = async (parentId, title) => {
        try {
            await createPersonalTask(currentUser.uid, {
                title,
                parentId,
                status: 'todo',
                priority: 'medium',
                subtasks: [],
            });
            fetchTasks();
        } catch (error) {
            console.error("Failed to create subtask:", error);
        }
    };

    const handleQuickAddTask = async (groupId, title) => {
        try {
            const status = groupId === 'done' ? 'completed' : 'todo';
            await createPersonalTask(currentUser.uid, {
                title,
                status,
                priority: 'medium',
                subtasks: [],
            });
            fetchTasks();
        } catch (error) {
            console.error("Failed to quick add task:", error);
        }
    };

    const handleUpdateTask = async (taskId, updatedData) => {
        try {
            const taskObj = tasks.find(t => t.id === taskId);
            if (taskObj && taskObj.isProjectTask) {
                // 프로젝트 태스크 업데이트
                const projects = await nasDbService.getAll('projects');
                const project = projects.find(p => p.id === taskObj.projectId);
                if (project && project.tests && project.tests[taskObj.stageId]) {
                    const taskIndex = project.tests[taskObj.stageId].findIndex(t => t.id === taskObj.originalTaskId);
                    if (taskIndex !== -1) {
                        const projTask = project.tests[taskObj.stageId][taskIndex];
                        if (updatedData.status) {
                            projTask.completed = updatedData.status === 'completed';
                            projTask.status = updatedData.status;
                        }
                        if (updatedData.title !== undefined) projTask.title = updatedData.title;
                        if (updatedData.description !== undefined) projTask.notes = updatedData.description;
                        if (updatedData.dueDate !== undefined) projTask.dueDate = updatedData.dueDate;
                        
                        await nasDbService.upsert('projects', project.id, { tests: project.tests });
                        fetchTasks();
                        if (selectedTask?.id === taskId) {
                            setSelectedTask(prev => ({ ...prev, ...updatedData }));
                        }
                    }
                }
            } else {
                // 개인 태스크 업데이트
                await updatePersonalTask(taskId, updatedData);
                fetchTasks();
                if (selectedTask?.id === taskId) {
                    setSelectedTask(prev => ({ ...prev, ...updatedData }));
                }
            }
        } catch (error) {
            console.error("Failed to update task:", error);
        }
    };

    const toggleStatus = async (task) => {
        const newStatus = task.status === 'completed' ? 'todo' : 'completed';
        handleUpdateTask(task.id, { status: newStatus });
    };

    const handleDelete = async (taskId) => {
        if (!window.confirm("이 태스크를 삭제하시겠습니까?")) return;
        try {
            const taskObj = tasks.find(t => t.id === taskId);
            if (taskObj && taskObj.isProjectTask) {
                // 프로젝트 태스크는 개인 Task 화면에서 완전 삭제 대신 할당 해제를 수행할 수 있으나 
                // 안전을 위해 여기서 삭제 기능은 제한합니다.
                alert("프로젝트에 속한 태스크는 프로젝트 관리 화면에서 직접 삭제해야 합니다.");
                return;
            }
            
            await deletePersonalTask(taskId);
            fetchTasks();
            if (selectedTask?.id === taskId) setSelectedTask(null);
        } catch (error) {
            console.error("Failed to delete task:", error);
        }
    };

    // Subtask Logic (for Create Modal)
    const addSubtask = () => {
        if (!newSubtask.trim()) return;
        const sub = {
            id: Date.now(),
            text: newSubtask,
            link: newSubtaskLink || null,
            completed: false
        };
        setTaskForm(prev => ({ ...prev, subtasks: [...prev.subtasks, sub] }));
        setNewSubtask('');
        setNewSubtaskLink('');
    };

    const removeSubtask = (id) => {
        setTaskForm(prev => ({ ...prev, subtasks: prev.subtasks.filter(s => s.id !== id) }));
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        개인 Task 관리
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">
                        프로젝트와 무관한 개인적인 업무 및 할 일을 관리합니다.
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-sm transition-all shadow-md shadow-indigo-100"
                >
                    <Plus size={18} />
                    새 할 일
                </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 max-w-sm">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="할 일 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">상태</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
                        >
                            <option value="all">전체</option>
                            <option value="todo">할 일</option>
                            <option value="in_progress">진행 중</option>
                            <option value="completed">완료</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">중요도</span>
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
                        >
                            <option value="all">전체</option>
                            <option value="urgent">긴급</option>
                            <option value="high">높음</option>
                            <option value="medium">보통</option>
                            <option value="low">낮음</option>
                        </select>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 border border-slate-200 ml-auto">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <List size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('card')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'card' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <LayoutGrid size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : filteredTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Plus size={48} className="mb-4 opacity-20" />
                            <p className="font-bold">등록된 할 일이 없습니다.</p>
                        </div>
                    ) : viewMode === 'list' ? (
                        <MondayBoard
                            tasks={filteredTasks}
                            onSelect={setSelectedTask}
                            onUpdateTask={handleUpdateTask}
                            onDeleteTask={handleDelete}
                            onAddTask={handleQuickAddTask}
                            onCreateSubtask={handleCreateSubtask}
                        />
                    ) : (
                        <TaskCardView
                            tasks={filteredTasks}
                            onSelect={setSelectedTask}
                            onToggleStatus={toggleStatus}
                        />
                    )}
                </div>
            </div>

            {/* Create Task Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <Plus className="text-indigo-600" /> 새 할 일 등록
                            </h2>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl"><X size={18} /></button>
                        </div>

                        <form onSubmit={handleCreateTask} className="p-6 space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">할 일 제목</label>
                                <input
                                    type="text"
                                    required
                                    value={taskForm.title}
                                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                                    placeholder="무엇을 해야 하나요?"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">상세 설명 (Rich Memo)</label>
                                <RichMemoEditor
                                    value={taskForm.description}
                                    onChange={(val) => setTaskForm({ ...taskForm, description: val })}
                                    placeholder="헤더, 리스트, 테이블 등을 사용하여 자유롭게 작성하세요..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">중요도</label>
                                    <select
                                        value={taskForm.priority}
                                        onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                        <option value="low">낮음</option>
                                        <option value="medium">보통</option>
                                        <option value="high">높음</option>
                                        <option value="urgent">긴급</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">기한 (날짜 및 시간)</label>
                                    <input
                                        type="datetime-local"
                                        value={taskForm.dueDate}
                                        onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">예산 (USD)</label>
                                    <input
                                        type="number"
                                        value={taskForm.budget}
                                        onChange={(e) => setTaskForm({ ...taskForm, budget: Number(e.target.value) })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">알람</label>
                                        <button
                                            type="button"
                                            onClick={() => setTaskForm(prev => ({ ...prev, alarmEnabled: !prev.alarmEnabled }))}
                                            className={`w-full py-3 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2 ${taskForm.alarmEnabled ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400'}`}
                                        >
                                            {taskForm.alarmEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                                            <span className="text-xs font-bold">{taskForm.alarmEnabled ? '설정됨' : '꺼짐'}</span>
                                        </button>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">반복</label>
                                        <select
                                            value={taskForm.recurring}
                                            onChange={(e) => setTaskForm({ ...taskForm, recurring: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                        >
                                            <option value="none">안 함</option>
                                            <option value="daily">매일</option>
                                            <option value="weekly">매주</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase block tracking-widest">세부 항목 및 파일 링크</label>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={newSubtask}
                                        onChange={(e) => setNewSubtask(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="세부 항목 내용..."
                                    />
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={newSubtaskLink}
                                                onChange={(e) => setNewSubtaskLink(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-[10px] font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="구글 드라이브 또는 파일 URL..."
                                            />
                                        </div>
                                        <button type="button" onClick={addSubtask} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all">추가</button>
                                    </div>
                                </div>
                                {taskForm.subtasks.length > 0 && (
                                    <div className="mt-3 space-y-1.5">
                                        {taskForm.subtasks.map(sub => (
                                            <div key={sub.id} className="flex items-center justify-between bg-white border border-slate-100 px-3 py-2 rounded-lg shadow-sm">
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-slate-700">{sub.text}</span>
                                                    {sub.link && <span className="text-[9px] text-blue-500 truncate max-w-[300px] font-medium">{sub.link}</span>}
                                                </div>
                                                <button type="button" onClick={() => removeSubtask(sub.id)} className="p-1 text-slate-300 hover:text-rose-500"><X size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="flex-1 py-3 rounded-2xl text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 rounded-2xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all"
                                >
                                    할 일 등록
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <TaskDetailPanel
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                task={selectedTask}
                allTasks={tasks}
                onSelectTask={setSelectedTask}
                onCreateSubtask={handleCreateSubtask}
                onUpdate={handleUpdateTask}
                onDelete={handleDelete}
            />
        </div>
    );
}
