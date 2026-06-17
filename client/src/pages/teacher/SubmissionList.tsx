import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSubmissions, resetSubmission, clearStudentSession } from '../../api';
import type { Submission } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

export default function SubmissionList() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetch = async () => { try { setError(''); const p: any = {}; if (filter !== 'ALL') p.status = filter; setSubmissions(await getSubmissions(p)); } catch (err: any) { setError(err.message || 'Failed'); } finally { setLoading(false); } };
  useEffect(() => { fetch(); }, [filter]);

  const reset = async (id: string) => { setActionLoading(id); try { await resetSubmission(id); fetch(); } catch (err: any) { setError(err.message || ''); } setConfirmReset(null); setActionLoading(null); };
  const clearSession = async (id: string) => { setActionLoading(id); try { await clearStudentSession(id); } catch (err: any) { setError(err.message || ''); } setActionLoading(null); };

  const filtered = submissions.filter((s) => { if (!search) return true; const q = search.toLowerCase(); return s.student.name.toLowerCase().includes(q) || s.student.surname.toLowerCase().includes(q) || s.student.studentId.toLowerCase().includes(q); });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div className="page-header"><h1>Submissions</h1></div>
        {error && <div className="error-banner">{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {['ALL', 'STARTED', 'SUBMITTED', 'MARKED'].map((s) => (<button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>{s}</button>))}
          <input className="input" style={{ maxWidth: 200, minWidth: 120 }} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        {loading ? <div className="loading-center"><span className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><p>{search ? 'No matches.' : 'No submissions yet.'}</p></div> : (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((sub) => (<div key={sub.id} className="submission-row"><div className="flex-1"><div style={{ fontWeight: 500 }}>{sub.student.name} {sub.student.surname} <span className="text-sm text-secondary">({sub.student.studentId})</span></div><div className="text-sm text-secondary">{sub.examTitle}</div></div><span className={`badge ${sub.status === 'SUBMITTED' ? 'badge-submitted' : sub.status === 'MARKED' ? 'badge-marked' : 'badge-started'}`}>{sub.status}</span>{sub.score != null && <span className="text-sm">{sub.score} pts</span>}<button className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(sub.id)} disabled={actionLoading === sub.id}>Rst</button><button className="btn btn-sm btn-ghost" onClick={() => clearSession(sub.id)} disabled={actionLoading === sub.id}>Clr</button><button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/submissions/${sub.id}`)}>{sub.status === 'MARKED' ? 'View' : 'Mark'}</button></div>))}
          </div>
        )}
        {confirmReset && (<div className="confirm-overlay" onClick={() => setConfirmReset(null)}><div className="confirm-dialog" onClick={(e) => e.stopPropagation()}><h3>Reset Submission</h3><p>Clear all answers and allow retake?</p><div className="confirm-actions"><button className="btn btn-ghost" onClick={() => setConfirmReset(null)}>Cancel</button><button className="btn btn-danger" onClick={() => reset(confirmReset)}>Reset</button></div></div></div>)}
      </main>
    </div>
  );
}