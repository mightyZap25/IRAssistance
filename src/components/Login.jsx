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
    );
}
