import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSubmissions, resetSubmission, clearStudentSession, getBatches, assignBatch, createBatch, updateBatch, deleteBatch } from '../../api';
import type { Submission, Batch } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

export default function SubmissionList() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState<string | null>(null);
  const [batchReassign, setBatchReassign] = useState('');
  const [showBatchManager, setShowBatchManager] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingBatchName, setEditingBatchName] = useState('');

  const fetch = async () => {
    try {
      setError('');
      const p: any = {};
      if (filter !== 'ALL') p.status = filter;
      if (selectedBatch) p.batchId = selectedBatch;
      setSubmissions(await getSubmissions(p));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch submissions');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      setBatches(await getBatches());
    } catch {}
  };

  useEffect(() => {
    fetch();
    fetchBatches();
  }, [filter, selectedBatch]);

  const handleBatchAssign = async () => {
    if (!showBatchDialog || !batchReassign) return;
    setActionLoading(showBatchDialog);
    try {
      await assignBatch(showBatchDialog, batchReassign === 'none' ? null as any : batchReassign);
      fetch();
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
      await fetchBatches();
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
      await fetchBatches();
    } catch (err: any) {
      setError(err.message || 'Failed to rename batch');
    }
  };

  const handleDeleteBatch = async (id: string) => {
    try {
      await deleteBatch(id);
      await fetchBatches();
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
      fetch();
    } catch (err: any) {
      setError(err.message || 'Failed to reset submission');
    }
    setConfirmReset(null);
    setActionLoading(null);
  };

  const clearSession = async (id: string) => {
    setActionLoading(id);
    try {
      await clearStudentSession(id);
    } catch (err: any) {
      setError(err.message || 'Failed to clear session');
    }
    setActionLoading(null);
  };

  const filtered = submissions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.student.name.toLowerCase().includes(q) ||
           s.student.surname.toLowerCase().includes(q) ||
           s.student.studentId.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 50, width: 140, maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        
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

        {error && <div className="error-banner">{error}</div>}

        {/* Batch Manager Panel */}
        {showBatchManager && (
          <div className="card" style={{ marginBottom: 20, padding: '1.5rem', animation: 'fadeIn 0.25s ease-out' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Batch Manager</h3>
            <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>
              New submissions are automatically assigned to the newest active batch.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input className="input" style={{ flex: 1 }} placeholder="New batch name (e.g. Test Group A)" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateBatch()} />
              <button className="btn btn-primary" style={{ padding: '8px 20px', minHeight: 44 }} onClick={handleCreateBatch}>Create Batch</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {batches.length === 0 ? (
                <p className="text-sm text-secondary">No batches created yet.</p>
              ) : (
                batches.map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    {i === 0 && <span className="badge badge-published" style={{ fontSize: 10 }}>ACTIVE</span>}
                    {editingBatchId === b.id ? (
                      <>
                        <input className="input" style={{ flex: 1, padding: '6px 12px', minHeight: 36, fontSize: 13 }} value={editingBatchName} onChange={(e) => setEditingBatchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameBatch(b.id, editingBatchName)} autoFocus />
                        <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => handleRenameBatch(b.id, editingBatchName)}>Save</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => { setEditingBatchId(null); setEditingBatchName(''); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{b.name}</span>
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
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            {['ALL', 'STARTED', 'SUBMITTED', 'MARKED'].map((status) => (
              <button key={status} className={`btn btn-sm ${filter === status ? 'btn-primary' : 'btn-ghost'}`} style={{ minHeight: 36, border: 'none', boxShadow: 'none' }} onClick={() => setFilter(status)}>{status}</button>
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
          <div className="loading-center"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>{search ? 'No student records match your query.' : 'No student submissions found.'}</p></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((sub) => (
              <div key={sub.id} className="submission-row" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1" style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                    {sub.student.name} {sub.student.surname} 
                    <span className="text-sm text-secondary" style={{ fontWeight: 500, marginLeft: 8 }}>({sub.student.studentId})</span>
                  </div>
                  <div className="text-sm text-secondary" style={{ marginTop: 4, fontWeight: 500 }}>
                    {sub.examTitle}
                    {sub.batch ? <span style={{ marginLeft: 8, color: 'var(--purple-600)' }}>• {sub.batch.name}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className={`badge ${sub.status === 'SUBMITTED' ? 'badge-submitted' : sub.status === 'MARKED' ? 'badge-marked' : 'badge-started'}`}>
                    {sub.status}
                  </span>
                  {sub.score != null && (
                    <span className="text-sm" style={{ fontWeight: 700, color: 'var(--purple-600)' }}>
                      {sub.score} pts
                    </span>
                  )}
                  <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => { setShowBatchDialog(sub.id); setBatchReassign(sub.batch?.id || 'none'); }} disabled={actionLoading === sub.id} title="Assign Batch">Batch</button>
                  <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => setConfirmReset(sub.id)} disabled={actionLoading === sub.id} title="Reset submission for retake">Reset</button>
                  <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => clearSession(sub.id)} disabled={actionLoading === sub.id} title="Clear browser lock session">Clear Session</button>
                  <button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/submissions/${sub.id}`)}>{sub.status === 'MARKED' ? 'Review' : 'Grade'}</button>
                </div>
              </div>
            ))}
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