import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSubmission, finalizeMarking } from '../../api';
import type { FinalizeMarkingBody } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

interface AnswerDetail {
  id: string; questionId: string; questionText: string; questionType: string;
  maxPoints: number; answerText: string; awardedPoints: number | null; feedback: string; correct: string;
}

export default function MarkingView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [grades, setGrades] = useState<Record<string, { awardedPoints: number; feedback: string }>>({});
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  useEffect(() => { if (!id) return; getSubmission(id).then((d) => { setSub(d); const g: Record<string, any> = {}; (d.answers || []).forEach((a: any) => { g[a.questionId] = { awardedPoints: a.awardedPoints ?? 0, feedback: a.feedback || '' }; }); setGrades(g); }).catch((e) => setError(e.message || 'Failed')).finally(() => setLoading(false)); }, [id]);

  const running = () => Object.values(grades).reduce((s, g) => s + (g.awardedPoints || 0), 0);
  const totalMax = () => sub?.answers ? sub.answers.reduce((s: number, a: any) => s + a.maxPoints, 0) : 0;

  const setPts = (qid: string, v: number) => setGrades((p) => ({ ...p, [qid]: { ...p[qid], awardedPoints: v } }));
  const setFb = (qid: string, v: string) => setGrades((p) => ({ ...p, [qid]: { ...p[qid], feedback: v } }));

  const finalize = async () => {
    const hasZero = sub.answers.some((a: any) => a.questionType !== 'mcq' && (grades[a.questionId]?.awardedPoints ?? 0) === 0);
    if (hasZero && !confirmFinalize) { setConfirmFinalize(true); return; }
    setSaving(true); setError('');
    try { const b: FinalizeMarkingBody = { answers: sub.answers.map((a: any) => ({ questionId: a.questionId, awardedPoints: grades[a.questionId]?.awardedPoints ?? a.awardedPoints ?? 0, feedback: grades[a.questionId]?.feedback ?? a.feedback ?? '' })) }; await finalizeMarking(sub.id, b); navigate('/teacher/submissions'); }
    catch (err: any) { setError(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!sub) return <div className="error-banner">Submission not found</div>;
  const tm = totalMax(); const rs = running();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content" style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <button className="btn btn-ghost mb-2" onClick={() => navigate('/teacher/submissions')}>&larr; Back</button>
        {error && <div className="error-banner">{error}</div>}
        <div className="marking-header">
          <div className="marking-student-info"><h2>{sub.student?.name} {sub.student?.surname}</h2><p className="text-secondary">{sub.student?.studentId} &middot; {sub.examTitle}</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="marking-score-display"><div className="marking-score-value">{rs}<span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-hint)' }}>/{tm}</span></div><div className="marking-score-label">Total</div></div>
            <button className="btn btn-primary" onClick={finalize} disabled={saving}>{saving ? <span className="spinner" /> : 'Finalize'}</button>
          </div>
        </div>
        <div className="progress-bar mb-2"><div className="progress-fill" style={{ width: `${tm ? (rs / tm) * 100 : 0}%` }} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(sub.answers || []).map((a: AnswerDetail) => {
            const isMCQ = a.questionType === 'mcq';
            const correct = isMCQ && a.answerText === a.correct;
            const g = grades[a.questionId] || { awardedPoints: 0, feedback: '' };
            return (
              <div key={a.questionId} className="card marking-question">
                <div className="marking-q-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className={`badge ${a.questionType === 'mcq' ? 'badge-mcq' : a.questionType === 'short' ? 'badge-short' : 'badge-long'}`}>{a.questionType.toUpperCase()}</span><span className="text-sm text-secondary">{a.maxPoints} pts max</span></div>
                  <div className="marking-q-points-input"><label className="label" style={{ margin: 0 }}>Pts:</label><input className="input" type="number" min={0} max={a.maxPoints} value={g.awardedPoints} onChange={(e) => setPts(a.questionId, Number(e.target.value))} disabled={isMCQ} /><span className="text-sm text-secondary">/ {a.maxPoints}</span></div>
                </div>
                <p style={{ fontWeight: 500, marginBottom: 8 }}>{a.questionText}</p>
                <div className="answer-box">{isMCQ && (<span style={{ marginRight: 8, fontWeight: 600 }}>{correct ? 'Correct' : 'Incorrect'}</span>)}{a.answerText || <em className="text-hint">No answer</em>}</div>
                {isMCQ && !correct && (<p className="text-sm mt-1" style={{ color: 'var(--teal-600)' }}>Correct: {a.correct}</p>)}
                {!isMCQ && (<div className="marking-q-feedback"><label className="label">Feedback</label><textarea className="input" rows={2} value={g.feedback} onChange={(e) => setFb(a.questionId, e.target.value)} /></div>)}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}><button className="btn btn-primary" onClick={finalize} disabled={saving}>{saving ? <span className="spinner" /> : 'Finalize Marking'}</button></div>
        {confirmFinalize && (<div className="confirm-overlay" onClick={() => setConfirmFinalize(false)}><div className="confirm-dialog" onClick={(e) => e.stopPropagation()}><h3>Zero-point questions</h3><p>Some non-MCQ questions have 0 points. Continue?</p><div className="confirm-actions"><button className="btn btn-ghost" onClick={() => { setConfirmFinalize(false); finalize(); }}>Continue</button><button className="btn btn-primary" onClick={() => setConfirmFinalize(false)}>Cancel</button></div></div></div>)}
      </main>
    </div>
  );
}