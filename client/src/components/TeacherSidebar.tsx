import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  extra?: React.ReactNode;
}

export default function TeacherSidebar({ extra }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const NavIcon: React.FC<{ letter: string }> = ({ letter }) => (
    <span style={{ fontSize: 13, fontWeight: 700, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>{letter}</span>
  );

  const close = () => setOpen(false);

  return (
    <>
      <button className="mobile-hamburger" onClick={() => setOpen(!open)} aria-label="Menu">
        {open ? '\u2715' : '\u2630'}
      </button>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={close} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand" onClick={close}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link to="/teacher" className={`nav-item ${isActive('/teacher') && !isActive('/teacher/exams') && !isActive('/teacher/submissions') ? 'active' : ''}`} onClick={close}>
            <NavIcon letter="D" /> Dashboard
          </Link>
          <Link to="/teacher/exams" className={`nav-item ${isActive('/teacher/exams') ? 'active' : ''}`} onClick={close}>
            <NavIcon letter="E" /> Exams
          </Link>
          <Link to="/teacher/submissions" className={`nav-item ${isActive('/teacher/submissions') ? 'active' : ''}`} onClick={close}>
            <NavIcon letter="S" /> Submissions
            {extra}
          </Link>
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button className="nav-item" onClick={() => { close(); logout(); navigate('/'); }}>
            <NavIcon letter="\u2190" /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}