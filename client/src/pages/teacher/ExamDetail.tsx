import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getExam, getSubmissions, togglePublish } from '../../api';
import type { Exam, Submission } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

export default function ExamDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([getExam(id), getSubmissions({ examId: id })]).then(([e, s]) => { setExam(e); setSubmissions(s); })
      .catch((err) => setError(err.message || 'Failed to load')).finally(() => setLoading(false));
  }, [id]);

  const handlePublish = async () => { if (!exam) return; try { const r = await togglePublish(exam.id); setExam({ ...exam, published: r.published }); } catch (err: any) { setError(err.message || 'Failed'); } };

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!exam) return <div className="error-banner">Exam not found</div>;
  const total = exam.questions.reduce((s, q) => s + q.points, 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <button className="btn btn-ghost mb-2" onClick={() => navigate('/teacher/exams')}>&larr; Back</button>
        {error && <div className="error-banner">{error}</div>}
        <div className="page-header"><div><h1>{exam.title}</h1><p className="text-secondary">{exam.description || ''}</p></div><div style={{ display: 'flex', gap: 8 }}><button className={`btn btn-sm ${exam.published ? 'btn-ghost' : 'btn-success'}`} onClick={handlePublish}>{exam.published ? 'Unpub' : 'Publish'}</button><button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)} disabled={exam.locked}>Edit</button></div></div>
        <div className="grid-4 mb-2"><div className="stat-card card-flat"><div className="stat-value">{exam.duration}m</div><div className="stat-label">Duration</div></div><div className="stat-card card-flat"><div className="stat-value">{total}</div><div className="stat-label">Total Points</div></div><div className="stat-card card-flat"><div className="stat-value">{exam.questions.length}</div><div className="stat-label">Questions</div></div><div className="stat-card card-flat"><div className="stat-value">{submissions.length}</div><div className="stat-label">Submissions</div></div></div>
        <div className="card mb-2">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Questions</h2>
          {exam.questions.length === 0 ? <div className="empty-state"><p>No questions.</p></div> : exam.questions.map((q, i) => (
            <div key={q.id} className="detail-question-row"><span className="detail-q-num">{i + 1}</span><div className="detail-q-body"><div className="detail-q-text">{q.text}</div><div className="detail-q-meta"><span className={`badge ${q.type === 'mcq' ? 'badge-mcq' : q.type === 'short' ? 'badge-short' : 'badge-long'}`}>{q.type.toUpperCase()}</span><span className="text-sm text-secondary">{q.points} pts</span></div>{q.type === 'mcq' && q.options && (<div className="detail-q-options">{q.options.map((o, oi) => (<span key={oi} className={`detail-q-option ${o === q.correct ? 'is-correct' : ''}`}>{o}{o === q.correct ? ' *' : ''}</span>))}</div>)}</div></div>
          ))}
        </div>
        <div className="card"><h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Submissions</h2>{submissions.length === 0 ? <div className="empty-state"><p>No submissions yet.</p></div> : submissions.map((s) => (<div key={s.id} className="submission-row"><div className="flex-1"><div style={{ fontWeight: 500 }}>{s.student.name} {s.student.surname}</div><div className="text-sm text-secondary">{s.student.studentId}</div></div><span className={`badge ${s.status === 'SUBMITTED' ? 'badge-submitted' : s.status === 'MARKED' ? 'badge-marked' : 'badge-started'}`}>{s.status}</span>{s.score != null && <span className="text-sm">{s.score}/{total}</span>}<button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/submissions/${s.id}`)}>Mark</button></div>))}</div>
      </main>
    </div>
  );
}