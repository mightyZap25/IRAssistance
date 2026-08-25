import React from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

import Login from './components/Login'
import Layout from './components/Layout'
import OdooWebView from './components/OdooWebView'

// 커스텀 Google Workspace 화면들 및 기타 유지 화면들
import MainDashboard from './pages/MainDashboard'
import WelcomeDashboard from './pages/WelcomeDashboard'
import GoogleChatPage from './pages/GoogleChatPage'
import GoogleDrivePage from './pages/GoogleDrivePage'
import WorkspaceCalendarPage from './pages/WorkspaceCalendarPage'
import WorkspaceMailPage from './pages/WorkspaceMailPage'
import WorkspaceMemoPage from './pages/WorkspaceMemoPage'
import MeetingsPage from './pages/MeetingsPage'
import SettingsPage from './pages/SettingsPage'
import NotebookLMPage from './pages/NotebookLMPage'
import GeminiPage from './pages/GeminiPage'
import NotesPage from './pages/NotesPage'
import ApprovalPage from './pages/ApprovalPage'
import AgentChatPage from './pages/AgentChatPage'
import CompanyWebviewPage from './pages/CompanyWebviewPage'

function PrivateRoute({ children, disableForOdoo }) {
    const { currentUser, isOdooOnlyAuth } = useAuth();
    if (!currentUser) return <Navigate to="/login" replace />;
    if (disableForOdoo && isOdooOnlyAuth) return <Navigate to="/" replace />;
    return children;
}

function AppContent() {
    const { currentUser } = useAuth();
    return (
        <Routes>
            <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" replace />} />

            {/* Odoo Webview 공통 연결 라우트 (기존 ERP 페이지들을 모두 이걸로 대체) */}
            {[
                '/', '/parts', '/bom', '/customers', '/eco', '/inventory', 
                '/manufacturers', '/vendors', '/prod-requests', '/prod-execution', 
                '/purchasing', '/qa/config', '/qa/process', '/qa/dashboard', 
                '/qa/dev-testing', '/receiving/placement', '/receiving/returns', 
                '/transactions', '/outsourcing', 
                '/project/dashboard', '/project/issues', '/project/tasks', 
                '/project/task-calendar', '/project/management', 
                '/sales/dashboard', '/sales/billing', '/odoo/apps', '/odoo/view',
                '/odoo/login', '/odoo/logout', '/odoo/*'
            ].map(path => (
                <Route key={path} path={path} element={
                    <PrivateRoute>
                        <Layout>
                            <React.Fragment />
                        </Layout>
                    </PrivateRoute>
                } />
            ))}

            {/* 별도 유지하는 커스텀 React 화면들 (Google 통합 및 설정) */}
            <Route path="/company/home" element={<PrivateRoute disableForOdoo={true}><Layout><CompanyWebviewPage url="https://www.mightyzap.com" title="회사 홈페이지" /></Layout></PrivateRoute>} />
            <Route path="/company/manual" element={<PrivateRoute disableForOdoo={true}><Layout><CompanyWebviewPage url="https://mightyzap-emanual.netlify.app/" title="회사 기술 자료실" /></Layout></PrivateRoute>} />
            <Route path="/workspace/drive" element={<PrivateRoute disableForOdoo={true}><Layout><GoogleDrivePage /></Layout></PrivateRoute>} />
            <Route path="/workspace/calendar" element={<PrivateRoute disableForOdoo={true}><Layout><WorkspaceCalendarPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/mail" element={<PrivateRoute disableForOdoo={true}><Layout><WorkspaceMailPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/memo" element={<PrivateRoute disableForOdoo={true}><Layout><WorkspaceMemoPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/chat" element={<PrivateRoute disableForOdoo={true}><Layout><GoogleChatPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/notebooklm" element={<PrivateRoute disableForOdoo={true}><Layout><NotebookLMPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/gemini" element={<PrivateRoute disableForOdoo={true}><Layout><GeminiPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/agent" element={<PrivateRoute disableForOdoo={true}><Layout><AgentChatPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/notes" element={<PrivateRoute disableForOdoo={true}><Layout><NotesPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/meetings" element={<PrivateRoute disableForOdoo={true}><Layout><MeetingsPage /></Layout></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Layout><SettingsPage /></Layout></PrivateRoute>} />
            <Route path="/approval" element={<PrivateRoute disableForOdoo={true}><Layout><ApprovalPage /></Layout></PrivateRoute>} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    React.useEffect(() => {
        const handleWheel = (e) => {
            if (e.ctrlKey) {
                if (window.electronAPI && window.electronAPI.getZoomFactor) {
                    const currentZoom = window.electronAPI.getZoomFactor();
                    let newZoom = currentZoom;
                    if (e.deltaY > 0) newZoom -= 0.1; // scroll down -> zoom out
                    else newZoom += 0.1; // scroll up -> zoom in
                    
                    if (newZoom < 0.3) newZoom = 0.3;
                    if (newZoom > 3.0) newZoom = 3.0;
                    
                    window.electronAPI.setZoomFactor(newZoom);
                }
            }
        };
        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
    }, []);

    return (
        <AuthProvider>
            <Router>
                <AppContent />
            </Router>
        </AuthProvider>
    )
}

export default App
