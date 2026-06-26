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

  const fetch = async () => { try { setError(''); const p: any = {}; if (filter !== 'ALL') p.status = filter; if (selectedBatch) p.batchId = selectedBatch; setSubmissions(await getSubmissions(p)); } catch (err: any) { setError(err.message || 'Failed'); } finally { setLoading(false); } };
  const fetchBatches = async () => { try { setBatches(await getBatches()); } catch {} };
  useEffect(() => { fetch(); fetchBatches(); }, [filter, selectedBatch]);

  const handleBatchAssign = async () => { if (!showBatchDialog || !batchReassign) return; setActionLoading(showBatchDialog); try { await assignBatch(showBatchDialog, batchReassign === 'none' ? null as any : batchReassign); fetch(); } catch (err: any) { setError(err.message || ''); } setShowBatchDialog(null); setActionLoading(null); };
  const handleCreateBatch = async () => { if (!newBatchName.trim()) return; try { await createBatch(newBatchName.trim()); setNewBatchName(''); await fetchBatches(); } catch (err: any) { setError(err.message || ''); } };
  const handleRenameBatch = async (id: string, name: string) => { if (!name.trim()) return; try { await updateBatch(id, name.trim()); setEditingBatchId(null); setEditingBatchName(''); await fetchBatches(); } catch (err: any) { setError(err.message || ''); } };
  const handleDeleteBatch = async (id: string) => { try { await deleteBatch(id); await fetchBatches(); if (selectedBatch === id) setSelectedBatch(''); } catch (err: any) { setError(err.message || ''); } };

  const activeBatch = batches.length > 0 ? batches[0] : null; // sorted by created_at DESC, newest first

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
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h1>Submissions</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {activeBatch && (<span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Active batch: <strong style={{ color: 'var(--primary)' }}>{activeBatch.name}</strong></span>)}
            <button className="btn btn-sm btn-primary" onClick={() => setShowBatchManager(!showBatchManager)}>{showBatchManager ? 'Close' : 'Manage Batches'}</button>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}

        {/* Batch Manager Panel */}
        {showBatchManager && (
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Batch Manager</h3>
            <p className="text-sm text-secondary" style={{ marginBottom: 12 }}>New submissions are automatically assigned to the <strong>newest</strong> batch (shown first).</p>
            {/* Create new batch */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input className="input" style={{ flex: 1 }} placeholder="New batch name (e.g. Week 2: 27 June)" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateBatch()} />
              <button className="btn btn-sm btn-primary" onClick={handleCreateBatch}>Create</button>
            </div>
            {/* List existing batches */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {batches.length === 0 && <p className="text-sm text-secondary">No batches yet.</p>}
              {batches.map((b, i) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  {i === 0 && <span className="badge badge-submitted" style={{ fontSize: 10 }}>ACTIVE</span>}
                  {editingBatchId === b.id ? (
                    <>
                      <input className="input" style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} value={editingBatchName} onChange={(e) => setEditingBatchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameBatch(b.id, editingBatchName)} autoFocus />
                      <button className="btn btn-sm btn-ghost" onClick={() => handleRenameBatch(b.id, editingBatchName)}>Save</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditingBatchId(null); setEditingBatchName(''); }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 14 }}>{b.name}</span>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditingBatchId(b.id); setEditingBatchName(b.name); }}>Ren</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteBatch(b.id)}>Del</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {['ALL', 'STARTED', 'SUBMITTED', 'MARKED'].map((s) => (<button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>{s}</button>))}
          {batches.length > 0 && (
            <select className="input" style={{ maxWidth: 180, minWidth: 120 }} value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} aria-label="Batch">
              <option value="">All Batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <input className="input" style={{ maxWidth: 200, minWidth: 120 }} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        {loading ? <div className="loading-center"><span className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><p>{search ? 'No matches.' : 'No submissions yet.'}</p></div> : (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((sub) => (<div key={sub.id} className="submission-row"><div className="flex-1"><div style={{ fontWeight: 500 }}>{sub.student.name} {sub.student.surname} <span className="text-sm text-secondary">({sub.student.studentId})</span></div><div className="text-sm text-secondary">{sub.examTitle}{sub.batch ? <span style={{ marginLeft: 8, color: 'var(--primary)' }}>• {sub.batch.name}</span> : null}</div></div><span className={`badge ${sub.status === 'SUBMITTED' ? 'badge-submitted' : sub.status === 'MARKED' ? 'badge-marked' : 'badge-started'}`}>{sub.status}</span>{sub.score != null && <span className="text-sm">{sub.score} pts</span>}<button className="btn btn-sm btn-ghost" onClick={() => { setShowBatchDialog(sub.id); setBatchReassign(sub.batch?.id || 'none'); }} disabled={actionLoading === sub.id} title="Change batch">Bt</button><button className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(sub.id)} disabled={actionLoading === sub.id}>Rst</button><button className="btn btn-sm btn-ghost" onClick={() => clearSession(sub.id)} disabled={actionLoading === sub.id}>Clr</button><button className="btn btn-sm btn-primary" onClick={() => navigate(`/teacher/submissions/${sub.id}`)}>{sub.status === 'MARKED' ? 'View' : 'Mark'}</button></div>))}
          </div>
        )}
        {confirmReset && (
          <div className="confirm-overlay" onClick={() => !actionLoading && setConfirmReset(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Reset Submission</h3>
              <p>Clear all answers and allow retake?</p>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmReset(null)} disabled={actionLoading !== null}>Cancel</button>
                <button className="btn btn-danger" onClick={() => reset(confirmReset)} disabled={actionLoading !== null}>
                  {actionLoading === confirmReset ? 'Resetting...' : 'Reset'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showBatchDialog && (
          <div className="confirm-overlay" onClick={() => !actionLoading && setShowBatchDialog(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Assign Batch</h3>
              <p>Select a batch for this submission:</p>
              <select className="input" style={{ width: '100%', marginBottom: 12 }} value={batchReassign} onChange={(e) => setBatchReassign(e.target.value)} disabled={actionLoading !== null}>
                <option value="none">None</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => setShowBatchDialog(null)} disabled={actionLoading !== null}>Cancel</button>
                <button className="btn btn-primary" onClick={handleBatchAssign} disabled={actionLoading !== null}>
                  {actionLoading === showBatchDialog ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}