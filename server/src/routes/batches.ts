import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireTeacher } from '../middleware/auth';
import { getOne, getAll, run } from '../db';

const router = Router();

// All routes require teacher auth
router.use(requireTeacher);

// GET /api/batches — list all batches
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await getAll('SELECT id, name, created_at FROM batches ORDER BY created_at DESC');
    const batches = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
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
    return res.json({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
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