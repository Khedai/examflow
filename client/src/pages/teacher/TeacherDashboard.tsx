import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats, getExams, getSubmissions } from '../../api';
import type { Exam, Submission } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [recentExams, setRecentExams] = useState<Exam[]>([]);
  const [pendingSubs, setPendingSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [s, exams, subs] = await Promise.all([getStats(), getExams(), getSubmissions({ status: 'SUBMITTED' })]);
        setStats(s); setRecentExams(exams.slice(0, 5)); setPendingSubs(subs.slice(0, 5));
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard');
      } finally { setLoading(false); }
    }
    fetchData();
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar extra={stats?.pending > 0 ? <span className="nav-badge">{stats.pending}</span> : null} />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div className="page-header"><h1>Dashboard</h1></div>
        {loading && <div className="loading-center"><span className="spinner" /></div>}
        {error && <div className="error-banner">{error}</div>}
        {!loading && !error && stats && (
          <>
            <div className="dash-stats">
              <div className="grid-4">
                <div className="stat-card card-flat"><div className="stat-value">{stats.totalExams}</div><div className="stat-label">Total Exams</div></div>
                <div className="stat-card card-flat"><div className="stat-value">{stats.pending}</div><div className="stat-label">Pending</div></div>
                <div className="stat-card card-flat"><div className="stat-value">{stats.marked}</div><div className="stat-label">Marked</div></div>
                <div className="stat-card card-flat"><div className="stat-value">{stats.inProgress}</div><div className="stat-label">In Progress</div></div>
              </div>
            </div>
            <div className="grid-2">
              <div className="dash-section">
                <h2>Recent Exams</h2>
                <div className="card">
                  {recentExams.length === 0 ? <div className="empty-state"><p>No exams created yet.</p></div> :
                    recentExams.map((exam) => (
                      <div key={exam.id} className="dash-exam-card" style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                        <div className="dash-exam-info"><h3>{exam.title}</h3><div className="dash-exam-meta"><span>{exam.questions.length} questions</span><span>{exam.duration} min</span></div></div>
                        <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/teacher/exams/${exam.id}`)}>View</button>
                      </div>
                    ))}
                </div>
              </div>
              <div className="dash-section">
                <h2>Pending Submissions</h2>
                <div className="card">
                  {pendingSubs.length === 0 ? <div className="empty-state"><p>Nothing to mark right now.</p></div> :
                    pendingSubs.map((sub) => (
                      <div key={sub.id} className="dash-exam-card" style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                        <div className="dash-exam-info"><h3>{sub.student.name} {sub.student.surname}</h3><div className="dash-exam-meta"><span>{sub.student.studentId}</span><span className="badge badge-submitted">SUBMITTED</span></div></div>
                        <button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/submissions/${sub.id}`)}>Mark</button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}