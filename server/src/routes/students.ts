import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireStudent } from '../middleware/auth';
import db from '../db';

const router = Router();

// Simple in-memory rate limiter replacement
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && now < record.resetAt && record.count >= 20) {
    return res.status(429).json({ error: 'Too many login attempts, please try again later' });
  }

  if (!record || now >= record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
  } else {
    record.count++;
  }

  next();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (now >= record.resetAt) loginAttempts.delete(ip);
  }
}, 300000).unref();

// POST /api/students/login
router.post('/login', loginRateLimit, (req: Request, res: Response) => {
  try {
    const { name, surname, studentId, cell } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0)
      return res.status(422).json({ error: 'Name is required' });
    if (!surname || typeof surname !== 'string' || surname.trim().length === 0)
      return res.status(422).json({ error: 'Surname is required' });
    if (!studentId || typeof studentId !== 'string' || studentId.trim().length === 0)
      return res.status(422).json({ error: 'Student ID is required' });

    const sessionToken = uuidv4();

    const existing = db.prepare('SELECT id FROM students WHERE student_id = ?').get(studentId.trim()) as any;

    let student: any;
    if (existing) {
      db.prepare('UPDATE students SET name=?, surname=?, cell=?, session_token=? WHERE id=?')
        .run(name.trim(), surname.trim(), (cell || '').trim(), sessionToken, existing.id);
      student = db.prepare('SELECT * FROM students WHERE id = ?').get(existing.id);
    } else {
      const id = uuidv4();
      db.prepare('INSERT INTO students (id, student_id, name, surname, cell, session_token) VALUES (?,?,?,?,?,?)')
        .run(id, studentId.trim(), name.trim(), surname.trim(), (cell || '').trim(), sessionToken);
      student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    }

    return res.json({
      token: sessionToken,
      student: {
        id: student.id,
        studentId: student.student_id,
        name: student.name,
        surname: student.surname,
        cell: student.cell || '',
      },
    });
  } catch (err: any) {
    console.error('Student login error:', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/students/me
router.get('/me', requireStudent, (req: Request, res: Response) => {
  try {
    const s = db.prepare('SELECT id, student_id, name, surname, cell FROM students WHERE id = ?').get(req.studentId) as any;
    if (!s) return res.status(404).json({ error: 'Student not found' });

    return res.json({
      id: s.id,
      studentId: s.student_id,
      name: s.name,
      surname: s.surname,
      cell: s.cell || '',
    });
  } catch (err: any) {
    console.error('Get student error:', err);
    return res.status(500).json({ error: 'Failed to fetch student' });
  }
});

export default router;