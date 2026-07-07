import React from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

import Login from './components/Login'
import Layout from './components/Layout'
import OdooWebView from './components/OdooWebView'

// 커스텀 Google Workspace 화면들 및 기타 유지 화면들
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
import PLMPage from './pages/PLMPage'

function PrivateRoute({ children }) {
    const { currentUser } = useAuth();
    return currentUser ? children : <Navigate to="/login" />;
}

function AppContent() {
    const { currentUser } = useAuth();
    return (
        <Routes>
            <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />

            {/* Odoo Webview 공통 연결 라우트 (기존 ERP 페이지들을 모두 이걸로 대체) */}
            {[
                '/', '/parts', '/bom', '/customers', '/eco', '/inventory', 
                '/manufacturers', '/vendors', '/prod-requests', '/prod-execution', 
                '/purchasing', '/qa/config', '/qa/process', '/qa/dashboard', 
                '/qa/dev-testing', '/receiving/placement', '/receiving/returns', 
                '/transactions', '/outsourcing', '/hr/attendance', 
                '/project/dashboard', '/project/issues', '/project/tasks', 
                '/project/task-calendar', '/project/management', 
                '/sales/dashboard', '/sales/billing', '/odoo/apps', '/odoo/view'
            ].map(path => (
                <Route key={path} path={path} element={
                    <PrivateRoute>
                        <Layout>
                            <OdooWebView />
                        </Layout>
                    </PrivateRoute>
                } />
            ))}

            {/* 별도 유지하는 커스텀 React 화면들 (Google 통합 및 설정) */}
            <Route path="/workspace/drive" element={<PrivateRoute><Layout><GoogleDrivePage /></Layout></PrivateRoute>} />
            <Route path="/workspace/calendar" element={<PrivateRoute><Layout><WorkspaceCalendarPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/mail" element={<PrivateRoute><Layout><WorkspaceMailPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/memo" element={<PrivateRoute><Layout><WorkspaceMemoPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/chat" element={<PrivateRoute><Layout><GoogleChatPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/notebooklm" element={<PrivateRoute><Layout><NotebookLMPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/gemini" element={<PrivateRoute><Layout><GeminiPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/notes" element={<PrivateRoute><Layout><NotesPage /></Layout></PrivateRoute>} />
            <Route path="/workspace/meetings" element={<PrivateRoute><Layout><MeetingsPage /></Layout></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Layout><SettingsPage /></Layout></PrivateRoute>} />
            <Route path="/plm" element={<PrivateRoute><Layout><PLMPage /></Layout></PrivateRoute>} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <Router>
                <AppContent />
            </Router>
        </AuthProvider>
    )
}

export default App
