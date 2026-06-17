import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Use RENDER_PERSISTENT_DIR in production, otherwise project root
const dataDir = process.env.RENDER_PERSISTENT_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(dataDir, 'examflow.db');

// Ensure data directory exists (needed for Render persistent disk mount)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

export default db;
