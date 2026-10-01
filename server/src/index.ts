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
import batchesRouter from './routes/batches';
import studentsRouter from './routes/students';
import { errorHandler } from './middleware/errorHandler';
import { initSchema, shutdown, cleanupStaleSessions } from './db';
import { seed } from './seed';

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://examflow.vercel.app',
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];

async function start() {
  const app = express();
  app.use(cors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests without an Origin header (curl, same-origin, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }));
  app.use(express.json());

  // Initialize DB schema
  await initSchema();

  app.use('/api/teacher', teacherRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/batches', batchesRouter);
  app.use('/api/students', studentsRouter);

  // Seed sample data
  await seed();

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Root probe: some platforms (Render) health-check "/" by default. Answer it with a
  // cheap 200 so an instance is never flagged unhealthy / restarted just because "/" 404s.
  app.get('/', (_req, res) => res.json({ ok: true, service: 'examflow-api' }));

  app.use(errorHandler);

  const PORT = Number(process.env.PORT) || 4000;
  const server = app.listen(PORT, () => console.log(`ExamFlow server running on :${PORT}`));

  // Graceful shutdown: stop accepting new connections and let in-flight requests finish
  // (e.g. a student's answer save during a Render redeploy) before closing the DB pool.
  // Without draining, a mid-deploy SIGTERM can cut off the very saves this app protects.
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] Received shutdown signal (${signal})`);
    // Drop idle keep-alive sockets immediately; wait (up to 10s) for in-flight ones to drain.
    server.closeIdleConnections?.();
    await Promise.race([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
    await shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });

  // Cleanup stale sessions every hour
  setInterval(() => { cleanupStaleSessions(); }, 60 * 60 * 1000).unref();
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default start;