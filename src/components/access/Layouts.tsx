import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTutor } from '../../hooks/useTutor';

export function Header({ subtitle, nav, user }: { subtitle: string; nav?: ReactNode; user?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <span className="app-title">
          APU Tutorial Attendance
          <small>{subtitle}</small>
        </span>
        {nav}
        {user}
      </div>
    </header>
  );
}

export function TutorLayout() {
  const { ctx, logout } = useTutor();
  const navigate = useNavigate();
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header
        subtitle="Tutor"
        nav={
          <nav className="app-nav" aria-label="Tutor">
            <NavLink to="/tutor" end>Home</NavLink>
            <NavLink to="/tutor/attendance/new">New Attendance</NavLink>
          </nav>
        }
        user={
          ctx && (
            <div className="header-user">
              <span>{ctx.tutor.full_name}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  await logout();
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

