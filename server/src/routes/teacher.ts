import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireTeacher } from '../middleware/auth';
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

router.post('/login', loginRateLimit, (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(422).json({ error: 'Password is required' });
    if (password !== process.env.TEACHER_PASSWORD) return res.status(401).json({ error: 'Incorrect password' });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign({ role: 'teacher' }, secret, { expiresIn: '8h' });
    return res.json({ token });
  } catch (err: any) {
    console.error('Teacher login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/stats', requireTeacher, (req: Request, res: Response) => {
  try {
    const totalExams = (db.prepare('SELECT COUNT(*) as c FROM exams').get() as any).c;
    const pending = (db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'SUBMITTED'").get() as any).c;
    const marked = (db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'MARKED'").get() as any).c;
    const inProgress = (db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'STARTED'").get() as any).c;

    return res.json({
      totalExams, pending, marked, inProgress: inProgress,
    });
  } catch (err: any) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;