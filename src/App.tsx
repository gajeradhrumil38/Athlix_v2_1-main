/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ExerciseOverridesProvider } from './contexts/ExerciseOverridesContext';
import { HeartRateProvider } from './contexts/HeartRateContext';
import { RestTimerProvider } from './contexts/RestTimerContext';
import { ProgressProvider } from './contexts/ProgressContext';
import { Layout } from './components/layout/Layout';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { Auth } from './pages/Auth';
import { Home } from './pages/Home';
import { Calendar } from './pages/Calendar';
import { Log } from './pages/Log';
import { Timeline } from './pages/Timeline';
import { Settings } from './pages/Settings';
import { Progress } from './pages/Progress';
import { DashboardLayoutEditor } from './pages/DashboardLayoutEditor';
import { ActiveRun } from './features/running/pages/ActiveRun';
import { RunHistory } from './features/running/pages/RunHistory';
import { FoodScannerPage } from './features/food/pages/FoodScannerPage';
import { FoodHistoryPage } from './features/food/pages/FoodHistoryPage';
import { WhoopCallback } from './pages/WhoopCallback';
import { ResetPassword } from './pages/ResetPassword';
import { SkincareRoutinePage } from './features/skincare/SkincareRoutinePage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isPasswordRecovery } = useAuth();
  const [splashFading, setSplashFading] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (!loading && !splashDone) {
      setSplashFading(true);
      const t = setTimeout(() => setSplashDone(true), 380);
      return () => clearTimeout(t);
    }
  }, [loading, splashDone]);

  if (isPasswordRecovery) return <ResetPassword />;

  // During initial auth check or while the splash is fading out
  if (!splashDone) {
    return (
      <>
        {/* Mount children underneath during fade so Home starts fetching + bar fires */}
        {!loading && user && <>{children}</>}
        <LoadingScreen fading={splashFading} />
      </>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const RedirectToStatic = ({ path }: { path: string }) => {
  React.useEffect(() => {
    window.location.href = path;
  }, [path]);
  return null;
};

const AppRoutes = () => {
  const { isPasswordRecovery } = useAuth();
  const staticBase = '/';
  if (isPasswordRecovery) return <ResetPassword />;
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/whoop/callback" element={<WhoopCallback />} />
      <Route path="/privacy" element={<RedirectToStatic path={`${staticBase}privacy.html`} />} />
      <Route path="/terms" element={<RedirectToStatic path={`${staticBase}terms.html`} />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="log" element={<Log />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="progress" element={<Progress />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/layout" element={<DashboardLayoutEditor />} />
        <Route path="run" element={<ActiveRun />} />
        <Route path="run/history" element={<RunHistory />} />
        <Route path="food" element={<Navigate to="food/history" replace />} />
        <Route path="food/scan" element={<FoodScannerPage />} />
        <Route path="food/history" element={<FoodHistoryPage />} />
        <Route path="skincare" element={<SkincareRoutinePage />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <ProgressProvider>
      <AuthProvider>
        <ExerciseOverridesProvider>
          <HeartRateProvider>
            <RestTimerProvider>
              <HashRouter>
                <AppRoutes />
              </HashRouter>
            </RestTimerProvider>
          </HeartRateProvider>
        </ExerciseOverridesProvider>
      </AuthProvider>
    </ProgressProvider>
  );
}
