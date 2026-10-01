import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { teacherLogin, warmServer } from '../../api';
import BrandBar from '../../components/BrandBar';

export default function TeacherLogin() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { role, loginTeacher } = useAuth();
  const navigate = useNavigate();

  // Wake the API while the teacher types, and skip this page entirely when a
  // teacher session already exists — both make repeat sign-ins feel instant.
  useEffect(() => {
    warmServer();
  }, []);

  useEffect(() => {
    if (role === 'teacher') navigate('/teacher/submissions', { replace: true });
  }, [role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await teacherLogin(password);
      loginTeacher(data.token);
      navigate('/teacher/submissions');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <BrandBar size="lg" centered />
        <h2>Teacher Sign In</h2>
        <p className="login-subtitle">Enter the shared teacher password to continue.</p>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label" htmlFor="password">
              Password
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                autoComplete="current-password"
                enterKeyHint="go"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ border: '1px solid var(--border-medium)', flexShrink: 0 }}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" /> Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
        <Link to="/" className="login-back-link">
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
