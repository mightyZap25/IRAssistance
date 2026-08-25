import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, Send, Loader2, Sparkles, Database } from 'lucide-react';
import { createAgentChatSession } from '../services/aiAgentService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AgentChatPage() {
    const [messages, setMessages] = useState([
        { role: 'ai', content: '안녕하세요! 저는 사내 ERP(Odoo) 데이터를 조회하고 분석할 수 있는 AI 비서입니다. 무엇을 도와드릴까요?', isInitial: true }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [toolStatus, setToolStatus] = useState(null);
    const messagesEndRef = useRef(null);
    const chatSessionRef = useRef(null);

    useEffect(() => {
        // Init chat session
        const initChat = async () => {
            try {
                const session = await createAgentChatSession(
                    (streamText) => {
                        // Stream update if we were to support streaming
                    },
                    (sql) => {
                        setToolStatus(`DB 조회 중...`);
                    }
                );
                chatSessionRef.current = session;
            } catch (err) {
                console.error('Agent Init Error:', err);
                setMessages(prev => [...prev, { role: 'error', content: err.message }]);
            }
        };
        initChat();
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, toolStatus]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);
        setToolStatus(null);
        
        try {
            if (!chatSessionRef.current) {
                throw new Error("AI 에이전트가 아직 준비되지 않았습니다.");
            }
            
            const responseText = await chatSessionRef.current.sendMessage(userMsg);
            
            setMessages(prev => [...prev, { role: 'ai', content: responseText }]);
        } catch (err) {
            console.error('Chat Error:', err);
            setMessages(prev => [...prev, { role: 'error', content: `[오류]: ${err.message}` }]);
        } finally {
            setIsLoading(false);
            setToolStatus(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="h-16 shrink-0 border-b border-slate-100 dark:border-slate-800 px-6 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-slate-800 dark:text-slate-100">mightyONE (RAG Agent)</h1>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">사내 데이터베이스 기반 AI 비서</p>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/50">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                            msg.role === 'user' 
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' 
                                : msg.role === 'error'
                                    ? 'bg-red-100 text-red-500'
                                    : 'bg-indigo-600 text-white'
                        }`}>
                            {msg.role === 'user' ? <User size={16} /> : (msg.role === 'error' ? <Sparkles size={16} /> : <Bot size={16} />)}
                        </div>

                        {/* Message Bubble */}
                        <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                            msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                : msg.role === 'error'
                                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-tl-sm'
                                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-sm shadow-sm'
                        }`}>
                            {msg.role === 'user' ? (
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            ) : (
                                <div className="prose prose-sm dark:prose-invert prose-indigo max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                
                {/* Loading / Tool Status */}
                {isLoading && (
                    <div className="flex gap-4 flex-row">
                        <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-indigo-600 text-white">
                            <Bot size={16} />
                        </div>
                        <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-sm flex flex-col gap-2">
                            {toolStatus ? (
                                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800/50 animate-pulse">
                                    <Database size={14} className="animate-bounce" />
                                    <span>{toolStatus}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-slate-500">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs font-bold animate-pulse">생각하는 중...</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="relative max-w-4xl mx-auto flex items-end gap-2">
                    <div className="flex-1 relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="ERP 데이터에 대해 무엇이든 물어보세요... (예: '이번 달 가장 많이 생산된 부품 3개 알려줘')"
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5 pr-12 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none custom-scrollbar min-h-[52px] max-h-32"
                            rows={1}
                            style={{ height: 'auto' }}
                        />
                    </div>
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="w-12 h-12 shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm active:scale-95"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <div className="mt-2 text-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                        AI 에이전트는 실시간 DB를 조회하여 답변을 제공합니다. (주의: 환각 현상이 있을 수 있으니 중요 수치는 교차 검증하세요)
                    </p>
                </div>
            </div>
        </div>
    );
}
