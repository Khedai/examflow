import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getExam, createExam, updateExam } from '../../api';
import type { CreateExamBody, Question } from '../../types';
import TeacherSidebar from '../../components/TeacherSidebar';
import BrandBar from '../../components/BrandBar';

type EditableQuestion = Omit<Question, 'id' | 'examId'> & { id?: string };

export default function ExamEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [duration, setDuration] = useState(90);
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
        if (exam.locked) {
          setError('This exam is locked because students have started it. Editing is disabled.');
          setLoadingExam(false);
          navigate(`/teacher/exams/${id}`, { replace: true });
          return;
        }
        setTitle(exam.title);
        setDesc(exam.description);
        setDuration(exam.duration);
        setStartTime(exam.startTime ? exam.startTime.slice(0, 16) : '');
        setQuestions(exam.questions.map((q) => ({ ...q })));
        setLoadingExam(false);
      }).catch((err) => {
        setError(err.message || 'Failed to load exam');
        setLoadingExam(false);
      });
    }
  }, [id, isEdit]);

  const addQ = (type: 'mcq' | 'short' | 'long') => {
    if (questions.length >= 30) return;
    const q: EditableQuestion = {
      position: questions.length + 1,
      type,
      text: '',
      points: 5,
      ...(type === 'mcq' ? { options: ['', '', '', ''], correct: '' } : {})
    };
    setQuestions([...questions, q]);
    setExpandedQ(questions.length);
  };

  const updQ = (i: number, u: Partial<EditableQuestion>) => {
    const c = [...questions];
    c[i] = { ...c[i], ...u };
    setQuestions(c);
  };

  const delQ = (i: number) => {
    setQuestions(questions.filter((_, x) => x !== i));
    if (expandedQ === i) setExpandedQ(null);
    else if (expandedQ !== null && expandedQ > i) setExpandedQ(expandedQ - 1);
  };

  const moveQ = (i: number, d: 'up' | 'down') => {
    if (d === 'up' && i === 0) return;
    if (d === 'down' && i === questions.length - 1) return;
    const c = [...questions];
    const t = d === 'up' ? i - 1 : i + 1;
    [c[i], c[t]] = [c[t], c[i]];
    setQuestions(c);
    setExpandedQ(t);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    if (!duration || duration <= 0) e.duration = 'Duration must be positive';
    questions.forEach((q, i) => {
      if (!q.text.trim()) e[`q${i}t`] = 'Question text is required';
      if (!q.points || q.points <= 0) e[`q${i}p`] = 'Points must be greater than 0';
      if (q.type === 'mcq') {
        const f = (q.options || []).filter((o) => o.trim());
        if (f.length < 2) e[`q${i}o`] = 'Minimum of 2 options is required';
        if (!q.correct || !f.includes(q.correct)) e[`q${i}c`] = 'Choose a correct answer option';
      }
    });
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      const b: CreateExamBody = {
        title: title.trim(),
        description: desc,
        duration,
        startTime: startTime || undefined,
        questions: questions.map((q, qi) => ({
          // Positions are recomputed from the visible order (add/move/delete can stale them),
          // and blank MCQ options are dropped — the server rejects empty option strings.
          position: qi + 1,
          type: q.type,
          text: q.text.trim(),
          points: q.points,
          options: q.type === 'mcq' ? (q.options || []).filter((o) => o.trim()) : undefined,
          correct: q.type === 'mcq' ? q.correct : undefined
        }))
      };
      if (isEdit && id) await updateExam(id, b);
      else await createExam(b);
      navigate('/teacher/exams');
    } catch (err: any) {
      setError(err.message || 'Failed to save exam');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExam) return <div className="loading-center"><span className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <TeacherSidebar />
      <main className="main-content">
        <BrandBar />

        <div className="page-header">
          <h1>{isEdit ? 'Edit Exam' : 'Create Exam'}</h1>
          <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border-medium)' }} onClick={() => navigate('/teacher/exams')}>&larr; Back to Exams</button>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Exam Details</h2>
          <div className="grid-2">
            <div className="form-group">
              <label className="label" htmlFor="et">Exam Title *</label>
              <input id="et" className={`input ${fieldErrors.title ? 'input-error' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mathematics Midterm" />
              {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
            </div>
            <div className="form-group">
              <label className="label" htmlFor="ed">Duration Limit (minutes) *</label>
              <input id="ed" className={`input ${fieldErrors.duration ? 'input-error' : ''}`} type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              {fieldErrors.duration && <span className="field-error">{fieldErrors.duration}</span>}
            </div>
          </div>
          <div className="form-group">
            <label className="label" htmlFor="eds">Description</label>
            <textarea id="eds" className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Add instructions or details for students..." style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="es">Scheduled Start Time (Optional)</label>
            <input id="es" className="input" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Questions ({questions.length}/30)</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => addQ('mcq')} disabled={questions.length >= 30}>+ MCQ Question</button>
              <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => addQ('short')} disabled={questions.length >= 30}>+ Short Answer</button>
              <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--border-medium)' }} onClick={() => addQ('long')} disabled={questions.length >= 30}>+ Long Essay</button>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="empty-state" style={{ border: 'none', padding: '1rem' }}><p>Add your first question by selecting one of the types above.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {questions.map((q, i) => (
                <div key={i} className="question-card" style={{ margin: 0 }}>
                  <div className="question-card-header" onClick={() => setExpandedQ(expandedQ === i ? null : i)}>
                    <span className="question-position">{i + 1}</span>
                    <span className={`badge ${q.type === 'mcq' ? 'badge-mcq' : q.type === 'short' ? 'badge-short' : 'badge-long'}`}>{q.type.toUpperCase()}</span>
                    <span className="question-preview" style={{ marginLeft: 8 }}>{q.text || <em className="text-hint">Draft Question Text...</em>}</span>
                    <div className="question-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" style={{ minWidth: 32, padding: 0 }} onClick={() => moveQ(i, 'up')} disabled={i === 0} aria-label="Move Up">↑</button>
                      <button className="btn btn-sm btn-ghost" style={{ minWidth: 32, padding: 0 }} onClick={() => moveQ(i, 'down')} disabled={i === questions.length - 1} aria-label="Move Down">↓</button>
                      <button className="btn btn-sm btn-danger" style={{ minWidth: 54 }} onClick={() => delQ(i)} aria-label="Delete">Delete</button>
                    </div>
                  </div>
                  {expandedQ === i && (
                    <div className="question-card-body" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                      <div className="form-group">
                        <label className="label">Question Text *</label>
                        <textarea className={`input ${fieldErrors[`q${i}t`] ? 'input-error' : ''}`} rows={2} value={q.text} onChange={(e) => updQ(i, { text: e.target.value })} placeholder="Type the question prompt here..." style={{ resize: 'vertical' }} />
                        {fieldErrors[`q${i}t`] && <span className="field-error">{fieldErrors[`q${i}t`]}</span>}
                      </div>
                      <div className="form-group">
                        <label className="label">Points Value *</label>
                        <input className={`input ${fieldErrors[`q${i}p`] ? 'input-error' : ''}`} type="number" min={1} value={q.points} onChange={(e) => updQ(i, { points: Number(e.target.value) })} style={{ maxWidth: 120 }} />
                        {fieldErrors[`q${i}p`] && <span className="field-error">{fieldErrors[`q${i}p`]}</span>}
                      </div>
                      
                      {q.type === 'mcq' && (
                        <div style={{ marginTop: 12 }}>
                          <label className="label">Answer options — tick the correct one *</label>
                          {fieldErrors[`q${i}o`] && <span className="field-error">{fieldErrors[`q${i}o`]}</span>}
                          {fieldErrors[`q${i}c`] && <span className="field-error" style={{ marginLeft: 8 }}>{fieldErrors[`q${i}c`]}</span>}
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            {(q.options || ['', '', '', '']).map((o, oi) => (
                              <div key={oi} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <input type="radio" name={`c-${i}`} style={{ width: 20, height: 20, cursor: 'pointer' }} checked={q.correct === o && o.trim() !== ''} onChange={() => updQ(i, { correct: o })} title="Mark as correct answer" aria-label={`Mark option ${oi + 1} as correct`} />
                                <input className="input" value={o} onChange={(e) => { const op = [...(q.options || [])]; const prev = op[oi]; op[oi] = e.target.value; updQ(i, q.correct === prev ? { options: op, correct: e.target.value } : { options: op }); }} placeholder={`Option ${oi + 1} (leave blank to omit)`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 160 }}>
            {saving ? (<><span className="spinner" aria-hidden="true" /> Saving…</>) : `Save Exam (${questions.length} questions)`}
          </button>
        </div>
      </main>
    </div>
  );
}