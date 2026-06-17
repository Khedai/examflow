import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load .env in development only — Render sets env vars directly
const envPath = path.join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath, override: false });

import teacherRouter from './routes/teacher';
import examsRouter from './routes/exams';
import submissionsRouter from './routes/submissions';
import studentsRouter from './routes/students';
import { errorHandler } from './middleware/errorHandler';
import { seed } from './seed';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/teacher', teacherRouter);
app.use('/api/exams', examsRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/students', studentsRouter);

seed();

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`ExamFlow server running on :${PORT}`));

export default app;