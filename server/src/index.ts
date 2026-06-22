import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load .env in development only — Render sets env vars directly
// Try multiple paths since tsx/ts-node may resolve __dirname differently
const envPaths = [
  path.join(__dirname, '..', '..', '.env'),   // from dist/ or src/: examflow/.env
  path.join(__dirname, '..', '.env'),           // from server/src/: examflow/server/.env (fallback)
  path.resolve(process.cwd(), '..', '.env'),    // relative to cwd
  path.resolve(process.cwd(), '.env'),          // directly in cwd
];
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath, override: false });
  if (!result.error) {
    console.log(`[dotenv] Loaded .env from: ${envPath}`);
    break;
  }
}
// Also try default search (walks up from cwd) as ultimate fallback
if (!process.env.DATABASE_URL) {
  dotenv.config({ override: false });
}
console.log('[dotenv] DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('[dotenv] JWT_SECRET set:', !!process.env.JWT_SECRET);
console.log('[dotenv] TEACHER_PASSWORD set:', !!process.env.TEACHER_PASSWORD);

import teacherRouter from './routes/teacher';
import examsRouter from './routes/exams';
import submissionsRouter from './routes/submissions';
import studentsRouter from './routes/students';
import { errorHandler } from './middleware/errorHandler';
import { initSchema, shutdown, cleanupStaleSessions } from './db';
import { seed } from './seed';

async function start() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json());

  // Initialize DB schema
  await initSchema();

  app.use('/api/teacher', teacherRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/students', studentsRouter);

  // Seed sample data
  await seed();

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use(errorHandler);

  const PORT = Number(process.env.PORT) || 4000;
  const server = app.listen(PORT, () => console.log(`ExamFlow server running on :${PORT}`));

  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log('[server] Received shutdown signal');
    server.close();
    await shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // Cleanup stale sessions every hour
  setInterval(() => { cleanupStaleSessions(); }, 60 * 60 * 1000).unref();
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default start;