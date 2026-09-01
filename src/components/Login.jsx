import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
    const { login, error: authError } = useAuth();
    
    const [localError] = useState('');
    const error = authError || localError;

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">mightyONE Access</h2>
                <p className="text-slate-500 mb-8">계정에 로그인하세요</p>

                {error && (
                    <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={login}
                        className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg transition-all shadow-sm"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                        Google Workspace로 로그인 (@mightyzap.com)
                    </button>
                </div>
            </div>
        </div>
    );
}
