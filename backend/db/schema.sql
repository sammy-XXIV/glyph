-- Run once to set up the database

CREATE TABLE IF NOT EXISTS matches (
  id          SERIAL PRIMARY KEY,
  external_id INTEGER UNIQUE NOT NULL,       -- football-data.org match ID
  home_team   TEXT NOT NULL,
  away_team   TEXT NOT NULL,
  home_flag   TEXT,
  away_flag   TEXT,
  group_name  TEXT,                          -- 'Group A', 'Round of 32', etc.
  kickoff_utc TIMESTAMPTZ NOT NULL,
  status      TEXT DEFAULT 'SCHEDULED',      -- SCHEDULED | LIVE | FINISHED
  home_score  INTEGER,
  away_score  INTEGER,
  result      TEXT,                          -- 'HOME' | 'AWAY' | 'DRAW' (set on FINISHED)
  chainlink_verified BOOLEAN DEFAULT false   -- true once Chainlink oracle confirms
);

CREATE TABLE IF NOT EXISTS players (
  wallet      TEXT PRIMARY KEY,              -- checksummed wallet address
  card_tier   TEXT NOT NULL DEFAULT 'COMMON', -- COMMON | UNCOMMON | RARE | EPIC | LEGENDARY
  token_id    INTEGER,                       -- on-chain NFT token ID
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
  id          SERIAL PRIMARY KEY,
  wallet      TEXT NOT NULL REFERENCES players(wallet),
  match_id    INTEGER NOT NULL REFERENCES matches(id),
  pick        TEXT NOT NULL,                 -- 'HOME' | 'DRAW' | 'AWAY'
  is_correct  BOOLEAN,                       -- null until match finishes
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (wallet, match_id)
);

CREATE TABLE IF NOT EXISTS leaderboard_cache (
  wallet          TEXT PRIMARY KEY,
  card_tier       TEXT,
  correct_picks   INTEGER DEFAULT 0,
  total_picks     INTEGER DEFAULT 0,
  win_rate        NUMERIC(5,2) DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON predictions(wallet);
CREATE INDEX ON predictions(match_id);
CREATE INDEX ON matches(status);
