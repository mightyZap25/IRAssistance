import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header'; // Will create next
import { useAuth } from '../contexts/AuthContext';
import { useTaskAlarm } from '../hooks/useTaskAlarm';

export default function Layout({ children }) {
    const { currentUser } = useAuth();
    useTaskAlarm(currentUser);

    // Determine if we should use full width (e.g., for dashboard)
    const isDashboard = window.location.pathname.includes('/dashboard');

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
            <Sidebar />
            <div className="flex-1 ml-64 flex flex-col min-w-0 transition-all duration-300">
                <Header />
                <main className={`flex-1 overflow-x-hidden ${isDashboard ? 'p-0' : 'p-6'}`}>
                    <div className={`${isDashboard ? 'max-w-none w-full h-[calc(100vh-64px)]' : 'max-w-[1300px] mx-auto'} animate-fade-in`}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
