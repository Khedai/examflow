import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSubmissions, resetSubmission, reopenSubmission, clearStudentSession, deleteSubmission, getBatches, assignBatch, createBatch, updateBatch, deleteBatch } from '../../api';
import type { Submission, Batch } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';
import BrandBar from '../../components/BrandBar';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.endsWith('Z') ? value : value + 'Z');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(startedAt: string | null | undefined, submittedAt: string | null | undefined): string | null {
  if (!startedAt || !submittedAt) return null;
  const start = new Date(startedAt.endsWith('Z') ? startedAt : startedAt + 'Z').getTime();
  const end = new Date(submittedAt.endsWith('Z') ? submittedAt : submittedAt + 'Z').getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function liveElapsed(startedAt: string | null | undefined, durationMin?: number): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt.endsWith('Z') ? startedAt : startedAt + 'Z').getTime();
  if (isNaN(start)) return null;
  const elapsedMins = Math.max(0, Math.round((Date.now() - start) / 60000));
  // If we know the exam duration and the timer has run out, show "Timed out" instead of absurd values
  if (durationMin && elapsedMins >= durationMin) return 'Timed out';
  if (elapsedMins < 60) return `${elapsedMins} min`;
  const h = Math.floor(elapsedMins / 60);
  const m = elapsedMins % 60;
  return `${h}h ${m}m`;
}

const STATUS_LABEL: Record<string, string> = {
  ALL: 'All',
  STARTED: 'In progress',
  SUBMITTED: 'Submitted',
  MARKED: 'Marked',
};

export default function SubmissionList() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState<string | null>(null);
  const [batchReassign, setBatchReassign] = useState('');
  const [showBatchManager, setShowBatchManager] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingBatchName, setEditingBatchName] = useState('');

  const loadData = async () => {
    try {
      setError('');
      const [subs, batchList] = await Promise.all([getSubmissions(), getBatches()]);
      setSubmissions(subs);
      setBatches(batchList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh whenever the list contains in-progress submissions so "elapsed" stays current
  useEffect(() => {
    if (!submissions.some((s) => s.status === 'STARTED')) return;
    const id = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions.some((s) => s.status === 'STARTED')]);

  const handleBatchAssign = async () => {
    if (!showBatchDialog || !batchReassign) return;
    setActionLoading(showBatchDialog);
    try {
      await assignBatch(showBatchDialog, batchReassign === 'none' ? null : batchReassign);
      setNotice('Batch assignment saved.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to assign batch');
    }
    setShowBatchDialog(null);
    setActionLoading(null);
  };

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return;
    try {
      await createBatch(newBatchName.trim());
      setNewBatchName('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create batch');
    }
  };

  const handleRenameBatch = async (id: string, name: string) => {
    if (!name.trim()) return;
    try {
      await updateBatch(id, name.trim());
      setEditingBatchId(null);
      setEditingBatchName('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to rename batch');
    }
  };

  const handleDeleteBatch = async (id: string) => {
    try {
      await deleteBatch(id);
      loadData();
      if (selectedBatch === id) setSelectedBatch('');
    } catch (err: any) {
      setError(err.message || 'Failed to delete batch');
    }
  };

  const activeBatch = batches.length > 0 ? batches[0] : null;

  const reset = async (id: string) => {
    setActionLoading(id);
    try {
      await resetSubmission(id);
      setNotice('Submission reset. The student can retake the exam.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reset submission');
    }
    setConfirmReset(null);
    setActionLoading(null);
  };

  const reopen = async (id: string) => {
    setActionLoading(id);
    try {
      await reopenSubmission(id);
      setNotice('Submission reopened. The student can submit again from their open exam tab (no refresh needed).');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reopen submission');
    }
    setConfirmReopen(null);
    setActionLoading(null);
  };

  const clearSession = async (id: string) => {
    setActionLoading(id);
    try {
      await clearStudentSession(id);
      setNotice('Session cleared. The student will need to sign in again.');
    } catch (err: any) {
      setError(err.message || 'Failed to clear session');
    }
    setActionLoading(null);
  };

  const deleteSub = async (id: string) => {
    setActionLoading(id);
    try {
      await deleteSubmission(id);
      setConfirmDelete(null);
      setNotice('Submission deleted.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete submission');
    }
    setActionLoading(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      if (filter !== 'ALL' && s.status !== filter) return false;
      if (selectedBatch && s.batch?.id !== selectedBatch) return false;
      if (!q) return true;
      return s.student.name.toLowerCase().includes(q) ||
             s.student.surname.toLowerCase().includes(q) ||
             (s.student.studentId || '').toLowerCase().includes(q);
    });
  }, [submissions, filter, selectedBatch, search]);

  const countFor = (status: string) =>
    status === 'ALL' ? submissions.length : submissions.filter((s) => s.status === status).length;

  const closeRowMenu = (e: React.SyntheticEvent) => {
    (e.target as HTMLElement).closest('details')?.removeAttribute('open');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <BrandBar />

        <div className="page-header">
          <h1>Student Submissions</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {activeBatch && (
              <span className="text-sm" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                Active Batch: <strong style={{ color: 'var(--purple-600)' }}>{activeBatch.name}</strong>
              </span>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => setShowBatchManager(!showBatchManager)}>
              {showBatchManager ? 'Hide Batches' : 'Manage Batches'}
            </button>
          </div>
        </div>

        {/* Summary stats strip */}
        {!loading && submissions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ padding: '12px 18px', flex: 1, minWidth: 140 }}>
              <div className="stat-value" style={{ fontSize: 20 }}>{submissions.length}</div>
              <div className="stat-label">Submissions</div>
            </div>
            <div className="stat-card" style={{ padding: '12px 18px', flex: 1, minWidth: 140 }}>
              <div className="stat-value" style={{ fontSize: 20, color: 'var(--amber-600)' }}>{submissions.filter(s => s.status === 'STARTED').length}</div>
              <div className="stat-label">In Progress</div>
            </div>
            <div className="stat-card" style={{ padding: '12px 18px', flex: 1, minWidth: 140 }}>
              <div className="stat-value" style={{ fontSize: 20, color: '#1e40af' }}>{submissions.filter(s => s.status === 'SUBMITTED').length}</div>
              <div className="stat-label">Pending Review</div>
            </div>
            <div className="stat-card" style={{ padding: '12px 18px', flex: 1, minWidth: 140 }}>
              <div className="stat-value" style={{ fontSize: 20, color: 'var(--teal-600)' }}>{submissions.filter(s => s.status === 'MARKED').length}</div>
              <div className="stat-label">Marked</div>
            </div>
          </div>
        )}

        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <div className="success-banner" role="status">{notice}</div>}

        {/* Batch Manager Panel */}
        {showBatchManager && (
          <div className="card" style={{ marginBottom: 20, padding: '1.5rem', animation: 'fadeIn 0.25s ease-out' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Batch Manager</h3>
            <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>
              New submissions are automatically assigned to the newest active batch. Each batch shows its progress at a glance.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input className="input" style={{ flex: 1 }} placeholder="New batch name (e.g. Test Group A)" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateBatch()} aria-label="New batch name" />
              <button className="btn btn-primary" style={{ padding: '8px 20px', minHeight: 44 }} onClick={handleCreateBatch}>Create Batch</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {batches.length === 0 ? (
                <p className="text-sm text-secondary">No batches created yet.</p>
              ) : (
                batches.map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {i === 0 && <span className="badge badge-published" style={{ fontSize: 10 }}>ACTIVE</span>}
                        {editingBatchId === b.id ? (
                          <input className="input" style={{ flex: 1, padding: '6px 12px', minHeight: 36, fontSize: 13 }} value={editingBatchName} onChange={(e) => setEditingBatchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameBatch(b.id, editingBatchName)} autoFocus aria-label="Batch name" />
                        ) : (
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</span>
                        )}
                      </div>
                      <div className="text-sm text-secondary" style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', fontWeight: 500 }}>
                        <span><strong style={{ color: 'var(--text-primary)' }}>{b.studentCount ?? 0}</strong> students</span>
                        <span style={{ color: 'var(--amber-600)' }}>{b.startedCount ?? 0} in progress</span>
                        <span style={{ color: '#1e40af' }}>{b.submittedCount ?? 0} submitted</span>
                        <span style={{ color: 'var(--teal-600)' }}>{b.markedCount ?? 0} marked</span>
                      </div>
                    </div>
                    {editingBatchId === b.id ? (
                      <>
                        <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => handleRenameBatch(b.id, editingBatchName)}>Save</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => { setEditingBatchId(null); setEditingBatchName(''); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => { setEditingBatchId(b.id); setEditingBatchName(b.name); }}>Rename</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteBatch(b.id)}>Delete</button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }} role="tablist" aria-label="Filter by status">
            {['ALL', 'STARTED', 'SUBMITTED', 'MARKED'].map((status) => (
              <button key={status} role="tab" aria-selected={filter === status} className={`btn btn-sm ${filter === status ? 'btn-primary' : 'btn-ghost'}`} style={{ minHeight: 36, border: 'none', boxShadow: 'none' }} onClick={() => setFilter(status)}>{STATUS_LABEL[status]} ({countFor(status)})</button>
            ))}
          </div>
          {batches.length > 0 && (
            <select className="input" style={{ maxWidth: 200, minWidth: 140, minHeight: 44 }} value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} aria-label="Batch Select">
              <option value="">All Batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <input className="input" style={{ maxWidth: 240, minWidth: 160 }} placeholder="Search student name or ID..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>

        {loading ? (
          <div aria-label="Loading submissions">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>{search || filter !== 'ALL' || selectedBatch ? 'No submissions match these filters.' : 'No student submissions found.'}</p></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((sub) => (
              <div key={sub.id} className="submission-row" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1" style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                    {sub.student.name} {sub.student.surname}
                    {sub.student.studentId ? <span className="text-sm text-secondary" style={{ fontWeight: 500, marginLeft: 8 }}>({sub.student.studentId})</span> : null}
                  </div>
                  <div className="text-sm text-secondary" style={{ marginTop: 4, fontWeight: 500 }}>
                    {sub.examTitle}
                    {sub.batch ? <span style={{ marginLeft: 8, color: 'var(--purple-600)' }}>• {sub.batch.name}</span> : null}
                  </div>
                  {/* Time tracking block */}
                  <div className="text-sm" style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap', color: 'var(--text-hint)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Started: <strong style={{ color: 'var(--text-secondary)' }}>{formatDate(sub.startedAt)}</strong>
                    </span>
                    {sub.status === 'STARTED' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber-600)' }}>
                        Elapsed: <strong>{liveElapsed(sub.startedAt, sub.examDuration)}</strong>
                      </span>
                    )}
                    {(sub.status === 'SUBMITTED' || sub.status === 'MARKED') && (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Submitted: <strong style={{ color: 'var(--text-secondary)' }}>{formatDate(sub.submittedAt)}</strong>
                        </span>
                        {formatDuration(sub.startedAt, sub.submittedAt) && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--teal-800)' }}>
                            Time taken: <strong>{formatDuration(sub.startedAt, sub.submittedAt)}</strong>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className={`badge ${sub.status === 'SUBMITTED' ? 'badge-submitted' : sub.status === 'MARKED' ? 'badge-marked' : 'badge-started'}`}>
                    {STATUS_LABEL[sub.status] ?? sub.status}
                  </span>
                  {sub.score != null && (
                    <span className="text-sm" style={{ fontWeight: 700, color: 'var(--purple-600)' }}>
                      {sub.score} pts
                    </span>
                  )}
                  <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => { setShowBatchDialog(sub.id); setBatchReassign(sub.batch?.id || 'none'); }} disabled={actionLoading === sub.id} title="Assign Batch">Batch</button>
                  <button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/submissions/${sub.id}`)}>{sub.status === 'MARKED' ? 'Review' : 'Grade'}</button>
                  <details className="row-menu">
                    <summary className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} aria-label="More actions">More ▾</summary>
                    <div className="row-menu-items" role="menu">
                      {sub.status === 'SUBMITTED' && (
                        <button role="menuitem" onClick={(e) => { closeRowMenu(e); setConfirmReopen(sub.id); }} disabled={actionLoading === sub.id} title="Reopen so the student can continue and submit again (keeps answers)">Reopen</button>
                      )}
                      <button role="menuitem" onClick={(e) => { closeRowMenu(e); setConfirmReset(sub.id); }} disabled={actionLoading === sub.id} title="Reset submission for retake">Reset</button>
                      <button role="menuitem" onClick={(e) => { closeRowMenu(e); clearSession(sub.id); }} disabled={actionLoading === sub.id} title="Clear browser lock session">Clear session</button>
                      <button role="menuitem" className="danger" onClick={(e) => { closeRowMenu(e); setConfirmDelete(sub.id); }} disabled={actionLoading === sub.id} title="Permanently delete this submission">Delete</button>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}

        {confirmReopen && (
          <div className="confirm-overlay" onClick={() => !actionLoading && setConfirmReopen(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Reopen Submission</h3>
              <p>This lets the student continue and submit again. Their <strong>saved answers are kept</strong>, they stay logged in, and a fresh timer starts.</p>
              <p className="text-sm text-secondary" style={{ marginTop: 8 }}>Tell the student to press <strong>Submit Exam</strong> on their open tab — they must NOT refresh the page.</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmReopen(null)} disabled={actionLoading !== null}>Cancel</button>
                <button className="btn btn-primary" style={{ background: 'var(--amber-600, #d97706)', borderColor: 'var(--amber-600, #d97706)' }} onClick={() => reopen(confirmReopen)} disabled={actionLoading !== null}>
                  {actionLoading === confirmReopen ? 'Reopening...' : 'Reopen Submission'}
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmReset && (
          <div className="confirm-overlay" onClick={() => !actionLoading && setConfirmReset(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Reset Submission</h3>
              <p>Are you sure you want to reset this submission? All current answers will be erased and the student will be allowed to retake the exam.</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmReset(null)} disabled={actionLoading !== null}>Cancel</button>
                <button className="btn btn-danger" onClick={() => reset(confirmReset)} disabled={actionLoading !== null}>
                  {actionLoading === confirmReset ? 'Resetting...' : 'Reset Submission'}
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="confirm-overlay" onClick={() => !actionLoading && setConfirmDelete(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Submission</h3>
              <p>This will <strong>permanently remove</strong> the submission and all answers. The student will be able to sign in and start fresh. Are you sure?</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)} disabled={actionLoading !== null}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteSub(confirmDelete)} disabled={actionLoading !== null}>
                  {actionLoading === confirmDelete ? 'Deleting...' : 'Delete Submission'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showBatchDialog && (
          <div className="confirm-overlay" onClick={() => !actionLoading && setShowBatchDialog(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Assign Batch</h3>
              <p style={{ marginBottom: 12 }}>Move this student submission to a different batch group:</p>
              <select className="input" style={{ width: '100%', marginBottom: 20 }} value={batchReassign} onChange={(e) => setBatchReassign(e.target.value)} disabled={actionLoading !== null}>
                <option value="none">None</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setShowBatchDialog(null)} disabled={actionLoading !== null}>Cancel</button>
                <button className="btn btn-primary" onClick={handleBatchAssign} disabled={actionLoading !== null}>
                  {actionLoading === showBatchDialog ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
