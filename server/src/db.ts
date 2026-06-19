// ─── Hybrid DB: PostgreSQL on Render/Supabase, SQLite locally ───

import type { PoolClient } from 'pg';

// ── TypeScript interfaces for both backends ──

interface DbClient {
  query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

// ── Lazy backend selection ──

let _backend: DbClient | null = null;
let _sqliteDb: any = null;  // raw better-sqlite3 handle for schema exec

async function getBackend(): Promise<DbClient> {
  if (_backend) return _backend;

  const pgUrl = process.env.DATABASE_URL;

  // Check if we should use PostgreSQL
  if (pgUrl && pgUrl.startsWith('postgres')) {
    try {
      const { Pool } = await import('pg');
      // Force port 6543 (connection pooler) and IPv4 — Render cannot reach Supabase IPv6
      let fixedUrl = pgUrl.replace(/:5432\b/, ':6543');
      const pool = new Pool({
        connectionString: fixedUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        ssl: { rejectUnauthorized: false },
        family: 4, // Force IPv4
      } as any);
      console.log('[db] Trying PostgreSQL backend:', fixedUrl.replace(/\/\/.*@/, '//***@'));
      // Quick connectivity test
      await pool.query('SELECT 1');
      console.log('[db] PostgreSQL connected');

      const pgBackend: DbClient = {
        query: async (text: string, params?: any[]) => {
          const result = await pool.query(text, params);
          return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
        },
      };

      // Override transaction for pg
      _pgTransaction = async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      };

      _backend = pgBackend;
      return _backend;
    } catch (e: any) {
      console.log('[db] PostgreSQL unavailable, falling back to SQLite:', e.message);
    }
  }

  // Fallback: SQLite
  return await initSqlite();
}

async function initSqlite(): Promise<DbClient> {
  const Database = (await import('better-sqlite3')).default;
  const path = (await import('path')).default;

  const DB_PATH = path.join(__dirname, '..', 'examflow.db');
  console.log('[db] Opening SQLite database:', DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  _sqliteDb = db;
  console.log('[db] SQLite connected');

  // SQL translation
  function toSqlite(sql: string): string {
    return sql
      .replace(/\$\d+/g, '?')
      .replace(/\bNOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ','now')")
      .replace(/\bILIKE\b/gi, 'LIKE')
      .replace(/\bTIMESTAMPTZ\b/gi, 'TEXT')
      .replace(/\bSERIAL\b/gi, 'INTEGER');
  }

  function isWriteSql(sql: string): boolean {
    const cmd = sql.trim().substring(0, 12).toUpperCase();
    return cmd.startsWith('INSERT') || cmd.startsWith('UPDATE') || cmd.startsWith('DELETE') || cmd.startsWith('CREATE') || cmd.startsWith('DROP') || cmd.startsWith('ALTER');
  }

  const sqliteBackend: DbClient = {
    query: (text: string, params: any[] = []) => {
      const converted = toSqlite(text);
      if (isWriteSql(converted)) {
        db.prepare(converted).run(...params);
        return Promise.resolve({ rows: [], rowCount: (db as any).changes });
      }
      const rows = db.prepare(converted).all(...params);
      return Promise.resolve({ rows, rowCount: rows.length });
    },
  };

  // Override transaction for SQLite
  let txnQueue: (() => Promise<void>)[] = [];
  let txnRunning = false;

  function processQueue() {
    if (txnRunning || txnQueue.length === 0) return;
    txnRunning = true;
    const next = txnQueue.shift()!;
    next().finally(() => {
      txnRunning = false;
      processQueue();
    });
  }

  _pgTransaction = async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
    const sqliteClient = {
      query: (text: string, params: any[] = []) => {
        const converted = toSqlite(text);
        if (isWriteSql(converted)) {
          db.prepare(converted).run(...params);
          return { rows: [], rowCount: (db as any).changes };
        }
        const rows = db.prepare(converted).all(...params);
        return { rows, rowCount: rows.length };
      },
    };

    return new Promise<T>((resolve, reject) => {
      txnQueue.push(async () => {
        try {
          db.prepare('BEGIN').run();
          const result = await fn(sqliteClient);
          db.prepare('COMMIT').run();
          resolve(result);
        } catch (e) {
          try { db.prepare('ROLLBACK').run(); } catch {}
          reject(e);
        }
      });
      processQueue();
    });
  };

  _backend = sqliteBackend;
  return _backend;
}

// ── Transaction (pg PoolClient / SqliteClient) ──

let _pgTransaction: (<T>(fn: (client: any) => Promise<T>) => Promise<T>) | null = null;

export async function transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  await getBackend();
  return _pgTransaction!(fn);
}

// ── Public API ──

export async function query(text: string, params?: any[]) {
  const b = await getBackend();
  return b.query(text, params);
}

export async function getOne(text: string, params?: any[]) {
  const b = await getBackend();
  const result = await b.query(text, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function getAll(text: string, params?: any[]) {
  const b = await getBackend();
  const result = await b.query(text, params);
  return result.rows;
}

export async function run(text: string, params?: any[]) {
  const b = await getBackend();
  return b.query(text, params);
}

// ── Schema init ──

export async function initSchema() {
  const b = await getBackend();

  // For SQLite, use exec() to handle multi-statement schema
  if (_sqliteDb) {
    const schema = `
      CREATE TABLE IF NOT EXISTS exams (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        description   TEXT DEFAULT '',
        duration      INTEGER NOT NULL CHECK (duration > 0),
        start_time    TEXT,
        published     INTEGER NOT NULL DEFAULT 0,
        locked        INTEGER NOT NULL DEFAULT 0,
        exceptions    TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id            TEXT PRIMARY KEY,
        exam_id       TEXT NOT NULL REFERENCES exams(id),
        student_id    TEXT NOT NULL REFERENCES students(id),
        status        TEXT NOT NULL DEFAULT 'STARTED' CHECK (status IN ('STARTED', 'SUBMITTED', 'MARKED')),
        started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        submitted_at  TEXT,
        score         INTEGER,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
    `;
    _sqliteDb.exec(schema);
    console.log('[db] Schema initialised (SQLite)');
    return;
  }

  // PostgreSQL schema
  await b.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      description   TEXT DEFAULT '',
      duration      INTEGER NOT NULL CHECK (duration > 0),
      start_time    TEXT,
      published     INTEGER NOT NULL DEFAULT 0,
      locked        INTEGER NOT NULL DEFAULT 0,
      exceptions    TEXT NOT NULL DEFAULT '[]',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id            TEXT PRIMARY KEY,
      exam_id       TEXT NOT NULL REFERENCES exams(id),
      student_id    TEXT NOT NULL REFERENCES students(id),
      status        TEXT NOT NULL DEFAULT 'STARTED' CHECK (status IN ('STARTED', 'SUBMITTED', 'MARKED')),
      started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at  TIMESTAMPTZ,
      score         INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  `);
  console.log('[db] Schema initialised (PostgreSQL)');
}

export default getBackend;