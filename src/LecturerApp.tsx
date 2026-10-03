/** Lecturer area – lazy-loaded so tutor devices never download the Supabase client or admin screens. */
import { Navigate, Route, Routes } from 'react-router-dom';
import { LecturerProvider, RequireLecturer } from './hooks/useLecturer';
import { LecturerLayout } from './components/access/LecturerLayout';
import LecturerLogin from './pages/LecturerLogin';
import LecturerDashboard from './pages/LecturerDashboard';
import AttendanceDetailPage from './pages/AttendanceDetailPage';
import AdminStudentsPage from './pages/admin/AdminStudentsPage';
import AdminGroupsPage from './pages/admin/AdminGroupsPage';
import AdminModulesPage from './pages/admin/AdminModulesPage';
import AdminTutorsPage from './pages/admin/AdminTutorsPage';
import AdminImportPage from './pages/admin/AdminImportPage';
import AuditLogPage from './pages/admin/AuditLogPage';

export default function LecturerApp() {
  return (
    <LecturerProvider>
      <Routes>
        <Route path="login" element={<LecturerLogin />} />
        <Route
          element={
            <RequireLecturer>
              <LecturerLayout />
            </RequireLecturer>
          }
        >
          <Route index element={<LecturerDashboard />} />
          <Route path="attendance/:sessionId" element={<AttendanceDetailPage />} />
          <Route path="students" element={<AdminStudentsPage />} />
          <Route path="groups" element={<AdminGroupsPage />} />
          <Route path="modules" element={<AdminModulesPage />} />
          <Route path="tutors" element={<AdminTutorsPage />} />
          <Route path="import" element={<AdminImportPage />} />
          <Route path="audit" element={<AuditLogPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/lecturer" replace />} />
      </Routes>
    </LecturerProvider>
  );
}
