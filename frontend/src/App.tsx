import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from './store';
import { fetchCurrentUser, checkSetupStatus } from './store/authSlice';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

import { SetupPage } from './features/auth/SetupPage';
import { LoginPage } from './features/auth/LoginPage';
import { UserDashboard } from './features/user/UserDashboard';
import { ProfilePage } from './features/user/ProfilePage';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { UserManagement } from './features/admin/UserManagement';
import { Toaster } from 'sonner';
import { VmManagement } from './features/admin/VmManagement';
import { VmFormPage } from './features/admin/VmFormPage';
import { AssignmentsPage } from './features/admin/AssignmentsPage';
import { AdminConfigurationPage } from './features/admin/AdminConfigurationPage';
import { AuditReportPage } from './features/admin/AuditReportPage';
import { RemoteDesktopView } from './features/remote/RemoteDesktopView';
import { VmConnectionLoader } from './components/VmConnectionLoader';
import { UserRole } from '@rdp/shared';

export default function App() {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, user, isSetupRequired } = useSelector((state: RootState) => state.auth);
  const { connectingVm } = useSelector((state: RootState) => state.vms);

  useEffect(() => {
    dispatch(checkSetupStatus());
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  return (
    <>
      <Toaster position="top-right" richColors />
      {connectingVm && <VmConnectionLoader vmName={connectingVm.name} />}
      <BrowserRouter>
        <Routes>
        {/* Public Routes */}
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Application Routes */}
        <Route element={<ProtectedRoute />}>
          {/* Fullscreen Remote Desktop Session */}
          <Route path="/remote/:vmId" element={<RemoteDesktopView />} />

          {/* Standard Portal Layout */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<UserDashboard />} />
            <Route path="/my-vms" element={<UserDashboard />} />
            <Route path="/profile" element={<ProfilePage />} />

            {/* Admin Routes */}
            <Route element={<ProtectedRoute requiredRole={UserRole.ADMIN} />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/vms" element={<VmManagement />} />
              <Route path="/admin/vms/new" element={<VmFormPage />} />
              <Route path="/admin/vms/:id/edit" element={<VmFormPage />} />
              <Route path="/admin/assignments" element={<AssignmentsPage />} />
              <Route path="/admin/audit" element={<AuditReportPage />} />
              <Route path="/admin/configuration" element={<AdminConfigurationPage />} />
              <Route path="/admin/branding" element={<Navigate to="/admin/configuration" replace />} />
              <Route path="/admin/license" element={<Navigate to="/admin/configuration?tab=license" replace />} />
            </Route>
          </Route>
        </Route>

        {/* Root Redirect */}
        <Route
          path="/"
          element={
            isSetupRequired ? (
              <Navigate to="/setup" replace />
            ) : isAuthenticated ? (
              user?.role === UserRole.ADMIN ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </>
  );
}
