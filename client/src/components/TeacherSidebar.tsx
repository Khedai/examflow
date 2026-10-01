import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  extra?: React.ReactNode;
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}

const EXAMS_ICON = 'M9 12h6M9 16h6M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13 3v6h6';
const SUBMISSIONS_ICON = 'M22 12h-5l-2 3h-6l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6z';
const LOGOUT_ICON = 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9';

export default function TeacherSidebar({ extra }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const close = () => setOpen(false);

  return (
    <>
      <button
        className="mobile-hamburger"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? '✕' : '☰'}
      </button>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={close} />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Teacher navigation">
        <div className="sidebar-brand" onClick={close}>
          <img src="/logo.png" alt="ExamFlow logo" className="logo-img lg" />
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link
            to="/teacher/exams"
            className={`nav-item ${isActive('/teacher/exams') ? 'active' : ''}`}
            aria-current={isActive('/teacher/exams') ? 'page' : undefined}
            onClick={close}
          >
            <Icon d={EXAMS_ICON} /> Exams
          </Link>
          <Link
            to="/teacher/submissions"
            className={`nav-item ${isActive('/teacher/submissions') ? 'active' : ''}`}
            aria-current={isActive('/teacher/submissions') ? 'page' : undefined}
            onClick={close}
          >
            <Icon d={SUBMISSIONS_ICON} /> Submissions
            {extra}
          </Link>
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button
            className="nav-item"
            onClick={() => {
              close();
              logout();
              navigate('/');
            }}
          >
            <Icon d={LOGOUT_ICON} /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}
