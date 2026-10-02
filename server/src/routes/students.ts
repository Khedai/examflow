import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { requireStudent } from '../middleware/auth';
import { getOne, query } from '../db';

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
router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  try {
    const { name, surname, studentId, cell } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0)
      return res.status(422).json({ error: 'Name is required' });
    if (!surname || typeof surname !== 'string' || surname.trim().length === 0)
      return res.status(422).json({ error: 'Surname is required' });

    // ID/passport is optional. It may be a numeric SA ID or an alphanumeric passport number,
    // so we accept any string and normalise it (trim + uppercase) before storing.
    const cleanName = name.trim();
    const cleanSurname = surname.trim();
    const cleanCell = typeof cell === 'string' ? cell.trim() : '';
    const rawId = typeof studentId === 'string' ? studentId.trim() : '';
    const idNumber = rawId.length > 0 ? rawId.toUpperCase() : null;

    const sessionToken = uuidv4();

    // Locate a returning student. Matching by ID/passport is preferred when supplied;
    // otherwise (or as a fallback) we reconnect them by name + surname.
    let existing: any = null;
    if (idNumber) {
      existing = await getOne(
        'SELECT id FROM students WHERE LOWER(student_id) = LOWER($1)',
        [idNumber]
      );
      if (!existing) {
        // The student may have first signed in without an ID — adopt that record.
        existing = await getOne(
          `SELECT id FROM students
           WHERE student_id IS NULL
             AND LOWER(name) = LOWER($1) AND LOWER(surname) = LOWER($2)
           ORDER BY created_at DESC LIMIT 1`,
          [cleanName, cleanSurname]
        );
      }
    } else {
      existing = await getOne(
        `SELECT id FROM students
         WHERE LOWER(name) = LOWER($1) AND LOWER(surname) = LOWER($2)
         ORDER BY created_at DESC LIMIT 1`,
        [cleanName, cleanSurname]
      );
    }

    let student: any;
    if (existing) {
      await query(
        `UPDATE students
           SET name=$1, surname=$2, cell=$3, session_token=$4, student_id=COALESCE($5, student_id)
         WHERE id=$6`,
        [cleanName, cleanSurname, cleanCell, sessionToken, idNumber, existing.id]
      );
      student = await getOne('SELECT * FROM students WHERE id = $1', [existing.id]);
    } else {
      const id = uuidv4();
      await query(
        'INSERT INTO students (id, student_id, name, surname, cell, session_token) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, idNumber, cleanName, cleanSurname, cleanCell, sessionToken]
      );
      student = await getOne('SELECT * FROM students WHERE id = $1', [id]);
    }

    // A long-lived identity token for this exact student row. If the session token is later
    // invalidated (a teacher Reset clears it so the student must re-authenticate, or it simply
    // expired), the client presents this to obtain a fresh session for the SAME record — so a
    // returning student is never re-matched by name (which could pick a duplicate row and hand
    // them a different, empty submission).
    const authToken = jwt.sign({ sid: student.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });

    return res.json({
      token: sessionToken,
      authToken,
      student: {
        id: student.id,
        studentId: student.student_id || '',
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

// POST /api/students/refresh
// Re-issues a session token from the long-lived auth token. Used when the session was
// invalidated (teacher Reset) or expired. Identity is resolved by the student's own id, so the
// student is always reconnected to their existing submission and saved answers.
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const authToken = (req.headers['x-student-authtoken'] as string) || req.body?.authToken;
    if (!authToken) return res.status(401).json({ error: 'No auth token' });

    let payload: any;
    try {
      payload = jwt.verify(authToken, process.env.JWT_SECRET!);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    const sid = payload?.sid;
    if (!sid) return res.status(401).json({ error: 'Invalid auth token' });

    const student = await getOne('SELECT * FROM students WHERE id = $1', [sid]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const sessionToken = uuidv4();
    await query('UPDATE students SET session_token = $1 WHERE id = $2', [sessionToken, sid]);

    return res.json({
      token: sessionToken,
      authToken,
      student: {
        id: student.id,
        studentId: student.student_id || '',
        name: student.name,
        surname: student.surname,
        cell: student.cell || '',
      },
    });
  } catch (err: any) {
    console.error('Student refresh error:', err);
    return res.status(500).json({ error: 'Failed to refresh session' });
  }
});

// GET /api/students/me
router.get('/me', requireStudent, async (req: Request, res: Response) => {
  try {
    const s = await getOne('SELECT id, student_id, name, surname, cell FROM students WHERE id = $1', [req.studentId]);
    if (!s) return res.status(404).json({ error: 'Student not found' });

    return res.json({
      id: s.id,
      studentId: s.student_id || '',
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