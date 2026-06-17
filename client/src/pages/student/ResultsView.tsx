import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getResult } from '../../api';

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
      <div className="result-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div className="result-header"><h1>Exam Submitted</h1><p className="text-secondary">Your exam has been submitted and is awaiting marking.</p>{result.submittedAt && <p className="text-sm text-secondary mt-1">Submitted at: {new Date(result.submittedAt).toLocaleString()}</p>}</div>
        <div style={{ textAlign: 'center' }}><button className="btn btn-primary" onClick={() => navigate('/student')}>Back to exams</button></div>
      </div>
    );
  }

  if (!result.published) {
    return (
      <div className="result-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
        </div>
        <div className="result-header"><h1>Results Coming Soon</h1><p className="text-secondary">Your exam has been marked. Results will be released soon.</p></div>
        <div style={{ textAlign: 'center' }}><button className="btn btn-primary" onClick={() => navigate('/student')}>Back to exams</button></div>
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
    <div className="result-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <img src="/logo.png" alt="Logo" style={{ height: 60, width: 160, maxWidth: '100%' }} />
      </div>
      <div className="result-header">
        <h1>{result.examTitle || 'Exam Results'}</h1>
        <div className="score-large">{score}<span>/{totalMax}</span></div>
        <div className={`grade-label ${gradeClass}`}>{grade}</div>
        <div className="progress-bar" style={{ maxWidth: 300, margin: '0 auto' }}><div className="progress-fill" style={{ width: `${percentage}%` }} /></div>
        <p className="text-sm text-secondary mt-1">{percentage.toFixed(0)}%</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {answers.map((a) => {
          const isMCQ = a.questionType === 'mcq';
          const isCorrect = isMCQ && a.awardedPoints === a.maxPoints;
          const isWrong = isMCQ && a.awardedPoints === 0;
          const partial = !isMCQ && a.awardedPoints > 0 && a.awardedPoints < a.maxPoints;
          return (
            <div key={a.questionId} className="card result-question">
              <div className="result-question-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className={`badge ${a.questionType === 'mcq' ? 'badge-mcq' : a.questionType === 'short' ? 'badge-short' : 'badge-long'}`}>{a.questionType.toUpperCase()}</span></div>
                <div className={`result-score-display ${isCorrect ? 'correct' : isWrong ? 'wrong' : partial ? 'partial' : ''}`}>{a.awardedPoints}/{a.maxPoints} pts</div>
              </div>
              <div className="result-question-text">{a.questionText}</div>
              <div className="answer-box" style={isCorrect ? { borderColor: 'var(--teal-600)', background: 'var(--teal-50)' } : isWrong ? { borderColor: 'var(--red-600)', background: 'var(--red-50)' } : {}}>{a.answerText || <em className="text-hint">No answer provided</em>}</div>
              {isMCQ && isWrong && a.correct && (<p className="text-sm mt-1" style={{ color: 'var(--teal-600)' }}>Correct answer: {a.correct}</p>)}
              {a.feedback && (<div className="card-flat mt-1"><span className="text-sm" style={{ fontWeight: 500 }}>Feedback: </span><span className="text-sm">{a.feedback}</span></div>)}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}><button className="btn btn-primary" onClick={() => navigate('/student')}>Back to exams</button></div>
    </div>
  );
}