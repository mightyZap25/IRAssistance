import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, GripVertical } from 'lucide-react';

const DEFAULT_COLUMNS = [
    { id: 'todo', title: 'To Do', order: 0, color: 'bg-slate-100' },
    { id: 'in_progress', title: 'In Progress', order: 1, color: 'bg-blue-50' },
    { id: 'done', title: 'Done', order: 2, color: 'bg-emerald-50' }
];

export default function ProjectModal({ isOpen, onClose, onSave, initialData }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [columns, setColumns] = useState(DEFAULT_COLUMNS);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name || '');
            setDescription(initialData.description || '');
            setColumns(initialData.columns || DEFAULT_COLUMNS);
        } else {
            setName('');
            setDescription('');
            setColumns(DEFAULT_COLUMNS);
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleAddColumn = () => {
        const newId = `col_${Date.now()}`;
        setColumns([...columns, { 
            id: newId, 
            title: 'New Column', 
            order: columns.length, 
            color: 'bg-slate-50' 
        }]);
    };

    const handleRemoveColumn = (id) => {
        if (columns.length <= 1) return alert("At least one column is required.");
        setColumns(columns.filter(c => c.id !== id));
    };

    const handleColumnChange = (id, field, value) => {
        setColumns(columns.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ name, description, columns });
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight italic">
                            {initialData ? 'Edit Project' : 'Create New Project'}
                        </h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Define your workspace and workflow columns
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1">Project Name</label>
                            <input
                                required
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                placeholder="e.g., New Product Development"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1">Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={2}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                                placeholder="What is this project about?"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-3 px-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Board Columns</label>
                                <button 
                                    type="button"
                                    onClick={handleAddColumn}
                                    className="text-[10px] font-black text-blue-600 flex items-center gap-1 hover:underline"
                                >
                                    <Plus size={12} /> Add Column
                                </button>
                            </div>
                            
                            <div className="space-y-2">
                                {columns.map((col, index) => (
                                    <div key={col.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 group">
                                        <div className="text-slate-300 cursor-grab active:cursor-grabbing">
                                            <GripVertical size={16} />
                                        </div>
                                        <input
                                            type="text"
                                            value={col.title}
                                            onChange={e => handleColumnChange(col.id, 'title', e.target.value)}
                                            className="flex-1 bg-transparent border-none p-0 text-sm font-bold text-slate-700 focus:ring-0 outline-none"
                                            placeholder="Column Title"
                                        />
                                        <select
                                            value={col.color}
                                            onChange={e => handleColumnChange(col.id, 'color', e.target.value)}
                                            className="bg-white border border-slate-200 text-[10px] font-bold rounded px-2 py-1 outline-none"
                                        >
                                            <option value="bg-slate-100">Gray</option>
                                            <option value="bg-blue-50">Blue</option>
                                            <option value="bg-emerald-50">Green</option>
                                            <option value="bg-orange-50">Orange</option>
                                            <option value="bg-purple-50">Purple</option>
                                        </select>
                                        <button 
                                            type="button"
                                            onClick={() => handleRemoveColumn(col.id)}
                                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </form>

                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 border-2 border-slate-200 text-slate-400 font-black rounded-xl hover:bg-white hover:text-slate-600 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="flex-1 max-w-[200px] flex items-center justify-center gap-2 bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                        <Save size={18} /> {initialData ? 'Update Project' : 'Create Project'}
                    </button>
                </div>
            </div>
        </div>
    );
}
