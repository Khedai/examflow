import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getExam, getSubmissions, togglePublish, deleteSubmission } from '../../api';
import type { Exam, Submission } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

export default function ExamDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDeleteSub, setConfirmDeleteSub] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getExam(id), getSubmissions({ examId: id })]).then(([e, s]) => { setExam(e); setSubmissions(s); })
      .catch((err) => setError(err.message || 'Failed to load')).finally(() => setLoading(false));
  }, [id]);

  const handlePublish = async () => {
    if (!exam) return;
    try {
      const r = await togglePublish(exam.id);
      setExam({ ...exam, published: r.published });
    } catch (err: any) {
      setError(err.message || 'Failed to update publish state');
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!id) return;
    try {
      await deleteSubmission(submissionId);
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete submission');
    }
    setConfirmDeleteSub(null);
  };

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!exam) return <div className="error-banner">Exam not found</div>;
  const total = exam.questions.reduce((s, q) => s + q.points, 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 50, width: 140, maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <button className="btn btn-ghost btn-sm mb-2" style={{ border: '1px solid var(--border-medium)' }} onClick={() => navigate('/teacher/exams')}>&larr; Back to Exams</button>
        {error && <div className="error-banner">{error}</div>}
        
        <div className="page-header" style={{ marginTop: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>{exam.title}</h1>
            <p className="text-secondary" style={{ marginTop: 4 }}>{exam.description || 'No description provided.'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${exam.published ? 'btn-ghost' : 'btn-success'}`} style={exam.published ? { border: '1px solid var(--border-medium)' } : {}} onClick={handlePublish}>
              {exam.published ? 'Unpublish Exam' : 'Publish Exam'}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)} disabled={exam.locked}>
              Edit Exam
            </button>
          </div>
        </div>

        <div className="grid-4" style={{ marginBottom: '2rem' }}>
          <div className="stat-card"><div className="stat-value">{exam.duration}m</div><div className="stat-label">Duration Limit</div></div>
          <div className="stat-card"><div className="stat-value">{total}</div><div className="stat-label">Total Points</div></div>
          <div className="stat-card"><div className="stat-value">{exam.questions.length}</div><div className="stat-label">Questions</div></div>
          <div className="stat-card"><div className="stat-value">{submissions.length}</div><div className="stat-label">Submissions</div></div>
        </div>

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Questions</h2>
          {exam.questions.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', padding: '1rem' }}><p>No questions added to this exam.</p></div>
          ) : (
            exam.questions.map((q, i) => (
              <div key={q.id} className="detail-question-row">
                <span className="detail-q-num">{i + 1}</span>
                <div className="detail-q-body">
                  <div className="detail-q-text">{q.text}</div>
                  <div className="detail-q-meta">
                    <span className={`badge ${q.type === 'mcq' ? 'badge-mcq' : q.type === 'short' ? 'badge-short' : 'badge-long'}`}>{q.type.toUpperCase()}</span>
                    <span className="text-sm text-secondary" style={{ fontWeight: 500 }}>{q.points} pts</span>
                  </div>
                  {q.type === 'mcq' && q.options && (
                    <div className="detail-q-options">
                      {q.options.map((o, oi) => (
                        <span key={oi} className={`detail-q-option ${o === q.correct ? 'is-correct' : ''}`}>
                          {o} {o === q.correct && '✓'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Submissions</h2>
          {submissions.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', padding: '1rem' }}><p>No student submissions yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {submissions.map((s) => (
                <div key={s.id} className="submission-row" style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1">
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.student.name} {s.student.surname}</div>
                    <div className="text-sm text-secondary" style={{ marginTop: 2 }}>ID: {s.student.studentId}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span className={`badge ${s.status === 'SUBMITTED' ? 'badge-submitted' : s.status === 'MARKED' ? 'badge-marked' : 'badge-started'}`}>
                      {s.status}
                    </span>
                    {s.score != null && (
                      <span className="text-sm" style={{ fontWeight: 700, color: 'var(--purple-600)' }}>
                        Score: {s.score}/{total}
                      </span>
                    )}
                    <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => navigate(`/teacher/submissions/${s.id}`)}>
                      {s.status === 'MARKED' ? 'Review Grade' : 'Grade Submission'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmDeleteSub(s.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {confirmDeleteSub && (
          <div className="confirm-overlay" onClick={() => setConfirmDeleteSub(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Submission</h3>
              <p>Are you sure you want to delete this submission? All student answers and scores for this submission will be permanently deleted.</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmDeleteSub(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleDeleteSubmission(confirmDeleteSub)}>Delete Submission</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}