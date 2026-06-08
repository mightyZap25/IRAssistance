import React, { useState, useEffect } from 'react';
import { X, Plus, Folder, Package, Trash2, Edit2, Check, XCircle } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, deleteDoc, doc, serverTimestamp, setDoc, query, where } from '../firebase';

export default function CategoryManagerModal({ onClose, onUpdate }) {
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState(null);

    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    // 신규 항목 추가용
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isAddingSeries, setIsAddingSeries] = useState(false);
    const [newSeriesName, setNewSeriesName] = useState('');

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'parts'), where('Class', 'in', ['BOM_Category', 'BOM_Series'])));
            const data = snap.docs.map(d => ({
                id: d.id,
                type: d.data().Class === 'BOM_Category' ? 'category' : 'series',
                name: d.data().Name,
                parentId: d.data().ParentFolderId || null
            }));
            data.sort((a, b) => a.name.localeCompare(b.name));
            setFolders(data);
            if (selectedCategory) {
                const stillExists = data.find(f => f.id === selectedCategory.id);
                if (!stillExists) setSelectedCategory(null);
            }
        } catch (error) {
            console.error('폴더 목록 로딩 에러:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveNewCategory = async () => {
        if (!newCategoryName.trim()) {
            setIsAddingCategory(false);
            return;
        }
        const id = `CAT-${Date.now()}`;
        try {
            await setDoc(doc(db, 'parts', id), {
                PartID: id,
                Class: 'BOM_Category',
                Name: newCategoryName.trim(),
                createdAt: serverTimestamp(),
                Status: 'Active'
            });
            setNewCategoryName('');
            setIsAddingCategory(false);
            await fetchFolders();
            onUpdate();
        } catch (err) {
            console.error(err);
            alert(`카테고리 생성 중 오류가 발생했습니다: ${err.message}`);
        }
    };

    const handleSaveNewSeries = async () => {
        if (!selectedCategory || !newSeriesName.trim()) {
            setIsAddingSeries(false);
            return;
        }
        const id = `SER-${Date.now()}`;
        try {
            await setDoc(doc(db, 'parts', id), {
                PartID: id,
                Class: 'BOM_Series',
                Name: newSeriesName.trim(),
                ParentFolderId: selectedCategory.id,
                createdAt: serverTimestamp(),
                Status: 'Active'
            });
            setNewSeriesName('');
            setIsAddingSeries(false);
            await fetchFolders();
            onUpdate();
        } catch (err) {
            console.error(err);
            alert(`시리즈 생성 중 오류가 발생했습니다: ${err.message}`);
        }
    };

    const handleDelete = async (item) => {
        if (!window.confirm(`'${item.name}' 항목을 정말 삭제하시겠습니까?`)) return;
        try {
            if (item.type === 'category') {
                const children = folders.filter(f => f.parentId === item.id);
                for (const child of children) {
                    await deleteDoc(doc(db, 'parts', child.id));
                }
            }
            await deleteDoc(doc(db, 'parts', item.id));
            await fetchFolders();
            onUpdate();
        } catch (err) {
            console.error(err);
            alert(`삭제 중 오류가 발생했습니다: ${err.message}`);
        }
    };

    const handleSaveEdit = async (item) => {
        if (!editName.trim()) {
            setEditingId(null);
            return;
        }
        try {
            await updateDoc(doc(db, 'parts', item.id), { Name: editName.trim() });
            setEditingId(null);
            await fetchFolders();
            onUpdate();
        } catch (err) {
            console.error(err);
            alert(`수정 중 오류가 발생했습니다: ${err.message}`);
        }
    };

    const categories = folders.filter(f => f.type === 'category');
    const seriesList = selectedCategory
        ? folders.filter(f => f.type === 'series' && f.parentId === selectedCategory.id)
        : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 w-[620px] h-[520px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Folder className="text-indigo-500" size={18} />
                        BOM 카테고리 &amp; 시리즈 관리
                    </h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* ===== Left Panel: Categories ===== */}
                    <div className="w-1/2 border-r border-slate-100 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
                        {/* 카테고리 헤더 */}
                        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">카테고리 (대분류)</h3>
                            <button
                                onClick={() => { setIsAddingCategory(true); setNewCategoryName(''); }}
                                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                            >
                                <Plus size={12} /> 추가
                            </button>
                        </div>

                        {/* 카테고리 목록 */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {/* 새 카테고리 입력 폼 */}
                            {isAddingCategory && (
                                <div className="flex items-center gap-1 w-full p-2 rounded-lg bg-blue-50 border border-blue-200 mb-1">
                                    <input
                                        autoFocus
                                        placeholder="카테고리명 입력 후 Enter"
                                        className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200"
                                        value={newCategoryName}
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveNewCategory();
                                            if (e.key === 'Escape') setIsAddingCategory(false);
                                        }}
                                    />
                                    <button onClick={handleSaveNewCategory} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded shrink-0">
                                        <Check size={14} />
                                    </button>
                                    <button onClick={() => setIsAddingCategory(false)} className="text-slate-400 p-1 hover:bg-slate-100 rounded shrink-0">
                                        <XCircle size={14} />
                                    </button>
                                </div>
                            )}

                            {loading ? (
                                <div className="text-center text-xs text-slate-400 py-6">로딩 중...</div>
                            ) : categories.length === 0 ? (
                                <div className="text-center text-xs text-slate-400 py-6">카테고리가 없습니다.<br/>위의 [추가] 버튼을 눌러 만들어보세요.</div>
                            ) : (
                                categories.map(cat => (
                                    <div
                                        key={cat.id}
                                        className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${selectedCategory?.id === cat.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}`}
                                        onClick={() => { setSelectedCategory(cat); setIsAddingSeries(false); }}
                                    >
                                        {editingId === cat.id ? (
                                            <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    className="flex-1 text-sm border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-100"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleSaveEdit(cat);
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                />
                                                <button onClick={() => handleSaveEdit(cat)} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded"><Check size={14} /></button>
                                                <button onClick={() => setEditingId(null)} className="text-slate-400 p-1 hover:bg-slate-100 rounded"><XCircle size={14} /></button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-2 font-semibold text-sm text-slate-700 truncate">
                                                    <Folder size={14} className={selectedCategory?.id === cat.id ? 'text-indigo-500' : 'text-slate-400'} />
                                                    {cat.name}
                                                </div>
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button onClick={e => { e.stopPropagation(); setEditName(cat.name); setEditingId(cat.id); }} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button onClick={e => { e.stopPropagation(); handleDelete(cat); }} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ===== Right Panel: Series ===== */}
                    <div className="w-1/2 flex flex-col bg-slate-50/30 dark:bg-slate-900/50">
                        {/* 시리즈 헤더 (항상 표시) */}
                        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate">
                                {selectedCategory ? `[${selectedCategory.name}] 시리즈` : '시리즈 (소분류)'}
                            </h3>
                            <button
                                onClick={() => { if (selectedCategory) { setIsAddingSeries(true); setNewSeriesName(''); } }}
                                disabled={!selectedCategory}
                                title={selectedCategory ? '시리즈 추가' : '먼저 좌측에서 카테고리를 선택하세요'}
                                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded transition-colors shrink-0 ${selectedCategory ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-slate-300 bg-slate-100 cursor-not-allowed'}`}
                            >
                                <Plus size={12} /> 추가
                            </button>
                        </div>

                        {selectedCategory ? (
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {/* 새 시리즈 입력 폼 */}
                                {isAddingSeries && (
                                    <div className="flex items-center gap-1 w-full p-2 rounded-lg bg-indigo-50 border border-indigo-200 mb-1">
                                        <input
                                            autoFocus
                                            placeholder="시리즈명 입력 후 Enter"
                                            className="flex-1 text-sm border border-indigo-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200"
                                            value={newSeriesName}
                                            onChange={e => setNewSeriesName(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveNewSeries();
                                                if (e.key === 'Escape') setIsAddingSeries(false);
                                            }}
                                        />
                                        <button onClick={handleSaveNewSeries} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded shrink-0">
                                            <Check size={14} />
                                        </button>
                                        <button onClick={() => setIsAddingSeries(false)} className="text-slate-400 p-1 hover:bg-slate-100 rounded shrink-0">
                                            <XCircle size={14} />
                                        </button>
                                    </div>
                                )}

                                {seriesList.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-slate-400 py-10 gap-2 text-center">
                                        <Package size={28} className="text-slate-200" />
                                        <span className="text-xs">이 카테고리에 시리즈가 없습니다.<br />[추가] 버튼을 눌러 만들어보세요.</span>
                                    </div>
                                ) : (
                                    seriesList.map(ser => (
                                        <div key={ser.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-sm transition-all">
                                            {editingId === ser.id ? (
                                                <div className="flex items-center gap-1 w-full">
                                                    <input
                                                        autoFocus
                                                        className="flex-1 text-sm border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-100"
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSaveEdit(ser);
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                    />
                                                    <button onClick={() => handleSaveEdit(ser)} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded"><Check size={14} /></button>
                                                    <button onClick={() => setEditingId(null)} className="text-slate-400 p-1 hover:bg-slate-100 rounded"><XCircle size={14} /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2 font-medium text-sm text-slate-600 truncate">
                                                        <Package size={13} className="text-indigo-400 shrink-0" />
                                                        {ser.name}
                                                    </div>
                                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <button onClick={() => { setEditName(ser.name); setEditingId(ser.id); }} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button onClick={() => handleDelete(ser)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 p-6 text-center">
                                <Folder size={44} className="text-slate-200 dark:text-slate-700" />
                                <div className="text-sm font-medium">좌측에서 카테고리를 선택하시면<br />해당 카테고리의 시리즈를 관리할 수 있습니다.</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
