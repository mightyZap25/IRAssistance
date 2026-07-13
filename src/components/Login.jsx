import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, User, KeyRound } from 'lucide-react';

export default function Login() {
    const { login, loginWithOdoo, error: authError } = useAuth();
    
    const [showOdooLogin, setShowOdooLogin] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
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
    // 자동 로그인(popup) 로직은 브라우저 팝업 차단 정책으로 인해 
    // 사용자 클릭 없이 실행 시도하면 막힐 수 있으므로 제거합니다.

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">I-Link Access</h2>
                
                <>
                    <p className="text-slate-500 mb-8">Sign in with your Google account</p>

                        {error && (
                            <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={login}
                            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg transition-all shadow-sm mb-6"
                        >
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                            Sign in with Google
                        </button>
                        
                        <div className="relative flex py-5 items-center">
                            <div className="flex-grow border-t border-slate-200"></div>
                            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-semibold uppercase tracking-wider">OR</span>
                            <div className="flex-grow border-t border-slate-200"></div>
                        </div>

                        {!showOdooLogin ? (
                            <button
                                onClick={() => setShowOdooLogin(true)}
                                className="w-full text-slate-500 font-semibold text-sm hover:text-slate-800 transition-colors"
                            >
                                현장직 전용 로그인 (Odoo 계정)
                            </button>
                        ) : (
                            <form onSubmit={handleOdooSubmit} className="flex flex-col gap-3 animate-fade-in text-left">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1 ml-1">Odoo ID (이메일)</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <User className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                                            placeholder="아이디를 입력하세요"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1 ml-1">Password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <KeyRound className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-sm font-semibold text-slate-800 placeholder-slate-400"
                                            placeholder="비밀번호를 입력하세요"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-md mt-2"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '현장직 로그인'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowOdooLogin(false)}
                                    className="w-full text-slate-400 hover:text-slate-600 text-xs font-semibold mt-2"
                                >
                                    돌아가기
                                </button>
                            </form>
                        )}
                    </>
            </div>
        </div>
    );
}
