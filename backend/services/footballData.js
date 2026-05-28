const axios = require('axios');
const db = require('../db');

const API = axios.create({
  baseURL: 'https://api.football-data.org/v4',
  headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
});

// World Cup 2026 competition code
const WC2026 = 'WC';

const FLAG_BASE = 'https://flagcdn.com/48x36';
const COUNTRY_CODES = {
  'Argentina': 'ar', 'Brazil': 'br', 'France': 'fr', 'England': 'gb-eng',
  'Germany': 'de', 'Spain': 'es', 'Portugal': 'pt', 'Netherlands': 'nl',
  'Belgium': 'be', 'Uruguay': 'uy', 'Croatia': 'hr', 'Italy': 'it',
  'USA': 'us', 'Mexico': 'mx', 'Colombia': 'co', 'Morocco': 'ma',
  'Switzerland': 'ch', 'Denmark': 'dk', 'Nigeria': 'ng', 'Senegal': 'sn',
  'Japan': 'jp', 'Saudi Arabia': 'sa', 'Cameroon': 'cm', 'Ghana': 'gh',
  'Costa Rica': 'cr',
};

function flagUrl(teamName) {
  const code = COUNTRY_CODES[teamName];
  return code ? `${FLAG_BASE}/${code}.png` : null;
}

async function syncMatches() {
  console.log('[footballData] syncing matches...');
  const { data } = await API.get(`/competitions/${WC2026}/matches`);

  for (const m of data.matches) {
    const home = m.homeTeam.name;
    const away = m.awayTeam.name;
    const status = m.status;
    const homeScore = m.score?.fullTime?.home ?? null;
    const awayScore = m.score?.fullTime?.away ?? null;

    let result = null;
    if (status === 'FINISHED' && homeScore !== null) {
      if (homeScore > awayScore) result = 'HOME';
      else if (awayScore > homeScore) result = 'AWAY';
      else result = 'DRAW';
    }

    await db.query(
      `INSERT INTO matches (external_id, home_team, away_team, home_flag, away_flag, group_name, kickoff_utc, status, home_score, away_score, result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (external_id) DO UPDATE SET
         status=EXCLUDED.status, home_score=EXCLUDED.home_score,
         away_score=EXCLUDED.away_score, result=EXCLUDED.result`,
      [
        m.id, home, away, flagUrl(home), flagUrl(away),
        m.stage, m.utcDate, status, homeScore, awayScore, result,
      ]
    );
  }

  // After syncing results, score predictions for finished matches
  await scorePredictions();
  console.log('[footballData] sync complete');
}

async function scorePredictions() {
  // Mark correct/incorrect for all finished matches
  await db.query(`
    UPDATE predictions p
    SET is_correct = (p.pick = m.result)
    FROM matches m
    WHERE p.match_id = m.id
      AND m.status = 'FINISHED'
      AND m.result IS NOT NULL
      AND p.is_correct IS NULL
  `);

  // Refresh leaderboard cache
  await db.query(`
    INSERT INTO leaderboard_cache (wallet, card_tier, correct_picks, total_picks, win_rate, updated_at)
    SELECT
      pl.wallet,
      pl.card_tier,
      COUNT(*) FILTER (WHERE p.is_correct = true),
      COUNT(*) FILTER (WHERE p.is_correct IS NOT NULL),
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE p.is_correct = true)
        / NULLIF(COUNT(*) FILTER (WHERE p.is_correct IS NOT NULL), 0),
        2
      ),
      NOW()
    FROM players pl
    LEFT JOIN predictions p ON p.wallet = pl.wallet
    GROUP BY pl.wallet, pl.card_tier
    ON CONFLICT (wallet) DO UPDATE SET
      card_tier = EXCLUDED.card_tier,
      correct_picks = EXCLUDED.correct_picks,
      total_picks = EXCLUDED.total_picks,
      win_rate = EXCLUDED.win_rate,
      updated_at = EXCLUDED.updated_at
  `);
}

module.exports = { syncMatches };
