# Manually Remove Zinzile Ngcolise's Submission

Since we cannot reach the production database directly from this machine (network restrictions),
follow these steps using the **Supabase Dashboard SQL Editor**:

## Step 1: Open Supabase SQL Editor
Go to: https://supabase.com/dashboard/project/elnwnwhnhzjkrceiyaev/sql/new

## Step 2: Find Zinzile's student record
Run this query to find her:
```sql
SELECT id, student_id, name, surname 
FROM students 
WHERE name ILIKE '%zinzile%' OR surname ILIKE '%ngcolise%';
```

## Step 3: See her submissions (to confirm)
Replace `'<HER_STUDENT_ID>'` with the `id` from Step 2:
```sql
SELECT s.id, s.status, s.started_at, s.submitted_at,
       e.title as exam_title,
       b.name as batch_name
FROM submissions s
JOIN exams e ON e.id = s.exam_id
LEFT JOIN batches b ON b.id = s.batch_id
WHERE s.student_id = '<HER_STUDENT_ID>';
```

## Step 4: Delete her Week 4 submission(s)
Replace `'<HER_STUDENT_ID>'` with the `id` from Step 2:

**Option A** — Delete only Week 4 submissions:
```sql
DELETE FROM submissions 
WHERE student_id = '<HER_STUDENT_ID>'
AND batch_id IN (SELECT id FROM batches WHERE name ILIKE '%week 4%');
```

**Option B** — Delete ALL her submissions (clean slate):
```sql
DELETE FROM submissions WHERE student_id = '<HER_STUDENT_ID>';
```

## Step 5: Clear her session token (so she signs in fresh)
```sql
UPDATE students SET session_token = NULL WHERE id = '<HER_STUDENT_ID>';
```

## Step 6: Verify
```sql
SELECT COUNT(*) as remaining FROM submissions WHERE student_id = '<HER_STUDENT_ID>';
```
Should return `0`.

---

## Alternative: If the Render API is working from your browser

Open the browser console on the teacher dashboard page and run:
```js
// First get her submission ID from the table, then:
fetch('/api/submissions/SUBMISSION_ID_HERE', { 
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('teacher_token') }
}).then(r => r.json()).then(console.log);