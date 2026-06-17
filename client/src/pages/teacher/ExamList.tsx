import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExams, deleteExam, togglePublish } from '../../api';
import type { Exam } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

export default function ExamList() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchExams = async () => {
    try { setError(''); const data = await getExams(); setExams(data); }
    catch (err: any) { setError(err.message || 'Failed to load exams'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchExams(); }, []);

  const handleDelete = async (id: string) => {
    try { await deleteExam(id); setExams((p) => p.filter((e) => e.id !== id)); }
    catch (err: any) { setError(err.message || 'Failed to delete exam'); }
    setConfirmDelete(null);
  };

  const handleTogglePublish = async (id: string) => {
    try { const r = await togglePublish(id); setExams((p) => p.map((e) => (e.id === id ? { ...e, published: r.published } : e))); }
    catch (err: any) { setError(err.message || 'Failed to toggle publish'); }
  };

  const filtered = exams.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div className="page-header">
          <h1>Exams</h1>
          <button className="btn btn-primary" onClick={() => navigate('/teacher/exams/new')}>+ New Exam</button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <input className="input" type="text" placeholder="Search exams..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search exams" />
        </div>
        {loading ? (
          <div className="loading-center"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>{search ? 'No exams match your search.' : 'No exams yet. Create your first exam!'}</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map((exam) => (
              <div key={exam.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 16 }}>{exam.title}</strong>
                    <span className={`badge ${exam.published ? 'badge-published' : 'badge-draft'}`}>{exam.published ? 'Pub' : 'Draft'}</span>
                    {exam.locked && <span className="badge badge-locked">Locked</span>}
                  </div>
                  <div className="text-sm text-secondary">{exam.description || 'No description'}</div>
                  <div className="text-sm text-secondary" style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{exam.questions.length} q</span><span>{exam.duration}m</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleTogglePublish(exam.id)}>{exam.published ? 'Unpub' : 'Pub'}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)} disabled={exam.locked}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(exam.id)} disabled={exam.locked}>Del</button>
                  <button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/exams/${exam.id}`)}>View</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {confirmDelete && (
          <div className="confirm-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Exam</h3><p>Are you sure? This cannot be undone.</p>
              <div className="confirm-actions"><button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}