import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireTeacher } from '../middleware/auth';
import { getOne, getAll, run, transaction } from '../db';
import { Exam, Question } from '../types';

const router = Router();

function isTeacher(req: Request): boolean {
  return req.teacherAuthed === true;
}

function stripAnswersForStudent(questions: Question[]): Question[] {
  return questions.map((q) => {
    const { correct, ...rest } = q as any;
    return rest as Question;
  });
}

function rowToQuestion(row: any): Question {
  return {
    id: row.id,
    examId: row.exam_id,
    position: row.position,
    type: row.type,
    text: row.text,
    options: row.options ? (typeof row.options === 'string' ? JSON.parse(row.options) : row.options) : undefined,
    correct: row.correct,
    points: row.points,
  };
}

function rowToExam(row: any, questions: Question[]): Exam {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    duration: row.duration,
    startTime: row.start_time || null,
    published: !!row.published,
    locked: !!row.locked,
    exceptions: row.exceptions ? (typeof row.exceptions === 'string' ? JSON.parse(row.exceptions) : row.exceptions) : [],
    questions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchExamWithQuestions(examId: string): Promise<Exam | null> {
  const examRow = await getOne('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!examRow) return null;
  const qRows = await getAll('SELECT * FROM questions WHERE exam_id = $1 ORDER BY position', [examId]);
  const questions = qRows.map(rowToQuestion);
  return rowToExam(examRow, questions);
}

// GET /api/exams
router.get('/', async (req: Request, res: Response) => {
  try {
    const teacher = isTeacher(req);
    const examRows = await getAll('SELECT * FROM exams ORDER BY created_at DESC');
    const exams: Exam[] = [];
    for (const er of examRows) {
      const qRows = await getAll('SELECT * FROM questions WHERE exam_id = $1 ORDER BY position', [er.id]);
      const questions = qRows.map(rowToQuestion);
      let exam = rowToExam(er, questions);
      if (!teacher) exam.questions = stripAnswersForStudent(exam.questions);
      exams.push(exam);
    }
    return res.json(exams);
  } catch (err: any) {
    console.error('List exams error:', err);
    return res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// GET /api/exams/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const exam = await fetchExamWithQuestions(req.params.id as string);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!isTeacher(req)) exam.questions = stripAnswersForStudent(exam.questions);
    return res.json(exam);
  } catch (err: any) {
    console.error('Get exam error:', err);
    return res.status(500).json({ error: 'Failed to fetch exam' });
  }
});

// POST /api/exams
router.post('/', requireTeacher, async (req: Request, res: Response) => {
  try {
    const { title, description, duration, startTime, questions } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) return res.status(422).json({ error: 'Title is required' });
    if (!duration || typeof duration !== 'number' || duration <= 0) return res.status(422).json({ error: 'Duration must be a positive number' });
    if (!Array.isArray(questions)) return res.status(422).json({ error: 'Questions must be an array' });
    if (questions.length > 30) return res.status(422).json({ error: 'Maximum 30 questions allowed' });

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.type || !['mcq', 'short', 'long'].includes(q.type)) return res.status(422).json({ error: `Question ${i + 1}: invalid type` });
      if (typeof q.text !== 'string' || q.text.trim().length === 0) return res.status(422).json({ error: `Question ${i + 1}: text is required` });
      if (typeof q.points !== 'number' || q.points <= 0) return res.status(422).json({ error: `Question ${i + 1}: points must be positive` });
      if (q.type === 'mcq') {
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return res.status(422).json({ error: `Question ${i + 1}: MCQ must have 2-4 options` });
        if (!q.options.every((o: any) => typeof o === 'string' && o.trim().length > 0)) return res.status(422).json({ error: `Question ${i + 1}: all options must be non-empty strings` });
        if (!q.correct || !q.options.includes(q.correct)) return res.status(422).json({ error: `Question ${i + 1}: correct answer must match an option` });
      }
    }

    const examId = uuidv4();
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO exams (id, title, description, duration, start_time) VALUES ($1,$2,$3,$4,$5)',
        [examId, title.trim(), description || '', duration, startTime || null]
      );
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await client.query(
          'INSERT INTO questions (id, exam_id, position, type, text, options, correct, points) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [uuidv4(), examId, i + 1, q.type, q.text.trim(), q.type === 'mcq' ? JSON.stringify(q.options) : null, q.type === 'mcq' ? q.correct : null, q.points]
        );
      }
    });

    const exam = await fetchExamWithQuestions(examId);
    return res.status(201).json(exam);
  } catch (err: any) {
    console.error('Create exam error:', err);
    return res.status(500).json({ error: 'Failed to create exam' });
  }
});

// PUT /api/exams/:id
router.put('/:id', requireTeacher, async (req: Request, res: Response) => {
  try {
    const examId = req.params.id as string;
    const existing = await getOne('SELECT * FROM exams WHERE id = $1', [examId]);
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    if (existing.locked) return res.status(409).json({ error: 'Cannot edit a locked exam' });

    // Prevent editing if submissions exist (editing deletes+recreates questions, cascading to answers)
    const subCountRow = await getOne('SELECT COUNT(*) as c FROM submissions WHERE exam_id = $1', [examId]);
    if (parseInt(subCountRow?.c || '0') > 0) return res.status(409).json({ error: 'Cannot edit an exam with existing submissions' });

    const { title, description, duration, startTime, questions } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) return res.status(422).json({ error: 'Title is required' });
    if (!duration || typeof duration !== 'number' || duration <= 0) return res.status(422).json({ error: 'Duration must be a positive number' });
    if (!Array.isArray(questions)) return res.status(422).json({ error: 'Questions must be an array' });
    if (questions.length > 30) return res.status(422).json({ error: 'Maximum 30 questions allowed' });

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.type || !['mcq', 'short', 'long'].includes(q.type)) return res.status(422).json({ error: `Question ${i + 1}: invalid type` });
      if (typeof q.text !== 'string' || q.text.trim().length === 0) return res.status(422).json({ error: `Question ${i + 1}: text is required` });
      if (typeof q.points !== 'number' || q.points <= 0) return res.status(422).json({ error: `Question ${i + 1}: points must be positive` });
      if (q.type === 'mcq') {
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return res.status(422).json({ error: `Question ${i + 1}: MCQ must have 2-4 options` });
        if (!q.options.every((o: any) => typeof o === 'string' && o.trim().length > 0)) return res.status(422).json({ error: `Question ${i + 1}: all options must be non-empty strings` });
        if (!q.correct || !q.options.includes(q.correct)) return res.status(422).json({ error: `Question ${i + 1}: correct answer must match an option` });
      }
    }

    await transaction(async (client) => {
      await client.query(
        'UPDATE exams SET title=$1, description=$2, duration=$3, start_time=$4, updated_at=NOW() WHERE id=$5',
        [title.trim(), description || '', duration, startTime || null, examId]
      );
      await client.query('DELETE FROM questions WHERE exam_id = $1', [examId]);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await client.query(
          'INSERT INTO questions (id, exam_id, position, type, text, options, correct, points) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [uuidv4(), examId, i + 1, q.type, q.text.trim(), q.type === 'mcq' ? JSON.stringify(q.options) : null, q.type === 'mcq' ? q.correct : null, q.points]
        );
      }
    });

    const exam = await fetchExamWithQuestions(examId);
    return res.json(exam);
  } catch (err: any) {
    console.error('Update exam error:', err);
    return res.status(500).json({ error: 'Failed to update exam' });
  }
});

// DELETE /api/exams/:id
router.delete('/:id', requireTeacher, async (req: Request, res: Response) => {
  try {
    const examId = req.params.id;
    const countRow = await getOne('SELECT COUNT(*) as c FROM submissions WHERE exam_id = $1', [examId]);
    if (parseInt(countRow?.c || '0') > 0) return res.status(409).json({ error: 'Cannot delete exam with existing submissions' });
    const result = await run('DELETE FROM exams WHERE id = $1', [examId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Exam not found' });
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error('Delete exam error:', err);
    return res.status(500).json({ error: 'Failed to delete exam' });
  }
});

// PATCH /api/exams/:id/publish
router.patch('/:id/publish', requireTeacher, async (req: Request, res: Response) => {
  try {
    const examId = req.params.id;
    const row = await getOne('SELECT published FROM exams WHERE id = $1', [examId]);
    if (!row) return res.status(404).json({ error: 'Exam not found' });

    // Prevent unpublishing if students have already seen marked results
    if (row.published) {
      const markedSubs = await getOne("SELECT COUNT(*) as c FROM submissions WHERE exam_id = $1 AND status = 'MARKED'", [examId]);
      if (parseInt(markedSubs?.c || '0') > 0) {
        return res.status(409).json({ error: 'Cannot unpublish an exam with marked results' });
      }
    }

    const newVal = row.published ? 0 : 1;
    await run('UPDATE exams SET published = $1 WHERE id = $2', [newVal, examId]);
    return res.json({ published: !!newVal });
  } catch (err: any) {
    console.error('Publish toggle error:', err);
    return res.status(500).json({ error: 'Failed to toggle publish' });
  }
});

export default router;