import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getOne } from '../db';

declare global {
  namespace Express {
    interface Request {
      teacherAuthed?: boolean;
      studentId?: string;
    }
  }
}

export function requireTeacher(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(auth.slice(7), process.env.JWT_SECRET!);
    req.teacherAuthed = true;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalTeacher(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      jwt.verify(auth.slice(7), process.env.JWT_SECRET!);
      req.teacherAuthed = true;
    } catch {
      // ignore — not a valid teacher token, continue without teacher access
    }
  }
  next();
}

export async function requireStudent(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-student-token'] as string;
  if (!token) return res.status(401).json({ error: 'No student token' });
  try {
    const row = await getOne('SELECT id FROM students WHERE session_token = $1', [token]);
    if (!row) return res.status(401).json({ error: 'Invalid student token' });
    req.studentId = row.id;
    next();
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
  }
}