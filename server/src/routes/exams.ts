import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireTeacher } from '../middleware/auth';
import db from '../db';
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
    options: row.options ? JSON.parse(row.options) : undefined,
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
    exceptions: row.exceptions ? JSON.parse(row.exceptions) : [],
    questions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fetchExamWithQuestions(examId: string): Exam | null {
  const examRow = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as any;
  if (!examRow) return null;
  const qRows = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY position').all(examId) as any[];
  const questions = qRows.map(rowToQuestion);
  return rowToExam(examRow, questions);
}

// GET /api/exams
router.get('/', (req: Request, res: Response) => {
  try {
    const teacher = isTeacher(req);
    const examRows = db.prepare('SELECT * FROM exams ORDER BY created_at DESC').all() as any[];
    const exams = examRows.map((er: any) => {
      const qRows = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY position').all(er.id) as any[];
      const questions = qRows.map(rowToQuestion);
      let exam = rowToExam(er, questions);
      if (!teacher) exam.questions = stripAnswersForStudent(exam.questions);
      return exam;
    });
    return res.json(exams);
  } catch (err: any) {
    console.error('List exams error:', err);
    return res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// GET /api/exams/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const exam = fetchExamWithQuestions(req.params.id as string);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!isTeacher(req)) exam.questions = stripAnswersForStudent(exam.questions);
    return res.json(exam);
  } catch (err: any) {
    console.error('Get exam error:', err);
    return res.status(500).json({ error: 'Failed to fetch exam' });
  }
});

// POST /api/exams
router.post('/', requireTeacher, (req: Request, res: Response) => {
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
  const insertExam = db.prepare('INSERT INTO exams (id, title, description, duration, start_time) VALUES (?,?,?,?,?)');
  const insertQ = db.prepare('INSERT INTO questions (id, exam_id, position, type, text, options, correct, points) VALUES (?,?,?,?,?,?,?,?)');

  const txn = db.transaction(() => {
    insertExam.run(examId, title.trim(), description || '', duration, startTime || null);
    questions.forEach((q: any, i: number) => {
      insertQ.run(uuidv4(), examId, i + 1, q.type, q.text.trim(), q.type === 'mcq' ? JSON.stringify(q.options) : null, q.type === 'mcq' ? q.correct : null, q.points);
    });
  });
  txn();

  const exam = fetchExamWithQuestions(examId);
  return res.status(201).json(exam);
});

// PUT /api/exams/:id
router.put('/:id', requireTeacher, (req: Request, res: Response) => {
    const examId = req.params.id as string;
  const existing = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as any;
  if (!existing) return res.status(404).json({ error: 'Exam not found' });
  if (existing.locked) return res.status(409).json({ error: 'Cannot edit a locked exam' });

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

  const txn = db.transaction(() => {
    db.prepare('UPDATE exams SET title=?, description=?, duration=?, start_time=? WHERE id=?').run(title.trim(), description || '', duration, startTime || null, examId);
    db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);
    const insertQ = db.prepare('INSERT INTO questions (id, exam_id, position, type, text, options, correct, points) VALUES (?,?,?,?,?,?,?,?)');
    questions.forEach((q: any, i: number) => {
      insertQ.run(uuidv4(), examId, i + 1, q.type, q.text.trim(), q.type === 'mcq' ? JSON.stringify(q.options) : null, q.type === 'mcq' ? q.correct : null, q.points);
    });
  });
  txn();

  const exam = fetchExamWithQuestions(examId);
  return res.json(exam);
});

// DELETE /api/exams/:id
router.delete('/:id', requireTeacher, (req: Request, res: Response) => {
  try {
    const examId = req.params.id;
    const count = (db.prepare('SELECT COUNT(*) as c FROM submissions WHERE exam_id = ?').get(examId) as any).c;
    if (count > 0) return res.status(409).json({ error: 'Cannot delete exam with existing submissions' });
    const result = db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
    if (result.changes === 0) return res.status(404).json({ error: 'Exam not found' });
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error('Delete exam error:', err);
    return res.status(500).json({ error: 'Failed to delete exam' });
  }
});

// PATCH /api/exams/:id/publish
router.patch('/:id/publish', requireTeacher, (req: Request, res: Response) => {
  try {
    const examId = req.params.id;
    const row = db.prepare('SELECT published FROM exams WHERE id = ?').get(examId) as any;
    if (!row) return res.status(404).json({ error: 'Exam not found' });
    const newVal = row.published ? 0 : 1;
    db.prepare('UPDATE exams SET published = ? WHERE id = ?').run(newVal, examId);
    return res.json({ published: !!newVal });
  } catch (err: any) {
    console.error('Publish toggle error:', err);
    return res.status(500).json({ error: 'Failed to toggle publish' });
  }
});

export default router;