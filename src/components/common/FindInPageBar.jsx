import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

export default function FindInPageBar({ webviewRef, nativeDOM = false }) {
    const [isVisible, setIsVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [matchCount, setMatchCount] = useState(0);
    const [activeMatch, setActiveMatch] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ctrl+F (Windows/Linux) or Cmd+F (Mac)
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setIsVisible(true);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
            if (e.key === 'Escape' && isVisible) {
                closeSearch();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible) return;
        
        if (webviewRef && webviewRef.current) {
            const webview = webviewRef.current;
            const handleFound = (e) => {
                setMatchCount(e.result.matches);
                setActiveMatch(e.result.activeMatchOrdinal);
            };
            webview.addEventListener('found-in-page', handleFound);
            
            if (searchText) {
                webview.findInPage(searchText);
            } else {
                webview.stopFindInPage('clearSelection');
                setMatchCount(0);
                setActiveMatch(0);
            }
            
            return () => {
                webview.removeEventListener('found-in-page', handleFound);
            };
        }
    }, [searchText, isVisible, webviewRef]);

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchText(val);
        if (nativeDOM && val) {
            // First clear previous selection to start fresh search from top if needed, 
            // but for simplicity we just find next natively.
            // A small delay or just relying on enter is better for nativeDOM.
        }
    };

    const findNext = () => {
        if (webviewRef && webviewRef.current && searchText) {
            webviewRef.current.findInPage(searchText, { forward: true, findNext: true });
        } else if (nativeDOM && searchText) {
            // aCaseSensitive, aBackwards, aWrapAround, aWholeWord, aSearchInFrames, aShowDialog
            window.find(searchText, false, false, true, false, false, false);
        }
    };

    const findPrev = () => {
        if (webviewRef && webviewRef.current && searchText) {
            webviewRef.current.findInPage(searchText, { forward: false, findNext: true });
        } else if (nativeDOM && searchText) {
            window.find(searchText, false, true, true, false, false, false);
        }
    };

    const closeSearch = () => {
        setIsVisible(false);
        setSearchText('');
        if (webviewRef && webviewRef.current) {
            webviewRef.current.stopFindInPage('clearSelection');
        }
    };

    if (!isVisible) return null;

    return (
        <div className="absolute top-4 right-6 z-[9999] bg-white border border-slate-200 shadow-xl rounded-lg p-2 flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <Search size={16} className="text-slate-400 ml-1" />
            <input
                ref={inputRef}
                type="text"
                className="outline-none border-none text-sm w-48 px-1 text-slate-700 bg-transparent"
                placeholder="페이지 내 검색..."
                value={searchText}
                onChange={handleSearchChange}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        if (e.shiftKey) findPrev();
                        else findNext();
                    }
                }}
            />
            {webviewRef && searchText && (
                <span className="text-[11px] font-medium text-slate-400 min-w-[36px] text-right">
                    {activeMatch}/{matchCount}
                </span>
            )}
            <div className="flex border-l border-slate-200 pl-2 gap-1">
                <button onClick={findPrev} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors" title="이전 (Shift+Enter)">
                    <ChevronUp size={14} />
                </button>
                <button onClick={findNext} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors" title="다음 (Enter)">
                    <ChevronDown size={14} />
                </button>
                <button onClick={closeSearch} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded ml-1 transition-colors" title="닫기 (Esc)">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
