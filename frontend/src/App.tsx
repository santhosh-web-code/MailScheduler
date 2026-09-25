import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ScheduledEmails } from './features/scheduled';
import { SentEmails } from './features/sent';

import { ToastProvider } from './components/Toast';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
        <Routes>

          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          >

            <Route index element={<Navigate to="scheduled" replace />} />
            <Route path="scheduled" element={<ScheduledEmails />} />
            <Route path="sent" element={<SentEmails />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard/scheduled" replace />} />
          <Route path="*" element={<Navigate to="/dashboard/scheduled" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
