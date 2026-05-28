require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { syncMatches } = require('./services/footballData');
const contractSvc = require('./services/contract');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Routes
app.use('/api/matches',     require('./routes/matches'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/players',     require('./routes/players'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Sync match data every 5 minutes during the tournament
cron.schedule('*/5 * * * *', () => {
  syncMatches().catch(console.error);
});

async function start() {
  // Init contract signer
  contractSvc.init();

  // Initial match sync on boot
  await syncMatches().catch(console.error);

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Glyph backend running on :${PORT}`));
}

start();
