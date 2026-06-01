import React, { useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const modules = {
    toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'image'],
        ['clean']
    ],
};

const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'link', 'image'
];

export default function RichMemoEditor({ value, onChange, placeholder, readOnly = false }) {
    return (
        <div className="rich-memo-editor bg-white rounded-xl overflow-hidden border border-slate-200 shadow-inner">
            <ReactQuill 
                theme="snow"
                value={value || ''}
                onChange={onChange}
                modules={readOnly ? { toolbar: false } : modules}
                formats={formats}
                placeholder={placeholder}
                readOnly={readOnly}
                className={readOnly ? 'read-only-quill' : ''}
            />
            <style jsx global>{`
                .rich-memo-editor .ql-toolbar.ql-snow {
                    border: none;
                    border-bottom: 1px solid #f1f5f9;
                    background: #f8fafc;
                    padding: 8px;
                }
                .rich-memo-editor .ql-container.ql-snow {
                    border: none;
                    min-height: 150px;
                    font-size: 13px;
                    font-family: inherit;
                }
                .rich-memo-editor .read-only-quill .ql-container.ql-snow {
                    min-height: auto;
                }
                .rich-memo-editor .ql-editor {
                    padding: 12px 16px;
                }
                .rich-memo-editor .ql-editor.ql-blank::before {
                    color: #cbd5e1;
                    font-style: normal;
                    font-weight: 500;
                }
            `}</style>
        </div>
    );
}
