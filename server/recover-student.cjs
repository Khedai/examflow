// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY student data recovery probe (SELECTs only — never writes).
//
//   node recover-student.cjs zintle galeni
//   node recover-student.cjs "" ngcolise        (surname only)
//
// Supabase's direct host (db.<ref>.supabase.co) is IPv6-only, which fails from most
// office/home networks. This script connects through the Supabase IPv4 connection
// pooler instead, so it works from a normal laptop.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const namePattern = process.argv[2] || '';
const surPattern = process.argv[3] || '';

function poolerUrl() {
  const u = new URL(process.env.DATABASE_URL);
  const ref = /^db\.([^.]+)\.supabase\.co$/i.test(u.hostname)
    ? u.hostname.split('.')[1]
    : decodeURIComponent(u.username).includes('.')
      ? decodeURIComponent(u.username).split('.')[1]
      : u.hostname.split('.')[0];
  const pwd = encodeURIComponent(decodeURIComponent(u.password));
  const db = (u.pathname || '/postgres').replace(/^\//, '') || 'postgres';
  return `postgresql://postgres.${ref}:${pwd}@aws-0-eu-west-1.pooler.supabase.com:5432/${db}`;
}

(async () => {
  if (!process.env.DATABASE_URL) { console.log('!! DATABASE_URL not set in .env'); process.exit(1); }

  const client = new Client({ connectionString: poolerUrl(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await client.connect();

  const q = async (label, sql, params) => {
    const r = await client.query(sql, params);
    console.log('== ' + label + ' (' + r.rows.length + ') ==');
    r.rows.forEach((x) => console.log(JSON.stringify(x)));
    console.log('');
    return r.rows;
  };

  const now = (await client.query('SELECT NOW() AS "serverNowUtc", current_setting(\'TimeZone\') AS tz')).rows[0];
  console.log('Server time:', JSON.stringify(now), '\n');

  const students = await q('MATCHING STUDENTS',
    `SELECT id, student_id, name, surname, cell, (session_token IS NOT NULL) AS logged_in, created_at
     FROM students
     WHERE ($1 <> '' AND (name ILIKE $2 OR surname ILIKE $2))
        OR ($3 <> '' AND (name ILIKE $4 OR surname ILIKE $4))
     ORDER BY created_at`,
    [namePattern, `%${namePattern}%`, surPattern, `%${surPattern}%`]);

  for (const st of students) {
    const subs = await q(`SUBMISSIONS for ${st.name} ${st.surname}`,
      `SELECT s.id AS submission_id, e.title AS exam, s.status, s.created_at, s.started_at,
              s.submitted_at, s.score, b.name AS batch,
              (SELECT COUNT(*) FROM answers a JOIN questions qq ON qq.id = a.question_id
                WHERE a.submission_id = s.id AND LENGTH(TRIM(COALESCE(a.answer_text,''))) > 0) AS answered,
              (SELECT COUNT(*) FROM answers a2 WHERE a2.submission_id = s.id) AS answer_rows
       FROM submissions s JOIN exams e ON e.id = s.exam_id LEFT JOIN batches b ON b.id = s.batch_id
       WHERE s.student_id = $1 ORDER BY s.created_at DESC`, [st.id]);

    for (const s of subs) {
      await q(`ANSWERS in ${s.submission_id}`,
        `SELECT q.position, q.type, LENGTH(TRIM(COALESCE(a.answer_text,''))) AS chars,
                COALESCE(a.answer_text,'') AS answer_text
         FROM answers a JOIN questions q ON q.id = a.question_id
         WHERE a.submission_id = $1 ORDER BY q.position`, [s.submission_id]);
    }
  }

  console.log('DONE (read-only, nothing modified).');
  await client.end();
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
