import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Login() {
    const { login, error } = useAuth();
    // 자동 로그인(popup) 로직은 브라우저 팝업 차단 정책으로 인해 
    // 사용자 클릭 없이 실행 시도하면 막힐 수 있으므로 제거합니다.

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">IR Assistant Access</h2>
                
                <>
                    <p className="text-slate-500 mb-8">Sign in with your Google account</p>

                        {error && (
                            <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={login}
                            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg transition-all shadow-sm"
                        >
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                            Sign in with Google
                        </button>
                    </>
            </div>
        </div>
    );
}
