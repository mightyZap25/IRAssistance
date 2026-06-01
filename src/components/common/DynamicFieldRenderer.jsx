import React from 'react';
import { ExternalLink, FileText, CheckCircle2, Calendar, Hash, Type } from 'lucide-react';

/**
 * DynamicFieldRenderer
 * 메타데이터 정의에 따라 필드들을 렌더링하는 컴포넌트
 */
export default function DynamicFieldRenderer({ fields, data, onFieldChange, isReadOnly = true }) {
    if (!fields || fields.length === 0) return null;

    // 그룹별로 필드 분류
    const groupedFields = fields.reduce((acc, field) => {
        const group = field.group || 'General';
        if (!acc[group]) acc[group] = [];
        acc[group].push(field);
        return acc;
    }, {});

    // 필드 순서 정렬
    Object.keys(groupedFields).forEach(group => {
        groupedFields[group].sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    return (
        <div className="space-y-8">
            {Object.entries(groupedFields).map(([groupName, groupFields]) => (
                <div key={groupName} className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800/60">
                        <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em]">
                            {groupName}
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {groupFields.map(field => (
                            <FieldItem 
                                key={field.id} 
                                field={field} 
                                value={data ? data[field.label] || data[field.id] : ''} 
                                isReadOnly={isReadOnly}
                                onChange={(val) => onFieldChange && onFieldChange(field.id, val)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function FieldItem({ field, value, isReadOnly, onChange }) {
    if (field.isVisible === false) return null;

    const renderValue = () => {
        if (!value && isReadOnly) return <span className="text-slate-400 italic text-[10px]">미입력</span>;

        switch (field.fieldType) {
            case 'checkbox':
                return (
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className={value ? 'text-emerald-500' : 'text-slate-300'} />
                        <span className="text-[11px] font-bold">{value ? 'Yes' : 'No'}</span>
                    </div>
                );
            case 'link':
                return (
                    <a 
                        href={value} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate"
                    >
                        <ExternalLink size={12} /> {value}
                    </a>
                );
            case 'memo':
                return (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {value}
                    </div>
                );
            case 'date':
                return (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Calendar size={12} />
                        <span>{value}</span>
                    </div>
                );
            case 'number':
                return <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{value}</span>;
            default:
                return <span className="text-slate-700 dark:text-slate-200 font-bold">{value}</span>;
        }
    };

    const getIcon = () => {
        switch (field.fieldType) {
            case 'number': return <Hash size={12} />;
            case 'date': return <Calendar size={12} />;
            case 'checkbox': return <CheckCircle2 size={12} />;
            case 'memo': return <FileText size={12} />;
            default: return <Type size={12} />;
        }
    };

    return (
        <div className="py-2 px-3 flex justify-between items-center text-xs gap-3 transition-all rounded-xl duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/20 group">
            <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                    {getIcon()}
                </span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.1em]">
                    {field.label}
                    {field.isRequired && <span className="text-rose-500 ml-0.5">*</span>}
                </span>
            </div>
            <div className="font-black text-right truncate max-w-[200px] text-[11px]">
                {renderValue()}
            </div>
        </div>
    );
}
