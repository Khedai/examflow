import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireTeacher } from '../middleware/auth';
import { getOne, getAll, run } from '../db';

const router = Router();

// All routes require teacher auth
router.use(requireTeacher);

// GET /api/batches — list all batches with submission stats
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await getAll(`
      SELECT
        b.id, b.name, b.created_at,
        COUNT(DISTINCT s.id) as student_count,
        COUNT(DISTINCT CASE WHEN s.status = 'STARTED' THEN s.id END) as started_count,
        COUNT(DISTINCT CASE WHEN s.status = 'SUBMITTED' THEN s.id END) as submitted_count,
        COUNT(DISTINCT CASE WHEN s.status = 'MARKED' THEN s.id END) as marked_count
      FROM batches b
      LEFT JOIN submissions s ON s.batch_id = b.id
      GROUP BY b.id, b.name, b.created_at
      ORDER BY b.created_at DESC
    `);
    const batches = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      studentCount: parseInt(r.student_count || '0'),
      startedCount: parseInt(r.started_count || '0'),
      submittedCount: parseInt(r.submitted_count || '0'),
      markedCount: parseInt(r.marked_count || '0'),
    }));
    return res.json(batches);
  } catch (err: any) {
    console.error('List batches error:', err);
    return res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// POST /api/batches — create a new batch
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(422).json({ error: 'Batch name is required' });
    }
    const id = uuidv4();
    await run('INSERT INTO batches (id, name) VALUES ($1, $2)', [id, name.trim()]);
    const row = await getOne('SELECT id, name, created_at FROM batches WHERE id = $1', [id]);
    return res.status(201).json({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      studentCount: 0,
      startedCount: 0,
      submittedCount: 0,
      markedCount: 0,
    });
  } catch (err: any) {
    console.error('Create batch error:', err);
    return res.status(500).json({ error: 'Failed to create batch' });
  }
});

// PUT /api/batches/:id — rename a batch
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(422).json({ error: 'Batch name is required' });
    }
    const existing = await getOne('SELECT id FROM batches WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Batch not found' });
    await run('UPDATE batches SET name = $1 WHERE id = $2', [name.trim(), id]);
    const row = await getOne('SELECT id, name, created_at FROM batches WHERE id = $1', [id]);
    // Fetch fresh stats for the renamed batch
    const stats = await getOne(`
      SELECT
        COUNT(DISTINCT s.id) as student_count,
        COUNT(DISTINCT CASE WHEN s.status = 'STARTED' THEN s.id END) as started_count,
        COUNT(DISTINCT CASE WHEN s.status = 'SUBMITTED' THEN s.id END) as submitted_count,
        COUNT(DISTINCT CASE WHEN s.status = 'MARKED' THEN s.id END) as marked_count
      FROM batches b
      LEFT JOIN submissions s ON s.batch_id = b.id
      WHERE b.id = $1
      GROUP BY b.id
    `, [id]);
    return res.json({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      studentCount: parseInt(stats?.student_count || '0'),
      startedCount: parseInt(stats?.started_count || '0'),
      submittedCount: parseInt(stats?.submitted_count || '0'),
      markedCount: parseInt(stats?.marked_count || '0'),
    });
  } catch (err: any) {
    console.error('Update batch error:', err);
    return res.status(500).json({ error: 'Failed to update batch' });
  }
});

// DELETE /api/batches/:id — delete a batch (unlinks submissions)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await getOne('SELECT id FROM batches WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Batch not found' });
    // Unlink submissions before deleting
    await run('UPDATE submissions SET batch_id = NULL WHERE batch_id = $1', [id]);
    await run('DELETE FROM batches WHERE id = $1', [id]);
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error('Delete batch error:', err);
    return res.status(500).json({ error: 'Failed to delete batch' });
  }
});

export default router;