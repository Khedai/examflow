import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getResult } from '../../api';
import BrandBar from '../../components/BrandBar';

interface ResultAnswer {
  questionId: string;
  questionText: string;
  questionType: string;
  maxPoints: number;
  answerText: string;
  awardedPoints: number;
  feedback: string;
  correct?: string;
}

export default function ResultsView() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!submissionId) return;
    getResult(submissionId).then(setResult).catch((err) => setError(err.message || 'Failed to load result')).finally(() => setLoading(false));
  }, [submissionId]);

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!result) return <div className="error-banner">Result not found</div>;

  if (result.status === 'SUBMITTED') {
    return (
      <div className="result-container" style={{ textAlign: 'center', maxWidth: 600 }}>
        <BrandBar size="lg" centered />
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <div style={{ marginBottom: 16 }}><span className="badge badge-marked" style={{ fontSize: 13, padding: '6px 16px' }}>Submitted</span></div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Exam Submitted Successfully</h1>
          <p className="text-secondary" style={{ marginBottom: 20 }}>Your answers have been securely submitted and are now awaiting marking by the teacher.</p>
          {result.startedAt && (
            <p className="text-sm text-hint" style={{ marginBottom: 4 }}>
              Started: {new Date(result.startedAt.endsWith('Z') ? result.startedAt : result.startedAt + 'Z').toLocaleString()}
            </p>
          )}
          {result.submittedAt && (
            <p className="text-sm text-hint" style={{ marginBottom: 24 }}>
              Submitted: {new Date(result.submittedAt.endsWith('Z') ? result.submittedAt : result.submittedAt + 'Z').toLocaleString()}
            </p>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/student')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (!result.published) {
    return (
      <div className="result-container" style={{ textAlign: 'center', maxWidth: 600 }}>
        <BrandBar size="lg" centered />
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <div style={{ marginBottom: 16 }}><span className="badge badge-submitted" style={{ fontSize: 13, padding: '6px 16px' }}>Awaiting release</span></div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Results Pending Release</h1>
          <p className="text-secondary" style={{ marginBottom: 24 }}>Your exam has been marked. The results will be visible here once released by your teacher.</p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/student')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const score = result.score || 0;
  const answers: ResultAnswer[] = result.answers || [];
  const totalMax = answers.reduce((s: number, a: ResultAnswer) => s + a.maxPoints, 0);
  const percentage = totalMax > 0 ? (score / totalMax) * 100 : 0;
  let grade = 'Fail', gradeClass = 'grade-fail';
  if (percentage >= 75) { grade = 'Distinction'; gradeClass = 'grade-distinction'; }
  else if (percentage >= 60) { grade = 'Merit'; gradeClass = 'grade-merit'; }
  else if (percentage >= 50) { grade = 'Pass'; gradeClass = 'grade-pass'; }

  return (
    <div className="result-container" style={{ paddingBottom: '4rem' }}>
      <BrandBar centered />
      <div className="card" style={{ padding: '2.5rem 2rem', marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{result.examTitle || 'Exam Results'}</h1>
        <div className="score-large" style={{ margin: '1rem 0' }}>{score}<span> / {totalMax} pts</span></div>
        <div className={`grade-label ${gradeClass}`} style={{ marginBottom: '1.5rem' }}>{grade}</div>
        <div className="progress-bar" style={{ maxWidth: 320, margin: '0 auto 8px auto' }}><div className="progress-fill" style={{ width: `${percentage}%` }} /></div>
        <p className="text-sm text-secondary" style={{ fontWeight: 600 }}>{percentage.toFixed(0)}% Score</p>
        {/* Time tracking */}
        <div className="text-sm text-hint" style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {result.startedAt && (
            <span>Started: {new Date(result.startedAt.endsWith('Z') ? result.startedAt : result.startedAt + 'Z').toLocaleString()}</span>
          )}
          {result.submittedAt && (
            <span>Submitted: {new Date(result.submittedAt.endsWith('Z') ? result.submittedAt : result.submittedAt + 'Z').toLocaleString()}</span>
          )}
        </div>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: '1.25rem', borderLeft: '4px solid var(--purple-600)', paddingLeft: 10 }}>Question Review</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {answers.map((a) => {
          const isMCQ = a.questionType === 'mcq';
          const ap = a.awardedPoints ?? 0;
          const mp = a.maxPoints;
          const isCorrect = isMCQ && ap === mp;
          const isWrong = isMCQ && ap === 0;
          const partial = !isMCQ && ap > 0 && ap < mp;
          return (
            <div key={a.questionId} className="card result-question" style={{ margin: 0 }}>
              <div className="result-question-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${a.questionType === 'mcq' ? 'badge-mcq' : a.questionType === 'short' ? 'badge-short' : 'badge-long'}`}>{a.questionType.toUpperCase()}</span>
                </div>
                <div className={`result-score-display ${isCorrect ? 'correct' : isWrong ? 'wrong' : partial ? 'partial' : ''}`} style={{ fontSize: 14, fontWeight: 700 }}>
                  Awarded: {ap}/{mp} pts
                </div>
              </div>
              <div className="result-question-text">{a.questionText}</div>
              <div className="answer-box" style={isCorrect ? { borderColor: 'rgba(16, 185, 129, 0.3)', background: 'var(--teal-50)' } : isWrong ? { borderColor: 'rgba(239, 68, 68, 0.3)', background: 'var(--red-50)' } : {}}>{a.answerText || <em className="text-hint">No answer provided</em>}</div>
              {isMCQ && isWrong && a.correct && (<p className="text-sm mt-1" style={{ color: 'var(--teal-800)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>✓ Correct answer: <strong>{a.correct}</strong></p>)}
              {a.feedback && (<div className="card-flat mt-1" style={{ borderLeft: '3px solid var(--purple-600)' }}><span className="text-sm" style={{ fontWeight: 600 }}>Teacher Feedback: </span><span className="text-sm">{a.feedback}</span></div>)}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2.5rem' }}><button className="btn btn-primary" onClick={() => navigate('/student')}>Back to exams</button></div>
    </div>
  );
}