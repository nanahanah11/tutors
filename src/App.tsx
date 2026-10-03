import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TutorProvider, RequireTutor } from './hooks/useTutor';
import { TutorLayout } from './components/access/Layouts';
import { Spinner } from './components/ui';
import AccessPage from './pages/AccessPage';
import TutorDashboard from './pages/TutorDashboard';
import NewAttendancePage from './pages/NewAttendancePage';
import TutorSessionPage from './pages/TutorSessionPage';

const LecturerApp = lazy(() => import('./LecturerApp'));

/** Routes follow PRD §16.2. */
export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <TutorProvider>
            <AccessPage />
          </TutorProvider>
        }
      />
      <Route
        path="/tutor"
        element={
          <TutorProvider>
            <RequireTutor>
              <TutorLayout />
            </RequireTutor>
          </TutorProvider>
        }
      >
        <Route index element={<TutorDashboard />} />
        <Route path="attendance/new" element={<NewAttendancePage />} />
        <Route path="attendance/:sessionId" element={<TutorSessionPage />} />
      </Route>
      <Route
        path="/lecturer/*"
        element={
          <Suspense fallback={<Spinner />}>
            <LecturerApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
