const router = require('express').Router();
const db = require('../db');
const { verifyWallet } = require('../middleware/auth');
const contractSvc = require('../services/contract');

const TIERS = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
// Correct picks needed to fill the bar per tier → next tier
const THRESHOLD = { COMMON: 10, UNCOMMON: 20, RARE: 35, EPIC: 55 };

// GET /api/players/me — my card + stats
router.get('/me', verifyWallet, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pl.*, lc.correct_picks, lc.total_picks, lc.win_rate
       FROM players pl
       LEFT JOIN leaderboard_cache lc ON lc.wallet = pl.wallet
       WHERE pl.wallet = $1`,
      [req.wallet]
    );
    if (!rows.length) return res.json(null); // not minted yet
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/players/mint — mint first Common card
router.post('/mint', verifyWallet, async (req, res) => {
  try {
    // Check they don't already have a card
    const { rows } = await db.query('SELECT wallet FROM players WHERE wallet = $1', [req.wallet]);
    if (rows.length) return res.status(400).json({ error: 'Already minted' });

    const tokenId = await contractSvc.mintCommon(req.wallet);

    await db.query(
      `INSERT INTO players (wallet, card_tier, token_id) VALUES ($1, 'COMMON', $2)`,
      [req.wallet, tokenId]
    );

    res.json({ tokenId, tier: 'COMMON' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/players/upgrade — burn + mint next tier if threshold met
router.post('/upgrade', verifyWallet, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pl.card_tier, pl.token_id, lc.correct_picks
       FROM players pl
       LEFT JOIN leaderboard_cache lc ON lc.wallet = pl.wallet
       WHERE pl.wallet = $1`,
      [req.wallet]
    );
    if (!rows.length) return res.status(404).json({ error: 'No card found' });

    const { card_tier, token_id, correct_picks } = rows[0];
    if (card_tier === 'LEGENDARY') return res.status(400).json({ error: 'Already Legendary' });

    const needed = THRESHOLD[card_tier];
    if ((correct_picks || 0) < needed) {
      return res.status(400).json({ error: `Need ${needed} correct picks, have ${correct_picks || 0}` });
    }

    const { newTokenId, newTier } = await contractSvc.burnAndUpgrade(token_id, req.wallet, card_tier);

    await db.query(
      `UPDATE players SET card_tier = $1, token_id = $2 WHERE wallet = $3`,
      [newTier, newTokenId, req.wallet]
    );

    res.json({ newTokenId, newTier });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
