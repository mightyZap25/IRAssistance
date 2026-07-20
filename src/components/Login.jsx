import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, User, KeyRound } from 'lucide-react';

export default function Login() {
    const { login, loginWithOdoo, error: authError, currentUser, odooLinked, linkOdoo } = useAuth();
    
    const [showOdooLogin, setShowOdooLogin] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [linkPassword, setLinkPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [localError, setLocalError] = useState('');
    
    const error = authError || localError;

    const handleOdooSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        if (!username || !password) {
            setLocalError('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }
        setIsLoading(true);
        try {
            await loginWithOdoo(username, password);
        } catch(err) {
            setLocalError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleOdooLinkSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        if (!linkPassword) {
            setLocalError('Odoo 비밀번호를 입력해주세요.');
            return;
        }
        setIsLoading(true);
        try {
            await linkOdoo(linkPassword);
        } catch(err) {
            setLocalError(err.message);
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">I-Link Access</h2>
                <p className="text-slate-500 mb-8">계정에 로그인하세요</p>

                {error && (
                    <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold">
                        {error}
                    </div>
                )}

                {showOdooLogin ? (
                    <form onSubmit={handleOdooSubmit} className="flex flex-col gap-4 animate-fade-in mt-4">
                        <div className="flex flex-col text-left gap-1">
                            <label className="text-xs font-bold text-slate-500">Odoo 이메일</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    placeholder="email@example.com"
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex flex-col text-left gap-1">
                            <label className="text-xs font-bold text-slate-500">비밀번호</label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={18} /> : '로그인'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowOdooLogin(false)}
                            className="text-sm text-slate-500 hover:text-slate-700 underline mt-2"
                        >
                            Google 계정으로 로그인하기
                        </button>
                    </form>
                ) : (
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={login}
                            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg transition-all shadow-sm"
                        >
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                            Google Workspace로 로그인 (@mightyzap.com)
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowOdooLogin(true)}
                            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-4 rounded-lg transition-all"
                        >
                            <User size={18} />
                            Odoo 직접 로그인 (조회 전용)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
