import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'

import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import PartsPage from './pages/PartsPage'
import BOMPage from './pages/BOMPage'
import CustomersPage from './pages/CustomersPage'
import ECNPage from './pages/ECNPage'
import InventoryPage from './pages/InventoryPage'
import ManufacturersPage from './pages/ManufacturersPage'
import VendorsPage from './pages/VendorsPage'
import ProductionRequestsPage from './pages/ProductionRequestsPage'
import ProductionExecutionPage from './pages/ProductionExecutionPage'
import PurchasingPage from './pages/PurchasingPage'
import ReceivingInspectionPage from './pages/ReceivingInspectionPage'
import TransactionsPage from './pages/TransactionsPage'
import OutsourcingPage from './pages/OutsourcingPage'
import WarehousePlacementPage from './pages/WarehousePlacementPage'
import ReturnProcessingPage from './pages/ReturnProcessingPage'
import WorkspaceFilesPage from './pages/WorkspaceFilesPage'
import WorkspaceCalendarPage from './pages/WorkspaceCalendarPage'
import LeaveManagementPage from './pages/LeaveManagementPage'
import QAConfigPage from './pages/QAConfigPage'
import QAProcessPage from './pages/QAProcessPage'
import ProjectDashboardPage from './pages/ProjectDashboardPage'
import ProjectIssuesPage from './pages/ProjectIssuesPage'
import TasksPage from './pages/TasksPage'
import TaskCalendarPage from './pages/TaskCalendarPage'
import ProjectManagementPage from './pages/ProjectManagementPage'
import SalesDashboardPage from './pages/SalesDashboardPage'
import QuotationsPage from './pages/QuotationsPage'
import BillingPage from './pages/BillingPage'

function PrivateRoute({ children }) {
    const { currentUser } = useAuth();
    return currentUser ? children : <Navigate to="/login" />;
}

function AppContent() {
    const { currentUser } = useAuth();
    return (
        <Routes>
            <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />

            {/* Protected Routes */}
            <Route path="/" element={
                <PrivateRoute>
                    <Layout>
                        <DashboardPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/parts" element={
                <PrivateRoute>
                    <Layout>
                        <PartsPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/bom" element={
                <PrivateRoute>
                    <Layout>
                        <BOMPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/customers" element={
                <PrivateRoute>
                    <Layout>
                        <CustomersPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/ecn" element={
                <PrivateRoute>
                    <Layout>
                        <ECNPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/inventory" element={
                <PrivateRoute>
                    <Layout>
                        <InventoryPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/manufacturers" element={
                <PrivateRoute>
                    <Layout>
                        <ManufacturersPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/vendors" element={
                <PrivateRoute>
                    <Layout>
                        <VendorsPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/prod-requests" element={
                <PrivateRoute>
                    <Layout>
                        <ProductionRequestsPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/prod-execution" element={
                <PrivateRoute>
                    <Layout>
                        <ProductionExecutionPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/purchasing" element={
                <PrivateRoute>
                    <Layout>
                        <PurchasingPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/receiving/inspection" element={
                <PrivateRoute>
                    <Layout>
                        <ReceivingInspectionPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/qa/config" element={
                <PrivateRoute>
                    <Layout>
                        <QAConfigPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/qa/process" element={
                <PrivateRoute>
                    <Layout>
                        <QAProcessPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/receiving/placement" element={
                <PrivateRoute>
                    <Layout>
                        <WarehousePlacementPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/receiving/returns" element={
                <PrivateRoute>
                    <Layout>
                        <ReturnProcessingPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/transactions" element={
                <PrivateRoute>
                    <Layout>
                        <TransactionsPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/outsourcing" element={
                <PrivateRoute>
                    <Layout>
                        <OutsourcingPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/workspace/files" element={
                <PrivateRoute>
                    <Layout>
                        <WorkspaceFilesPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/workspace/calendar" element={
                <PrivateRoute>
                    <Layout>
                        <WorkspaceCalendarPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/hr/attendance" element={
                <PrivateRoute>
                    <Layout>
                        <LeaveManagementPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/project/dashboard" element={
                <PrivateRoute>
                    <Layout>
                        <ProjectDashboardPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/project/issues" element={
                <PrivateRoute>
                    <Layout>
                        <ProjectIssuesPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/project/tasks" element={
                <PrivateRoute>
                    <Layout>
                        <TasksPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/project/task-calendar" element={
                <PrivateRoute>
                    <Layout>
                        <TaskCalendarPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/project/management" element={
                <PrivateRoute>
                    <Layout>
                        <ProjectManagementPage />
                    </Layout>
                </PrivateRoute>
            } />

            <Route path="/sales/dashboard" element={
                <PrivateRoute>
                    <Layout>
                        <SalesDashboardPage />
                    </Layout>
                </PrivateRoute>
            } />
            <Route path="/sales/quotations" element={
                <PrivateRoute>
                    <Layout>
                        <QuotationsPage />
                    </Layout>
                </PrivateRoute>
            } />
            <Route path="/sales/billing" element={
                <PrivateRoute>
                    <Layout>
                        <BillingPage />
                    </Layout>
                </PrivateRoute>
            } />

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
