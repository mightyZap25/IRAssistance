import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function WelcomeDashboard() {
    const { currentUser } = useAuth();
    const userName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '사용자';

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-slate-50 relative overflow-hidden">
            {/* 배경 데코레이션 */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100 rounded-full blur-3xl opacity-50 mix-blend-multiply"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100 rounded-full blur-3xl opacity-50 mix-blend-multiply"></div>

            <div className="z-10 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                
                <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tight text-center">
                    환영합니다, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">{userName}</span>님!
                </h1>
                
                <p className="text-lg text-slate-500 font-medium mb-8 text-center max-w-md">
                    I-Link 스마트 업무 환경에 접속하셨습니다.<br/>
                    왼쪽 메뉴를 선택하여 원하시는 업무를 시작해 보세요.
                </p>

                <div className="flex items-center space-x-2 text-sm font-bold text-indigo-500 bg-indigo-50 px-4 py-2 rounded-full">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                    <span>백그라운드에서 시스템을 최적화 중입니다</span>
                </div>
            </div>
        </div>
    );
}
