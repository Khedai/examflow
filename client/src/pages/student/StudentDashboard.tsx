import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getExams, getSubmissions } from '../../api';
import type { Exam, Submission } from '../../types';

export default function StudentDashboard() {
  const { student, logout } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getExams(), getSubmissions()])
      .then(([examsData, subsData]) => { setExams(examsData); setSubmissions(subsData); })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const getSubmissionForExam = (examId: string) => submissions.find((s) => s.examId === examId);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
        <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%', objectFit: 'contain' }} />
      </div>

      <div className="page-header" style={{ background: 'var(--bg-primary)', padding: '1.5rem 2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Welcome, {student?.name}!</h1>
          {student?.studentId ? (
            <p className="text-secondary" style={{ fontSize: 14, marginTop: 4 }}>ID / Passport: <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{student.studentId}</code></p>
          ) : null}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/'); }} style={{ border: '1px solid var(--border-medium)' }}>Logout</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: '1rem', borderLeft: '4px solid var(--purple-600)', paddingLeft: 10 }}>Your Exams</h2>

      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : exams.length === 0 ? (
        <div className="empty-state"><p>No exams are currently assigned to you.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {exams.map((exam) => {
            const sub = getSubmissionForExam(exam.id);
            const totalPoints = exam.questions.reduce((s, q) => s + q.points, 0);

            return (
              <div key={exam.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 250 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{exam.title}</span>
                    {sub?.status === 'STARTED' && <span className="badge badge-started">In Progress</span>}
                    {sub?.status === 'SUBMITTED' && <span className="badge badge-submitted">Submitted</span>}
                    {sub?.status === 'MARKED' && (
                      exam.published ? <span className="badge badge-marked">Graded</span> : <span className="badge badge-submitted">Marked</span>
                    )}
                  </div>
                  <p className="text-sm text-secondary" style={{ marginBottom: 10, lineHeight: 1.5 }}>{exam.description || 'No description provided.'}</p>
                  <div className="text-sm text-secondary" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontWeight: 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📝 {exam.questions.length} Questions</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🏆 {totalPoints} Points</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>⏱️ {exam.duration} Mins</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {!sub || sub.status === 'STARTED' ? (
                    <button className="btn btn-primary" onClick={() => navigate(`/student/exam/${exam.id}`)}>
                      {sub ? 'Resume Exam' : 'Start Exam'} &rarr;
                    </button>
                  ) : sub.status === 'SUBMITTED' ? (
                    <span className="badge badge-started" style={{ padding: '8px 16px', fontSize: 13 }}>Awaiting Marking</span>
                  ) : sub.status === 'MARKED' ? (
                    exam.published ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--purple-600)' }}>
                          {sub.score} <span style={{ fontSize: 14, color: 'var(--text-hint)' }}>/ {totalPoints} pts</span>
                        </div>
                        <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => navigate(`/student/result/${sub.id}`)}>View Results</button>
                      </div>
                    ) : (
                      <span className="badge badge-submitted" style={{ padding: '8px 16px', fontSize: 13 }}>Completed</span>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}