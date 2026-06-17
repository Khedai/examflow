import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireTeacher, requireStudent, optionalTeacher } from '../middleware/auth';
import db from '../db';

const router = Router();

// Helper: try to get student ID from token if present
function tryGetStudentId(req: Request): string | null {
  const token = req.headers['x-student-token'] as string;
  if (!token) return null;
  const row = db.prepare('SELECT id FROM students WHERE session_token = ?').get(token) as any;
  return row?.id || null;
}

// ─── TEACHER ROUTES ───────────────────────────────────────

// GET /api/submissions — teacher: all, student: their own
router.get('/', optionalTeacher, (req: Request, res: Response) => {
  try {
    const studentId = tryGetStudentId(req);
    const isTeacher = req.teacherAuthed === true;

    if (!isTeacher && !studentId) return res.status(401).json({ error: 'Unauthorized' });

    const { status, examId, search } = req.query;
    let sql = `
      SELECT s.*, st.student_id as st_id, st.name as st_name, st.surname as st_surname, st.cell as st_cell,
             e.title as exam_title
      FROM submissions s
      JOIN students st ON st.id = s.student_id
      JOIN exams e ON e.id = s.exam_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (!isTeacher) {
      sql += ' AND s.student_id = ?';
      params.push(studentId);
    }

    if (status && ['STARTED', 'SUBMITTED', 'MARKED'].includes(status as string)) {
      sql += ' AND s.status = ?';
      params.push(status);
    }
    if (examId && typeof examId === 'string') {
      sql += ' AND s.exam_id = ?';
      params.push(examId);
    }
    if (search && typeof search === 'string' && isTeacher) {
      sql += ' AND (st.name LIKE ? OR st.surname LIKE ? OR st.student_id LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    sql += ' ORDER BY s.created_at DESC';

    const rows = db.prepare(sql).all(...params) as any[];
    const submissions = rows.map((row) => ({
      id: row.id,
      examId: row.exam_id,
      examTitle: row.exam_title,
      student: { id: row.student_id, studentId: row.st_id, name: row.st_name, surname: row.st_surname, cell: row.st_cell || '' },
      status: row.status,
      startedAt: row.started_at,
      submittedAt: row.submitted_at || null,
      score: row.score,
      answers: [],
    }));
    return res.json(submissions);
  } catch (err: any) {
    console.error('List submissions error:', err);
    return res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// GET /api/submissions/:id (teacher detail)
router.get('/:id', requireTeacher, (req: Request, res: Response) => {
  try {
    const sub = db.prepare(`
      SELECT s.*, st.student_id as st_id, st.name as st_name, st.surname as st_surname, st.cell as st_cell,
             e.title as exam_title, e.published as exam_published
      FROM submissions s
      JOIN students st ON st.id = s.student_id
      JOIN exams e ON e.id = s.exam_id
      WHERE s.id = ?
    `).get(req.params.id) as any;

    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const answers = db.prepare(`
      SELECT a.id, a.question_id as questionId, q.text as questionText, q.type as questionType,
             q.points as maxPoints, a.answer_text as answerText, a.awarded_points as awardedPoints,
             a.feedback, q.correct
      FROM answers a
      JOIN questions q ON q.id = a.question_id
      WHERE a.submission_id = ?
      ORDER BY q.position
    `).all(req.params.id) as any[];

    return res.json({
      id: sub.id,
      examId: sub.exam_id,
      examTitle: sub.exam_title,
      examPublished: sub.exam_published,
      student: { id: sub.student_id, studentId: sub.st_id, name: sub.st_name, surname: sub.st_surname, cell: sub.st_cell || '' },
      status: sub.status,
      startedAt: sub.started_at,
      submittedAt: sub.submitted_at || null,
      score: sub.score,
      answers,
    });
  } catch (err: any) {
    console.error('Get submission error:', err);
    return res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// POST /api/submissions/:id/finalize (teacher)
router.post('/:id/finalize', requireTeacher, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status === 'MARKED') return res.status(409).json({ error: 'Submission already marked' });

    for (const ans of answers) {
      const q = db.prepare('SELECT points, type FROM questions WHERE id = ?').get(ans.questionId) as any;
      if (!q) return res.status(422).json({ error: `Question ${ans.questionId} not found` });
      if (q.type === 'mcq') continue;
      if (typeof ans.awardedPoints !== 'number' || ans.awardedPoints < 0 || ans.awardedPoints > q.points) {
        return res.status(422).json({ error: `Points for question ${ans.questionId} must be between 0 and ${q.points}` });
      }
    }

    const txn = db.transaction(() => {
      for (const ans of answers) {
        const q = db.prepare('SELECT type FROM questions WHERE id = ?').get(ans.questionId) as any;
        if (q.type === 'mcq') continue;
        db.prepare('UPDATE answers SET awarded_points = ?, feedback = ? WHERE submission_id = ? AND question_id = ?')
          .run(ans.awardedPoints, ans.feedback || '', id, ans.questionId);
      }
      const total = (db.prepare('SELECT COALESCE(SUM(awarded_points), 0) as t FROM answers WHERE submission_id = ?').get(id) as any).t;
      db.prepare("UPDATE submissions SET status = 'MARKED', score = ? WHERE id = ?").run(total, id);
    });
    txn();

    const total = (db.prepare('SELECT COALESCE(SUM(awarded_points), 0) as t FROM answers WHERE submission_id = ?').get(id) as any).t;
    return res.json({ score: total, status: 'MARKED' });
  } catch (err: any) {
    console.error('Finalize error:', err);
    return res.status(500).json({ error: 'Failed to finalize marking' });
  }
});

// POST /api/submissions/:id/reset (teacher)
router.post('/:id/reset', requireTeacher, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const txn = db.transaction(() => {
      db.prepare('DELETE FROM answers WHERE submission_id = ?').run(id);
      db.prepare("UPDATE submissions SET status = 'STARTED', submitted_at = null, score = null WHERE id = ?").run(id);
      const questions = db.prepare('SELECT id FROM questions WHERE exam_id = ? ORDER BY position').all(sub.exam_id) as any[];
      const insertA = db.prepare('INSERT INTO answers (id, submission_id, question_id, answer_text) VALUES (?,?,?,?)');
      for (const q of questions) {
        insertA.run(uuidv4(), id, q.id, '');
      }
    });
    txn();
    return res.json({ reset: true });
  } catch (err: any) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Failed to reset submission' });
  }
});

// DELETE /api/submissions/:id/session (teacher)
router.delete('/:id/session', requireTeacher, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sub = db.prepare('SELECT student_id FROM submissions WHERE id = ?').get(id) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    db.prepare('UPDATE students SET session_token = null WHERE id = ?').run(sub.student_id);
    return res.json({ cleared: true });
  } catch (err: any) {
    console.error('Clear session error:', err);
    return res.status(500).json({ error: 'Failed to clear session' });
  }
});

// ─── STUDENT ROUTES ───────────────────────────────────────

// POST /api/submissions/start (student)
router.post('/start', requireStudent, (req: Request, res: Response) => {
  try {
    const { examId } = req.body;
    const studentId = req.studentId!;

    if (!examId) return res.status(422).json({ error: 'examId is required' });

    const examRow = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as any;
    if (!examRow) return res.status(404).json({ error: 'Exam not found' });

    const existing = db.prepare('SELECT * FROM submissions WHERE exam_id = ? AND student_id = ?').get(examId, studentId) as any;
    if (existing) {
      if (existing.status === 'SUBMITTED' || existing.status === 'MARKED') {
        return res.status(409).json({ error: 'Already submitted' });
      }
      const answers = db.prepare(`
        SELECT a.question_id as "questionId", a.answer_text as "answerText"
        FROM answers a JOIN questions q ON q.id = a.question_id
        WHERE a.submission_id = ? ORDER BY q.position
      `).all(existing.id) as any[];
      // Reset the timer on resume so stale started_at doesn't trigger auto-submit
      db.prepare("UPDATE submissions SET started_at = datetime('now') WHERE id = ?").run(existing.id);
      return res.json({ submissionId: existing.id, startedAt: new Date().toISOString(), answers });
    }

    const submissionId = uuidv4();
    const txn = db.transaction(() => {
      db.prepare("INSERT INTO submissions (id, exam_id, student_id, status) VALUES (?,?,?,'STARTED')").run(submissionId, examId, studentId);
      const questions = db.prepare('SELECT id FROM questions WHERE exam_id = ? ORDER BY position').all(examId) as any[];
      const insertA = db.prepare('INSERT INTO answers (id, submission_id, question_id, answer_text) VALUES (?,?,?,?)');
      for (const q of questions) {
        insertA.run(uuidv4(), submissionId, q.id, '');
      }
      db.prepare('UPDATE exams SET locked = 1 WHERE id = ?').run(examId);
    });
    txn();

    return res.status(201).json({ submissionId, startedAt: new Date().toISOString(), answers: [] });
  } catch (err: any) {
    console.error('Start exam error:', err);
    return res.status(500).json({ error: 'Failed to start exam' });
  }
});

// PUT /api/submissions/:id/answers (student)
router.put('/:id/answers', requireStudent, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    const studentId = req.studentId!;

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(id, studentId) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status !== 'STARTED') return res.status(409).json({ error: 'Submission is not in progress' });

    const upsert = db.prepare(`
      INSERT INTO answers (id, submission_id, question_id, answer_text) VALUES (?,?,?,?)
      ON CONFLICT(submission_id, question_id) DO UPDATE SET answer_text = excluded.answer_text
    `);

    const txn = db.transaction(() => {
      for (const ans of answers) {
        upsert.run(uuidv4(), id, ans.questionId, ans.answerText);
      }
    });
    txn();

    return res.json({ saved: true });
  } catch (err: any) {
    console.error('Save answers error:', err);
    return res.status(500).json({ error: 'Failed to save answers' });
  }
});

// POST /api/submissions/:id/submit (student)
router.post('/:id/submit', requireStudent, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const studentId = req.studentId!;

    const sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND student_id = ?').get(id, studentId) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status !== 'STARTED') return res.status(409).json({ error: 'Already submitted' });

    db.transaction(() => {
      db.prepare(`
        UPDATE answers SET awarded_points = CASE WHEN answers.answer_text = q.correct THEN q.points ELSE 0 END
        FROM questions q
        WHERE answers.question_id = q.id AND answers.submission_id = ? AND q.type = 'mcq'
      `).run(id);

      db.prepare("UPDATE submissions SET status = 'SUBMITTED', submitted_at = datetime('now') WHERE id = ?").run(id);
    })();

    const updated = db.prepare('SELECT submitted_at FROM submissions WHERE id = ?').get(id) as any;
    return res.json({ submittedAt: updated.submitted_at });
  } catch (err: any) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// GET /api/submissions/:id/result (student)
router.get('/:id/result', requireStudent, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const studentId = req.studentId!;

    const sub = db.prepare(`
      SELECT s.*, e.title as exam_title, e.published as exam_published
      FROM submissions s JOIN exams e ON e.id = s.exam_id
      WHERE s.id = ? AND s.student_id = ?
    `).get(id, studentId) as any;

    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    if (sub.status !== 'MARKED') {
      return res.json({ status: sub.status, published: false, submittedAt: sub.submitted_at || null });
    }

    if (!sub.exam_published) {
      return res.json({
        id: sub.id, examId: sub.exam_id, examTitle: sub.exam_title,
        status: 'MARKED', published: false,
        submittedAt: sub.submitted_at || null, score: sub.score,
      });
    }

    const answers = db.prepare(`
      SELECT a.question_id as "questionId", q.text as "questionText", q.type as "questionType",
             q.points as "maxPoints", q.correct, a.answer_text as "answerText",
             a.awarded_points as "awardedPoints", a.feedback
      FROM answers a JOIN questions q ON q.id = a.question_id
      WHERE a.submission_id = ? ORDER BY q.position
    `).all(id) as any[];

    const safeAnswers = answers.map((a) => {
      const safe: any = {
        questionId: a.questionId, questionText: a.questionText, questionType: a.questionType,
        maxPoints: a.maxPoints, answerText: a.answerText, awardedPoints: a.awardedPoints, feedback: a.feedback,
      };
      if (a.questionType === 'mcq') safe.correct = a.correct;
      return safe;
    });

    return res.json({
      id: sub.id, examId: sub.exam_id, examTitle: sub.exam_title,
      status: 'MARKED', published: true,
      startedAt: sub.started_at, submittedAt: sub.submitted_at || null,
      score: sub.score, answers: safeAnswers,
    });
  } catch (err: any) {
    console.error('Get result error:', err);
    return res.status(500).json({ error: 'Failed to fetch result' });
  }
});

export default router;