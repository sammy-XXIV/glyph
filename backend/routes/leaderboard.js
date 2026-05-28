const router = require('express').Router();
const db = require('../db');

// GET /api/leaderboard?tier=LEGENDARY&limit=50
router.get('/', async (req, res) => {
  try {
    const { tier, limit = 50, offset = 0 } = req.query;
    const params = [parseInt(limit), parseInt(offset)];
    let where = '';

    if (tier) {
      params.push(tier.toUpperCase());
      where = `WHERE card_tier = $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT wallet, card_tier, correct_picks, total_picks, win_rate
       FROM leaderboard_cache
       ${where}
       ORDER BY correct_picks DESC, win_rate DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    // Prize pool — sum of all minted cards * $0.50
    const { rows: poolRows } = await db.query('SELECT COUNT(*) FROM players');
    const prizePool = (parseInt(poolRows[0].count) * 0.5).toFixed(2);

    res.json({ players: rows, prizePool });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
