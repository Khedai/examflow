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
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
      </div>
      <div className="page-header">
        <div>
          <h1>Hello, {student?.name}!</h1>
          <p className="text-secondary">SA ID: {student?.studentId}</p>
        </div>
        <button className="btn btn-ghost" onClick={() => { logout(); navigate('/'); }}>Logout</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : exams.length === 0 ? (
        <div className="empty-state"><p>No exams available.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {exams.map((exam) => {
            const sub = getSubmissionForExam(exam.id);
            const totalPoints = exam.questions.reduce((s, q) => s + q.points, 0);

            return (
              <div key={exam.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><strong>{exam.title}</strong></div>
                    <p className="text-sm text-secondary" style={{ marginBottom: 4 }}>{exam.description || 'No description'}</p>
                    <div className="text-sm text-secondary" style={{ display: 'flex', gap: 12 }}>
                      <span>{exam.questions.length} questions</span><span>{totalPoints} pts</span><span>{exam.duration} min</span>
                    </div>
                  </div>
                  <div style={{ marginLeft: 16, textAlign: 'right' }}>
                    {!sub || sub.status === 'STARTED' ? (
                      <button className="btn btn-primary" onClick={() => navigate(`/student/exam/${exam.id}`)}>{sub ? 'Continue exam' : 'Start exam'}</button>
                    ) : sub.status === 'SUBMITTED' ? (
                      <span className="text-sm text-secondary">Awaiting marking</span>
                    ) : sub.status === 'MARKED' ? (
                      exam.published ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--purple-600)' }}>{sub.score}/{totalPoints}</div>
                          <button className="btn btn-sm btn-ghost mt-1" onClick={() => navigate(`/student/result/${sub.id}`)}>View results</button>
                        </div>
                      ) : (<span className="text-sm text-secondary">Results not yet published</span>)
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}