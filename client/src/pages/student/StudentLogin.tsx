import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { studentLogin } from '../../api';

export default function StudentLogin() {
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
    if (!studentId.trim()) { setError('Student ID is required'); return; }
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
    <div className="login-container">
      <div className="login-card card">
        <h2>Student Access</h2>
        <p className="login-subtitle">Enter your details to access your exams.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="label" htmlFor="sname">First name *</label>
              <input id="sname" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="ssurname">Surname *</label>
              <input id="ssurname" className="input" value={surname} onChange={(e) => setSurname(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="label" htmlFor="sid">Student ID *</label>
            <input id="sid" className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="scell">Cell (optional)</label>
            <input id="scell" className="input" value={cell} onChange={(e) => setCell(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Access exams'}
          </button>
        </form>
        <Link to="/" className="login-back-link">← Back to home</Link>
      </div>
    </div>
  );
}