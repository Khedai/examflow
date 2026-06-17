import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { teacherLogin } from '../../api';

export default function TeacherLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginTeacher } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await teacherLogin(password);
      loginTeacher(data.token);
      navigate('/teacher');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160 }} />
        </div>
        <h2>Teacher Sign In</h2>
        <p className="login-subtitle">Enter the shared teacher password to continue.</p>
        <p className="text-sm text-hint mb-2" style={{ background: 'var(--amber-50)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
          Default password: <strong>admin123</strong>
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>
        <Link to="/" className="login-back-link">&larr; Back to home</Link>
      </div>
    </div>
  );
}