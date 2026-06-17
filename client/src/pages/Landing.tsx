import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentLogin } from '../api';
import '../styles/global.css';
import '../styles/components.css';
import '../styles/exam.css';

export default function Landing() {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [studentId, setStudentId] = useState('');
  const [cell, setCell] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginStudent } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('First name is required'); return; }
    if (!surname.trim()) { setError('Surname is required'); return; }
    if (!studentId.trim()) { setError('SA ID is required'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await studentLogin({ name: name.trim(), surname: surname.trim(), studentId: studentId.trim(), cell });
      loginStudent(data.token, data.student);
      navigate('/student');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{ position: 'relative' }}>
      <Link
        to="/teacher/login"
        style={{ position: 'absolute', top: 16, right: 20, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}
      >
        Teacher Login &rarr;
      </Link>
      <div className="login-card card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <p className="login-subtitle" style={{ maxWidth: 500 }}>Enter your details to access your exams.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="label" htmlFor="sname">First name *</label>
              <input id="sname" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. John" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="ssurname">Surname *</label>
              <input id="ssurname" className="input" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="e.g. Doe" />
            </div>
          </div>
          <div className="form-group">
            <label className="label" htmlFor="sid">SA ID *</label>
            <input id="sid" className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Your SA ID number" />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="scell">Cell (optional)</label>
            <input id="scell" className="input" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="e.g. +27..." />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Access exams'}
          </button>
        </form>
        <p className="text-sm text-secondary" style={{ marginTop: 12, textAlign: 'center' }}>
          No account needed &mdash; your details are saved on first login.
        </p>
      </div>
    </div>
  );
}