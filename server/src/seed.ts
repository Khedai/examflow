import { v4 as uuidv4 } from 'uuid';
import { getOne, getAll, transaction, run } from './db';

export async function seed() {
  // ── Batch migration: ensure a default batch exists and all submissions are assigned ──
  const batchCountRow = await getOne('SELECT COUNT(*) as c FROM batches');
  const batchCount = parseInt(batchCountRow?.c || '0');
  let defaultBatchId: string | null = null;

  if (batchCount === 0) {
    // Create default "Week 1" batch
    defaultBatchId = uuidv4();
    await run('INSERT INTO batches (id, name) VALUES ($1, $2)', [defaultBatchId, 'Week 1']);
    console.log('[seed] Created default batch: Week 1');
  } else {
    // Get the first batch as default
    const firstBatch = await getOne('SELECT id FROM batches ORDER BY created_at ASC LIMIT 1');
    defaultBatchId = firstBatch?.id || null;
  }

  // Assign all unassigned submissions to the default batch
  if (defaultBatchId) {
    const unassigned = await run(
      'UPDATE submissions SET batch_id = $1 WHERE batch_id IS NULL',
      [defaultBatchId]
    );
    if (unassigned.rowCount && unassigned.rowCount > 0) {
      console.log(`[seed] Assigned ${unassigned.rowCount} existing submissions to default batch`);
    }
  }

  const examCountRow = await getOne('SELECT COUNT(*) as c FROM exams');
  const examCount = parseInt(examCountRow?.c || '0');

  // ── Seed Mathematics Quiz (if no exams exist at all) ──
  if (examCount === 0) {
    const mathExamId = uuidv4();
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO exams (id, title, description, duration, start_time, published) VALUES ($1,$2,$3,$4,$5,$6)',
        [mathExamId, 'Mathematics Quiz', 'A basic mathematics assessment covering addition, subtraction, shapes, and problem solving.', 30, null, 1]
      );
      const qs = [
        { pos: 1, type: 'mcq', text: 'What is 15 + 27?', options: JSON.stringify(['40', '42', '52', '38']), correct: '42', points: 5 },
        { pos: 2, type: 'mcq', text: 'Which shape has 4 equal sides?', options: JSON.stringify(['Rectangle', 'Triangle', 'Square', 'Circle']), correct: 'Square', points: 5 },
        { pos: 3, type: 'short', text: 'Explain how to check if a number is even.', options: null, correct: null, points: 5 },
        { pos: 4, type: 'short', text: 'What is 100 - 37? Show your working.', options: null, correct: null, points: 5 },
        { pos: 5, type: 'long', text: 'A shop sells apples for R2 each and oranges for R3 each. If you buy 5 apples and 3 oranges, how much do you spend in total? Explain your steps.', options: null, correct: null, points: 5 },
      ];
      for (const q of qs) {
        await client.query(
          'INSERT INTO questions (id, exam_id, position, type, text, options, correct, points) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [uuidv4(), mathExamId, q.pos, q.type, q.text, q.options, q.correct, q.points]
        );
      }
    });
    console.log('Seeded sample Mathematics Quiz exam');
  }

  // ── Seed Khusela Assessment (always seed if not already present) ──
  const khuselaId = 'khusela-assessment-2026';
  const existingKhusela = await getOne('SELECT * FROM exams WHERE id = $1', [khuselaId]);
  if (existingKhusela) {
    // Re-seed if duration has changed (update from 60→90)
    if (existingKhusela.duration === 60) {
      await run('UPDATE exams SET duration = 90 WHERE id = $1', [khuselaId]);
      console.log('Khusela Assessment duration updated to 90 min');
    } else {
      console.log('Khusela Assessment already seeded — skipping');
    }
    return;
  }

  await transaction(async (client) => {
    await client.query(
      'INSERT INTO exams (id, title, description, duration, start_time, published) VALUES ($1,$2,$3,$4,$5,$6)',
      [khuselaId, 'Khusela Assessment Questionnaire 2026', 'Please answer all questions below in full. This assessment covers workplace conduct, debt management, sales and customer service. GOOD LUCK!!!', 90, null, 1]
    );

    const questions: { position: number; type: string; text: string; points: number }[] = [
      { position: 1,  type: 'long',  text: 'Give two reasons why it is VERY important to adhere to working hours?', points: 2 },
      { position: 2,  type: 'short', text: 'Why is it important for a company to grant breaks and what is the time frame around such breaks?', points: 1 },
      { position: 3,  type: 'long',  text: '(A) Is late coming acceptable? If yes — explain why? (B) What steps can a company take if late coming becomes a trend?', points: 2 },
      { position: 4,  type: 'long',  text: 'Is there a time frame within which one should report absenteeism or late coming to your senior, and why?', points: 2 },
      { position: 5,  type: 'short', text: 'Why is dress code an important factor in any organisation?', points: 1 },
      { position: 6,  type: 'long',  text: 'Is eating at your workstation allowed, and why?', points: 2 },
      { position: 7,  type: 'short', text: 'What are the consequences regarding alcohol and drug use in the workplace?', points: 1 },
      { position: 8,  type: 'short', text: 'What is your understanding regarding the term Debt Mediation?', points: 2 },
      { position: 9,  type: 'long',  text: 'Give four examples of minor accounts?', points: 4 },
      { position: 10, type: 'short', text: 'What is meant by an informal process?', points: 2 },
      { position: 11, type: 'short', text: 'What is meant by a formal process?', points: 2 },
      { position: 12, type: 'long',  text: 'List the documents required under Debt Mediation?', points: 4 },
      { position: 13, type: 'short', text: 'What is your understanding regarding the term Debt Review?', points: 2 },
      { position: 14, type: 'short', text: 'Give examples of major accounts?', points: 2 },
      { position: 15, type: 'long',  text: 'List the documents required under Debt Review?', points: 9 },
      { position: 16, type: 'short', text: 'In order to sign up a client, the client must be?', points: 2 },
      { position: 17, type: 'long',  text: 'List the documents required under Debt Review Removal?', points: 9 },
      { position: 18, type: 'short', text: 'What do you understand by the term Garnishee Order?', points: 2 },
      { position: 19, type: 'long',  text: 'List the benefits under the following: A) Debt Mediation (4 benefits) B) Debt Review (4 benefits)', points: 8 },
      { position: 20, type: 'long',  text: 'Is it important for a person to have ethics and why?', points: 4 },
      { position: 21, type: 'long',  text: 'Does image matter and why?', points: 3 },
      { position: 22, type: 'long',  text: 'Describe the proper manner in which one should answer a company phone?', points: 7 },
      { position: 23, type: 'long',  text: 'Why is it important for employees to reach/achieve their daily, weekly and monthly targets at all times?', points: 6 },
      { position: 24, type: 'long',  text: "Complete the case study with calculation included: Khusela Debt Management has a sales and direct marketing department with a staff complement of 20 agents. They have a monthly target of 500 signed closed deals. Please confirm each agent's daily, weekly and monthly target. Show your Calculation and state the Target for: Daily / Weekly / Monthly", points: 9 },
      { position: 25, type: 'long',  text: 'Give a clear understanding as to why it is important for companies to process statistics monthly?', points: 4 },
      { position: 26, type: 'short', text: 'What is your understanding when you hear the word sales?', points: 3 },
      { position: 27, type: 'long',  text: 'Explain in your own words why clients/customers stay or leave a company? A) Why clients/customers STAY (3 reasons) B) Why clients/customers LEAVE (3 reasons)', points: 6 },
      { position: 28, type: 'long',  text: 'List the four objection handling strategies?', points: 4 },
    ];

    for (const q of questions) {
      await client.query(
        'INSERT INTO questions (id, exam_id, position, type, text, options, correct, points) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [uuidv4(), khuselaId, q.position, q.type, q.text, null, null, q.points]
      );
    }
  });
  console.log('Seeded Khusela Assessment Questionnaire 2026 (28 questions, 92 points)');
}