import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireTeacher, requireStudent, optionalTeacher } from '../middleware/auth';
import { getOne, getAll, run, transaction } from '../db';

const router = Router();

// Helper: try to get student ID from token if present
async function tryGetStudentId(req: Request): Promise<string | null> {
  const token = req.headers['x-student-token'] as string;
  if (!token) return null;
  const row = await getOne('SELECT id FROM students WHERE session_token = $1', [token]);
  return row?.id || null;
}

// ─── TEACHER ROUTES ───────────────────────────────────────

// GET /api/submissions — teacher: all, student: their own
router.get('/', optionalTeacher, async (req: Request, res: Response) => {
  try {
    const studentId = await tryGetStudentId(req);
    const isTeacher = req.teacherAuthed === true;

    if (!isTeacher && !studentId) return res.status(401).json({ error: 'Unauthorized' });

    const { status, examId, search, batchId } = req.query;
    let sql = `
      SELECT s.*, st.student_id as st_id, st.name as st_name, st.surname as st_surname, st.cell as st_cell,
             e.title as exam_title,
             b.name as batch_name, b.id as b_id
      FROM submissions s
      JOIN students st ON st.id = s.student_id
      JOIN exams e ON e.id = s.exam_id
      LEFT JOIN batches b ON b.id = s.batch_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (!isTeacher) {
      sql += ` AND s.student_id = $${paramIdx++}`;
      params.push(studentId);
    }

    if (status && ['STARTED', 'SUBMITTED', 'MARKED'].includes(status as string)) {
      sql += ` AND s.status = $${paramIdx++}`;
      params.push(status);
    }
    if (examId && typeof examId === 'string') {
      sql += ` AND s.exam_id = $${paramIdx++}`;
      params.push(examId);
    }
    if (batchId && typeof batchId === 'string' && isTeacher) {
      sql += ` AND s.batch_id = $${paramIdx++}`;
      params.push(batchId);
    }
    if (search && typeof search === 'string' && isTeacher) {
      const q = `%${search}%`;
      sql += ` AND (st.name ILIKE $${paramIdx} OR st.surname ILIKE $${paramIdx+1} OR st.student_id ILIKE $${paramIdx+2})`;
      params.push(q, q, q);
    }
    sql += ' ORDER BY s.created_at DESC';

    const rows = await getAll(sql, params);
    const submissions = rows.map((row: any) => ({
      id: row.id,
      examId: row.exam_id,
      examTitle: row.exam_title,
      student: { id: row.student_id, studentId: row.st_id, name: row.st_name, surname: row.st_surname, cell: row.st_cell || '' },
      batch: row.b_id ? { id: row.b_id, name: row.batch_name } : null,
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

// GET /api/submissions/export (teacher — export all submissions as JSON)
router.get('/export', requireTeacher, async (_req: Request, res: Response) => {
  try {
    const rows = await getAll(`
      SELECT
        s.id as submission_id,
        s.status,
        s.started_at,
        s.submitted_at,
        s.score,
        s.created_at,
        st.student_id as student_number,
        st.name as student_name,
        st.surname as student_surname,
        st.cell as student_cell,
        e.id as exam_id,
        e.title as exam_title,
        e.duration as exam_duration
      FROM submissions s
      JOIN students st ON st.id = s.student_id
      JOIN exams e ON e.id = s.exam_id
      ORDER BY s.created_at DESC
    `);

    // Fetch answers for each submission
    const result = await Promise.all(rows.map(async (sub: any) => {
      const answers = await getAll(`
        SELECT
          a.question_id,
          q.text as question_text,
          q.type as question_type,
          q.points as max_points,
          q.correct as correct_answer,
          a.answer_text,
          a.awarded_points,
          a.feedback
        FROM answers a
        JOIN questions q ON q.id = a.question_id
        WHERE a.submission_id = $1
        ORDER BY q.position
      `, [sub.submission_id]);

      return {
        submissionId: sub.submission_id,
        status: sub.status,
        startedAt: sub.started_at,
        submittedAt: sub.submitted_at,
        score: sub.score,
        createdAt: sub.created_at,
        student: {
          studentNumber: sub.student_number,
          name: sub.student_name,
          surname: sub.student_surname,
          cell: sub.student_cell,
        },
        exam: {
          id: sub.exam_id,
          title: sub.exam_title,
          duration: sub.exam_duration,
        },
        answers: answers.map((a: any) => ({
          questionId: a.question_id,
          questionText: a.question_text,
          questionType: a.question_type,
          maxPoints: a.max_points,
          correctAnswer: a.correct_answer,
          answerText: a.answer_text,
          awardedPoints: a.awarded_points,
          feedback: a.feedback,
        })),
      };
    }));

    return res.json({
      exportedAt: new Date().toISOString(),
      totalSubmissions: result.length,
      submissions: result,
    });
  } catch (err: any) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Failed to export submissions' });
  }
});

// GET /api/submissions/:id (teacher detail)
router.get('/:id', requireTeacher, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const sub = await getOne(`
      SELECT s.*, st.student_id as st_id, st.name as st_name, st.surname as st_surname, st.cell as st_cell,
             e.title as exam_title, e.published as exam_published
      FROM submissions s
      JOIN students st ON st.id = s.student_id
      JOIN exams e ON e.id = s.exam_id
      WHERE s.id = $1
    `, [id]);

    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const answers = await getAll(`
      SELECT a.id, a.question_id as "questionId", q.text as "questionText", q.type as "questionType",
             q.points as "maxPoints", a.answer_text as "answerText", a.awarded_points as "awardedPoints",
             a.feedback, q.correct
      FROM answers a
      JOIN questions q ON q.id = a.question_id
      WHERE a.submission_id = $1
      ORDER BY q.position
    `, [id]);

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
router.post('/:id/finalize', requireTeacher, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { answers } = req.body;

    const sub = await getOne('SELECT * FROM submissions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status === 'MARKED') return res.status(409).json({ error: 'Submission already marked' });

    for (const ans of answers) {
      const q = await getOne('SELECT points, type FROM questions WHERE id = $1', [ans.questionId]);
      if (!q) return res.status(422).json({ error: `Question ${ans.questionId} not found` });
      if (q.type === 'mcq') continue;
      if (typeof ans.awardedPoints !== 'number' || ans.awardedPoints < 0 || ans.awardedPoints > q.points) {
        return res.status(422).json({ error: `Points for question ${ans.questionId} must be between 0 and ${q.points}` });
      }
    }

    await transaction(async (client) => {
      for (const ans of answers) {
        const q = await client.query('SELECT type FROM questions WHERE id = $1', [ans.questionId]);
        if (q.rows[0].type === 'mcq') continue;
        await client.query(
          'UPDATE answers SET awarded_points = $1, feedback = $2 WHERE submission_id = $3 AND question_id = $4',
          [ans.awardedPoints, ans.feedback || '', id, ans.questionId]
        );
      }
      await client.query(
        "UPDATE submissions SET status = 'MARKED', score = (SELECT COALESCE(SUM(awarded_points), 0) FROM answers WHERE submission_id = $1) WHERE id = $1",
        [id]
      );
    });

    const total = await getOne('SELECT COALESCE(SUM(awarded_points), 0) as t FROM answers WHERE submission_id = $1', [id]);
    return res.json({ score: parseInt(total?.t || '0'), status: 'MARKED' });
  } catch (err: any) {
    console.error('Finalize error:', err);
    return res.status(500).json({ error: 'Failed to finalize marking' });
  }
});

// POST /api/submissions/:id/reset (teacher)
router.post('/:id/reset', requireTeacher, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const sub = await getOne('SELECT * FROM submissions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    await transaction(async (client) => {
      await client.query('DELETE FROM answers WHERE submission_id = $1', [id]);
      await client.query("UPDATE submissions SET status = 'STARTED', started_at = NOW(), submitted_at = null, score = null WHERE id = $1", [id]);
      
      // Only unlock the exam if no other students have submissions
      const otherSubs = await client.query('SELECT COUNT(*) as c FROM submissions WHERE exam_id = $1 AND id != $2', [sub.exam_id, id]);
      const otherCount = parseInt(otherSubs.rows[0]?.c || '0');
      if (otherCount === 0) {
        await client.query('UPDATE exams SET locked = 0 WHERE id = $1', [sub.exam_id]);
      }
      
      // Clear the student's session so they must re-authenticate
      await client.query('UPDATE students SET session_token = null WHERE id = $1', [sub.student_id]);
      // Re-create empty answer rows
      const questions = await client.query('SELECT id FROM questions WHERE exam_id = $1 ORDER BY position', [sub.exam_id]);
      for (const q of questions.rows) {
        await client.query(
          'INSERT INTO answers (id, submission_id, question_id, answer_text) VALUES ($1,$2,$3,$4)',
          [uuidv4(), id, q.id, '']
        );
      }
    });
    return res.json({ reset: true });
  } catch (err: any) {
    console.error('Reset error details:', err);
    return res.status(500).json({ error: 'Failed to reset submission: ' + (err.message || 'Unknown error') });
  }
});

// DELETE /api/submissions/:id (teacher — fully delete a submission)
router.delete('/:id', requireTeacher, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const sub = await getOne('SELECT id FROM submissions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    await run('DELETE FROM submissions WHERE id = $1', [id]);
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error('Delete submission error:', err);
    return res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// PATCH /api/submissions/:id/batch (teacher — reassign to a different batch)
router.patch('/:id/batch', requireTeacher, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { batchId } = req.body;

    const sub = await getOne('SELECT id FROM submissions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    if (batchId !== null && batchId !== undefined) {
      const batchExists = await getOne('SELECT id FROM batches WHERE id = $1', [batchId]);
      if (!batchExists) return res.status(422).json({ error: 'Batch not found' });
    }

    await run('UPDATE submissions SET batch_id = $1 WHERE id = $2', [batchId || null, id]);
    return res.json({ updated: true });
  } catch (err: any) {
    console.error('Assign batch error:', err);
    return res.status(500).json({ error: 'Failed to assign batch' });
  }
});

// DELETE /api/submissions/:id/session (teacher)
router.delete('/:id/session', requireTeacher, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const sub = await getOne('SELECT student_id FROM submissions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    await run('UPDATE students SET session_token = null WHERE id = $1', [sub.student_id]);
    return res.json({ cleared: true });
  } catch (err: any) {
    console.error('Clear session error:', err);
    return res.status(500).json({ error: 'Failed to clear session' });
  }
});

// ─── STUDENT ROUTES ───────────────────────────────────────

// POST /api/submissions/start (student)
router.post('/start', requireStudent, async (req: Request, res: Response) => {
  try {
    const { examId } = req.body;
    const studentId = req.studentId!;

    if (!examId) return res.status(422).json({ error: 'examId is required' });

    const examRow = await getOne('SELECT * FROM exams WHERE id = $1', [examId]);
    if (!examRow) return res.status(404).json({ error: 'Exam not found' });

    const existing = await getOne('SELECT * FROM submissions WHERE exam_id = $1 AND student_id = $2', [examId, studentId]);
    if (existing) {
      if (existing.status === 'SUBMITTED' || existing.status === 'MARKED') {
        return res.status(409).json({ error: 'Already submitted' });
      }
      const answers = await getAll(`
        SELECT a.question_id as "questionId", a.answer_text as "answerText"
        FROM answers a JOIN questions q ON q.id = a.question_id
        WHERE a.submission_id = $1 ORDER BY q.position
      `, [existing.id]);
      // Return original startedAt — do NOT reset the timer on reload
      return res.json({ submissionId: existing.id, startedAt: existing.started_at, answers });
    }

    // Get the latest batch to auto-assign
    const latestBatch = await getOne('SELECT id FROM batches ORDER BY created_at DESC LIMIT 1');

    const submissionId = uuidv4();
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO submissions (id, exam_id, student_id, batch_id, status) VALUES ($1,$2,$3,$4,$5)',
        [submissionId, examId, studentId, latestBatch?.id || null, 'STARTED']
      );
      const questions = await client.query('SELECT id FROM questions WHERE exam_id = $1 ORDER BY position', [examId]);
      for (const q of questions.rows) {
        await client.query(
          'INSERT INTO answers (id, submission_id, question_id, answer_text) VALUES ($1,$2,$3,$4)',
          [uuidv4(), submissionId, q.id, '']
        );
      }
      await client.query('UPDATE exams SET locked = 1 WHERE id = $1', [examId]);
    });

    return res.status(201).json({ submissionId, startedAt: new Date().toISOString(), answers: [] });
  } catch (err: any) {
    console.error('Start exam error:', err);
    return res.status(500).json({ error: 'Failed to start exam' });
  }
});

// PUT /api/submissions/:id/answers (student)
router.put('/:id/answers', requireStudent, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { answers } = req.body;
    const studentId = req.studentId!;

    const sub = await getOne('SELECT * FROM submissions WHERE id = $1 AND student_id = $2', [id, studentId]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status !== 'STARTED') return res.status(409).json({ error: 'Submission is not in progress' });

    await transaction(async (client) => {
      for (const ans of answers) {
        await client.query(`
          INSERT INTO answers (id, submission_id, question_id, answer_text) VALUES ($1,$2,$3,$4)
          ON CONFLICT(submission_id, question_id) DO UPDATE SET answer_text = EXCLUDED.answer_text
        `, [uuidv4(), id, ans.questionId, ans.answerText]);
      }
    });

    return res.json({ saved: true });
  } catch (err: any) {
    console.error('Save answers error:', err);
    return res.status(500).json({ error: 'Failed to save answers' });
  }
});

// POST /api/submissions/:id/submit (student)
router.post('/:id/submit', requireStudent, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const studentId = req.studentId!;

    const sub = await getOne('SELECT * FROM submissions WHERE id = $1 AND student_id = $2', [id, studentId]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status !== 'STARTED') return res.status(409).json({ error: 'Already submitted' });

    await transaction(async (client) => {
      // Auto-grade MCQ answers using subquery (compatible with both PG and SQLite)
      await client.query(`
        UPDATE answers SET awarded_points = (
          SELECT q.points FROM questions q
          WHERE q.id = answers.question_id
          AND q.type = 'mcq'
          AND q.correct = answers.answer_text
        )
        WHERE submission_id = $1
      `, [id]);

      await client.query("UPDATE submissions SET status = 'SUBMITTED', submitted_at = NOW() WHERE id = $1", [id]);
    });

    const updated = await getOne('SELECT submitted_at FROM submissions WHERE id = $1', [id]);
    return res.json({ submittedAt: updated.submitted_at });
  } catch (err: any) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// GET /api/submissions/:id/result (student)
router.get('/:id/result', requireStudent, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const studentId = req.studentId!;

    const sub = await getOne(`
      SELECT s.*, e.title as exam_title, e.published as exam_published
      FROM submissions s JOIN exams e ON e.id = s.exam_id
      WHERE s.id = $1 AND s.student_id = $2
    `, [id, studentId]);

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

    const answers = await getAll(`
      SELECT a.question_id as "questionId", q.text as "questionText", q.type as "questionType",
             q.points as "maxPoints", q.correct, a.answer_text as "answerText",
             a.awarded_points as "awardedPoints", a.feedback
      FROM answers a JOIN questions q ON q.id = a.question_id
      WHERE a.submission_id = $1 ORDER BY q.position
    `, [id]);

    const safeAnswers = answers.map((a: any) => {
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