-- ExamFlow SQLite Schema
-- Auto-executed on server start

CREATE TABLE IF NOT EXISTS exams (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  duration      INTEGER NOT NULL CHECK (duration > 0),
  start_time    TEXT,
  published     INTEGER NOT NULL DEFAULT 0,
  locked        INTEGER NOT NULL DEFAULT 0,
  exceptions    TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id            TEXT PRIMARY KEY,
  exam_id       TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('mcq', 'short', 'long')),
  text          TEXT NOT NULL DEFAULT '',
  options       TEXT,
  correct       TEXT,
  points        INTEGER NOT NULL DEFAULT 5 CHECK (points > 0),
  UNIQUE (exam_id, position)
);

CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  surname       TEXT NOT NULL,
  cell          TEXT DEFAULT '',
  session_token TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batches (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY,
  exam_id       TEXT NOT NULL REFERENCES exams(id),
  student_id    TEXT NOT NULL REFERENCES students(id),
  batch_id      TEXT REFERENCES batches(id),
  status        TEXT NOT NULL DEFAULT 'STARTED' CHECK (status IN ('STARTED', 'SUBMITTED', 'MARKED')),
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  score         INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id              TEXT PRIMARY KEY,
  submission_id   TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text     TEXT DEFAULT '',
  awarded_points  INTEGER,
  feedback        TEXT DEFAULT '',
  UNIQUE (submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);