import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getExam, createExam, updateExam } from '../../api';
import type { CreateExamBody, Question } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';

type EditableQuestion = Omit<Question, 'id' | 'examId'> & { id?: string };

export default function ExamEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState('');
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [expandedQ, setExpandedQ] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingExam, setLoadingExam] = useState(isEdit);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEdit && id) {
      getExam(id).then((exam) => {
        setTitle(exam.title); setDesc(exam.description); setDuration(exam.duration);
        setStartTime(exam.startTime ? exam.startTime.slice(0, 16) : '');
        setQuestions(exam.questions.map((q) => ({ ...q }))); setLoadingExam(false);
      }).catch((err) => { setError(err.message || 'Failed to load'); setLoadingExam(false); });
    }
  }, [id, isEdit]);

  const addQ = (type: 'mcq' | 'short' | 'long') => {
    if (questions.length >= 30) return;
    const q: EditableQuestion = { position: questions.length + 1, type, text: '', points: 5, ...(type === 'mcq' ? { options: ['', '', '', ''], correct: '' } : {}) };
    setQuestions([...questions, q]); setExpandedQ(questions.length);
  };
  const updQ = (i: number, u: Partial<EditableQuestion>) => { const c = [...questions]; c[i] = { ...c[i], ...u }; setQuestions(c); };
  const delQ = (i: number) => { setQuestions(questions.filter((_, x) => x !== i)); if (expandedQ === i) setExpandedQ(null); else if (expandedQ !== null && expandedQ > i) setExpandedQ(expandedQ - 1); };
  const moveQ = (i: number, d: 'up' | 'down') => { if (d === 'up' && i === 0) return; if (d === 'down' && i === questions.length - 1) return; const c = [...questions]; const t = d === 'up' ? i - 1 : i + 1; [c[i], c[t]] = [c[t], c[i]]; setQuestions(c); setExpandedQ(t); };
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    if (!duration || duration <= 0) e.duration = 'Duration must be positive';
    questions.forEach((q, i) => { if (!q.text.trim()) e[`q${i}t`] = 'Required'; if (!q.points || q.points <= 0) e[`q${i}p`] = 'Required'; if (q.type === 'mcq') { const f = (q.options || []).filter((o) => o.trim()); if (f.length < 2) e[`q${i}o`] = 'Need 2+'; if (!q.correct || !(q.options || []).includes(q.correct)) e[`q${i}c`] = 'Select correct'; } });
    setFieldErrors(e); return Object.keys(e).length === 0;
  };
  const save = async () => { if (!validate()) return; setSaving(true); setError(''); try { const b: CreateExamBody = { title: title.trim(), description: desc, duration, startTime: startTime || undefined, questions: questions.map((q) => ({ position: q.position, type: q.type, text: q.text.trim(), points: q.points, options: q.type === 'mcq' ? q.options : undefined, correct: q.type === 'mcq' ? q.correct : undefined })) }; if (isEdit && id) await updateExam(id, b); else await createExam(b); navigate('/teacher/exams'); } catch (err: any) { setError(err.message || 'Failed'); } finally { setSaving(false); } };

  if (loadingExam) return <div className="loading-center"><span className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div className="page-header"><h1>{isEdit ? 'Edit' : 'New'} Exam</h1><button className="btn btn-ghost" onClick={() => navigate('/teacher/exams')}>&larr; Back</button></div>
        {error && <div className="error-banner">{error}</div>}
        <div className="card mb-2">
          <div className="grid-2">
            <div className="form-group"><label className="label" htmlFor="et">Title *</label><input id="et" className={`input ${fieldErrors.title ? 'input-error' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} />{fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}</div>
            <div className="form-group"><label className="label" htmlFor="ed">Duration (min) *</label><input id="ed" className={`input ${fieldErrors.duration ? 'input-error' : ''}`} type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />{fieldErrors.duration && <span className="field-error">{fieldErrors.duration}</span>}</div>
          </div>
          <div className="form-group"><label className="label" htmlFor="eds">Description</label><textarea id="eds" className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="form-group"><label className="label" htmlFor="es">Start time</label><input id="es" className="input" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
        </div>
        <div className="card mb-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}><h2 style={{ fontSize: 16, fontWeight: 600 }}>Questions ({questions.length}/30)</h2><div style={{ display: 'flex', gap: 6 }}><button className="btn btn-sm btn-primary" onClick={() => addQ('mcq')} disabled={questions.length >= 30}>+ MCQ</button><button className="btn btn-sm btn-primary" onClick={() => addQ('short')} disabled={questions.length >= 30}>+ Short</button><button className="btn btn-sm btn-primary" onClick={() => addQ('long')} disabled={questions.length >= 30}>+ Long</button></div></div>
          {questions.length === 0 ? <div className="empty-state"><p>No questions yet.</p></div> :
            questions.map((q, i) => (
              <div key={i} className="question-card">
                <div className="question-card-header" onClick={() => setExpandedQ(expandedQ === i ? null : i)}>
                  <span className="question-position">{i + 1}</span><span className={`badge ${q.type === 'mcq' ? 'badge-mcq' : q.type === 'short' ? 'badge-short' : 'badge-long'}`}>{q.type.toUpperCase()}</span><span className="question-preview">{q.text || '(empty)'}</span>
                  <div className="question-actions" onClick={(e) => e.stopPropagation()}><button className="btn btn-sm btn-ghost" onClick={() => moveQ(i, 'up')} disabled={i === 0} aria-label="Up">&uarr;</button><button className="btn btn-sm btn-ghost" onClick={() => moveQ(i, 'down')} disabled={i === questions.length - 1} aria-label="Down">&darr;</button><button className="btn btn-sm btn-danger" onClick={() => delQ(i)} aria-label="Delete">Del</button></div>
                </div>
                {expandedQ === i && (
                  <div className="question-card-body">
                    <div className="form-group"><label className="label">Text *</label><textarea className={`input ${fieldErrors[`q${i}t`] ? 'input-error' : ''}`} rows={2} value={q.text} onChange={(e) => updQ(i, { text: e.target.value })} />{fieldErrors[`q${i}t`] && <span className="field-error">{fieldErrors[`q${i}t`]}</span>}</div>
                    <div className="form-group"><label className="label">Points *</label><input className={`input ${fieldErrors[`q${i}p`] ? 'input-error' : ''}`} type="number" min={1} value={q.points} onChange={(e) => updQ(i, { points: Number(e.target.value) })} style={{ maxWidth: 120 }} />{fieldErrors[`q${i}p`] && <span className="field-error">{fieldErrors[`q${i}p`]}</span>}</div>
                    {q.type === 'mcq' && (<div><label className="label">Options *</label>{fieldErrors[`q${i}o`] && <span className="field-error">{fieldErrors[`q${i}o`]}</span>}{fieldErrors[`q${i}c`] && <span className="field-error" style={{ marginLeft: 8 }}>{fieldErrors[`q${i}c`]}</span>}{(q.options || ['', '', '', '']).map((o, oi) => (<div key={oi} style={{ display: 'flex', gap: 8, marginBottom: 6 }}><input type="radio" name={`c-${i}`} checked={q.correct === o && o.trim() !== ''} onChange={() => updQ(i, { correct: o })} /><input className="input" value={o} onChange={(e) => { const op = [...(q.options || [])]; op[oi] = e.target.value; updQ(i, { options: op }); }} /></div>))}</div>)}
                  </div>
                )}
              </div>
            ))
          }
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>{saving ? <span className="spinner" /> : `Save (${questions.length} q)`}</button></div>
      </main>
    </div>
  );
}