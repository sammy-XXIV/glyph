const router = require('express').Router();
const db = require('../db');
const { verifyWallet } = require('../middleware/auth');

// GET /api/predictions — my picks (auth required)
router.get('/', verifyWallet, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, m.home_team, m.away_team, m.kickoff_utc, m.status, m.result
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       WHERE p.wallet = $1
       ORDER BY m.kickoff_utc ASC`,
      [req.wallet]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/predictions — submit/update picks (auth required)
// Body: [{ match_id, pick }]
router.post('/', verifyWallet, async (req, res) => {
  const picks = req.body;
  if (!Array.isArray(picks) || !picks.length) {
    return res.status(400).json({ error: 'Send array of { match_id, pick }' });
  }

  const VALID_PICKS = ['HOME', 'DRAW', 'AWAY'];
  for (const p of picks) {
    if (!VALID_PICKS.includes(p.pick)) {
      return res.status(400).json({ error: `Invalid pick: ${p.pick}` });
    }
  }

  try {
    // Ensure player row exists
    await db.query(
      `INSERT INTO players (wallet) VALUES ($1) ON CONFLICT DO NOTHING`,
      [req.wallet]
    );

    // Block picks on finished or locked matches
    const matchIds = picks.map((p) => p.match_id);
    const { rows: matchRows } = await db.query(
      `SELECT id, status, kickoff_utc FROM matches WHERE id = ANY($1)`,
      [matchIds]
    );
    const now = new Date();
    for (const m of matchRows) {
      if (m.status === 'FINISHED' || new Date(m.kickoff_utc) <= now) {
        return res.status(400).json({ error: `Match ${m.id} is locked` });
      }
    }

    // Upsert predictions
    for (const p of picks) {
      await db.query(
        `INSERT INTO predictions (wallet, match_id, pick)
         VALUES ($1, $2, $3)
         ON CONFLICT (wallet, match_id) DO UPDATE SET pick = EXCLUDED.pick, submitted_at = NOW()`,
        [req.wallet, p.match_id, p.pick]
      );
    }

    res.json({ saved: picks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
