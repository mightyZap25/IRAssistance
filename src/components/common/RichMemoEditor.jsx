import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Save, RefreshCw, Edit3, ChevronDown, ChevronUp } from 'lucide-react';

const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'link', 'image'
];

export default function RichMemoEditor({ value, onChange, onSave, saving = false, placeholder, readOnly = false, showToggle = false }) {
    // showToggle이 false면 항상 모든 메뉴를 보여줌 (일반 페이지용)
    const [showFullToolbar, setShowFullToolbar] = useState(!showToggle);
    const [internalValue, setInternalValue] = useState(value || '');
    const debounceTimer = useRef(null);

    // 고유 ID는 컴포넌트 생명주기 동안 한 번만 생성
    const toolbarId = useMemo(() => 
        `toolbar-${Math.random().toString(36).substr(2, 5)}`, 
    []);

    // 외부에서 value가 변경될 때 (최초 로드 등) 내부 상태 업데이트
    useEffect(() => {
        if (value !== internalValue) {
            setInternalValue(value || '');
        }
    }, [value]);

    // 입력 핸들러: 내부 상태는 즉시 업데이트, 부모 상태는 디바운스 처리
    const handleChange = (content) => {
        setInternalValue(content);
        
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(() => {
            onChange(content);
        }, 300);
    };

    // 컴포넌트 언마운트 시 타이머 정리
    useEffect(() => {
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, []);

    return (
        <div className="rich-memo-editor bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full relative">
            {/* Custom Quill Toolbar Container */}
            <div id={toolbarId} className="flex flex-wrap items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/50 shrink-0 !border-0 z-30 gap-y-2">
                <div className="flex flex-wrap items-center gap-y-1">
                    {/* Save Button */}
                    <button 
                        onClick={() => {
                            onChange(internalValue);
                            setTimeout(onSave, 0);
                        }}
                        disabled={saving}
                        className={`flex items-center justify-center px-2.5 h-8 rounded-lg transition-all shadow-sm shrink-0 mr-2 text-[10px] font-black ${
                            saving 
                            ? '!bg-slate-100 !text-slate-400' 
                            : '!bg-emerald-600 hover:!bg-emerald-700 !text-white active:scale-95'
                        }`}
                        title="저장 (Save)"
                    >
                        {saving ? '저장중' : '저장'}
                    </button>

                    <div className="w-px h-6 bg-slate-200 mx-1 mr-2" />

                    {/* Quill Formats */}
                    <span className="ql-formats !mr-1">
                        <select className="ql-header" defaultValue="">
                            <option value="1">Heading 1</option>
                            <option value="2">Heading 2</option>
                            <option value="3">Heading 3</option>
                            <option value="">Normal</option>
                        </select>
                    </span>

                    <span className="ql-formats !mr-1">
                        <button className="ql-bold" />
                        <button className={`ql-italic ${!showFullToolbar ? '!hidden' : ''}`} />
                        <button className={`ql-underline ${!showFullToolbar ? '!hidden' : ''}`} />
                        <button className="ql-strike" />
                    </span>

                    <span className="ql-formats !mr-1">
                        <button className="ql-list" value="ordered" />
                        <button className="ql-list" value="bullet" />
                    </span>

                    <span className={`ql-formats !mr-1 ${!showFullToolbar ? '!hidden' : ''}`}>
                        <select className="ql-color" />
                        <select className="ql-background" />
                    </span>

                    <span className={`ql-formats !mr-1 ${!showFullToolbar ? '!hidden' : ''}`}>
                        <button className="ql-link" />
                        <button className="ql-image" />
                    </span>
                    
                    <span className="ql-formats !mr-0">
                        <button className="ql-clean" />
                    </span>
                </div>

                {/* Right: Toggle Button 'V' */}
                {!readOnly && showToggle && (
                    <button 
                        onClick={() => setShowFullToolbar(!showFullToolbar)}
                        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all shrink-0 ml-2 ${showFullToolbar ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
                        title={showFullToolbar ? "간단 모드" : "상세 모드"}
                    >
                        {showFullToolbar ? <ChevronUp size={14} strokeWidth={3} /> : <ChevronDown size={14} strokeWidth={3} />}
                    </button>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <ReactQuill 
                    theme="snow"
                    value={internalValue}
                    onChange={handleChange}
                    modules={readOnly ? { toolbar: false } : { 
                        toolbar: `#${toolbarId}`
                    }}
                    formats={formats}
                    placeholder={placeholder}
                    readOnly={readOnly}
                    className="h-full flex flex-col"
                />
            </div>

            <style jsx global>{`
                .rich-memo-editor .quill {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .rich-memo-editor .ql-toolbar.ql-snow {
                    border: none !important;
                    border-bottom: 1px solid #f1f5f9 !important;
                    background: #fff !important;
                    padding: 8px 16px !important;
                    flex-shrink: 0;
                    z-index: 10;
                }
                .rich-memo-editor .ql-container.ql-snow {
                    border: none !important;
                    flex: 1 !important;
                    overflow-y: auto !important;
                    font-size: 14px;
                    font-family: inherit;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }
                .rich-memo-editor .ql-editor {
                    padding: 24px !important;
                    flex: 1;
                    overflow-y: auto;
                    height: 100%;
                }
                .rich-memo-editor .ql-snow .ql-picker-options {
                    z-index: 100 !important;
                    border-radius: 8px !important;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
                }
                .rich-memo-editor .ql-editor.ql-blank::before {
                    left: 24px;
                    color: #cbd5e1;
                    font-style: normal;
                    font-weight: 500;
                }
                .rich-memo-editor .ql-editor::-webkit-scrollbar {
                    width: 4px;
                }
                .rich-memo-editor .ql-editor::-webkit-scrollbar-thumb {
                    background-color: #e2e8f0;
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
}
