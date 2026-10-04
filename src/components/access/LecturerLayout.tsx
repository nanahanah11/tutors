import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLecturer } from '../../hooks/useLecturer';
import { Header } from './Layouts';

export function LecturerLayout() {
  const { profile, signOut } = useLecturer();
  const navigate = useNavigate();
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header
        subtitle="Lecturer – SDM & ISWE"
        nav={
          <nav className="app-nav" aria-label="Lecturer">
            <NavLink to="/lecturer" end>Dashboard</NavLink>
            <NavLink to="/lecturer/students">Students</NavLink>
          </nav>
        }
        user={
          profile && (
            <div className="header-user">
              <span>{profile.full_name}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  await signOut();
                  navigate('/', { replace: true });
                }}
              >
                Sign out
              </button>
            </div>
          )
        }
      />
      <main id="main" className="container">
        <Outlet />
      </main>
    </>
  );
}
