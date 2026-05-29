import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header'; // Will create next

export default function Layout({ children }) {
    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
            <Sidebar />
            <div className="flex-1 ml-64 flex flex-col min-w-0 transition-all duration-300">
                <Header />
                <main className="flex-1 p-6 overflow-x-hidden">
                    <div className="max-w-[1300px] mx-auto animate-fade-in">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
