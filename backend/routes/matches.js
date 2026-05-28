const router = require('express').Router();
const db = require('../db');

// GET /api/matches — all matches, optional ?status=SCHEDULED|FINISHED
router.get('/', async (req, res) => {
  try {
    const { status, group } = req.query;
    let q = 'SELECT * FROM matches';
    const params = [];
    const where = [];

    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (group)  { params.push(group);  where.push(`group_name = $${params.length}`); }
    if (where.length) q += ' WHERE ' + where.join(' AND ');
    q += ' ORDER BY kickoff_utc ASC';

    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
