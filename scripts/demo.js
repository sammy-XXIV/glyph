#!/usr/bin/env node
// Glyph demo simulator
// Usage:
//   OWNER_KEY=0x... node demo.js setup               â†’ generate bots, fund, mint, predict
//   OWNER_KEY=0x... PLAYER=0x... node demo.js score  â†’ run tournament match by match
//   OWNER_KEY=0x... PLAYER=0x... node demo.js status â†’ show progress bars

import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __dirname  = dirname(fileURLToPath(import.meta.url));

const CA         = '0xbb3AC0CBB5B8164Db2047b3cB26927e7e43B7Bb5';
const SUPABASE_URL = 'https://epoflrlcaaupopwhozyz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwb2ZscmxjYWF1cG9wd2hvenl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU5NDE5MywiZXhwIjoyMDkyMTcwMTkzfQ.4DQNv8TfB8okMvvQX5KoGPQSKYuOZLq9bY9qoI-KUXo';
const USDT_CA    = '0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c';
const GRAPH      = 'https://api.studio.thegraph.com/query/1753846/glyph/v0.0.9';
const BOT_KEYS   = [
  '0x583dc5b9dc11530013bd427b8831aca5bbaddc3e4ce74fc0ad943dadcd461878',
  '0x1a55a9daad0d9fc46ce8bdaa33df0f2f734cd3a6e8a223f0bb9bbd4c470f7177',
  '0xca1f9afcbb361936933a0442464811b7bdebceb37986e47b25fabc647a905e06',
];
const BOTS_FILE  = join(__dirname, 'bots.json');
const STATE_FILE = join(__dirname, '..', 'state.json');

const DEMO_MATCHES = [
  // GROUP A
  { id:1,  home:'USA',         away:'Mexico',      group:'GROUP A · MD1', forceResult:'home' },
  { id:2,  home:'Canada',      away:'Panama',      group:'GROUP A · MD1', forceResult:'home' },
  { id:3,  home:'USA',         away:'Canada',      group:'GROUP A · MD2', forceResult:'home' },
  { id:4,  home:'Mexico',      away:'Panama',      group:'GROUP A · MD2', forceResult:'home' },
  { id:5,  home:'Mexico',      away:'Canada',      group:'GROUP A · MD3', forceResult:'home' },
  { id:6,  home:'Panama',      away:'USA',         group:'GROUP A · MD3', forceResult:'home' },
  // GROUP B
  { id:7,  home:'Brazil',      away:'Colombia',    group:'GROUP B · MD1', forceResult:'home' },
  { id:8,  home:'Ecuador',     away:'Bolivia',     group:'GROUP B · MD1', forceResult:'home' },
  { id:9,  home:'Brazil',      away:'Ecuador',     group:'GROUP B · MD2', forceResult:'home' },
  { id:10, home:'Colombia',    away:'Bolivia',     group:'GROUP B · MD2', forceResult:'home' },
  { id:11, home:'Colombia',    away:'Ecuador',     group:'GROUP B · MD3', forceResult:'home' },
  { id:12, home:'Bolivia',     away:'Brazil',      group:'GROUP B · MD3', forceResult:'home' },
  // GROUP C
  { id:13, home:'Argentina',   away:'Uruguay',     group:'GROUP C · MD1', forceResult:'home' },
  { id:14, home:'Paraguay',    away:'Venezuela',   group:'GROUP C · MD1', forceResult:'home' },
  { id:15, home:'Argentina',   away:'Paraguay',    group:'GROUP C · MD2', forceResult:'home' },
  { id:16, home:'Uruguay',     away:'Venezuela',   group:'GROUP C · MD2', forceResult:'home' },
  { id:17, home:'Uruguay',     away:'Paraguay',    group:'GROUP C · MD3', forceResult:'home' },
  { id:18, home:'Venezuela',   away:'Argentina',   group:'GROUP C · MD3', forceResult:'home' },
  // GROUP D
  { id:19, home:'France',      away:'Morocco',     group:'GROUP D · MD1', forceResult:'home' },
  { id:20, home:'Senegal',     away:'Mali',        group:'GROUP D · MD1', forceResult:'home' },
  { id:21, home:'France',      away:'Senegal',     group:'GROUP D · MD2', forceResult:'home' },
  { id:22, home:'Morocco',     away:'Mali',        group:'GROUP D · MD2', forceResult:'home' },
  { id:23, home:'Morocco',     away:'Senegal',     group:'GROUP D · MD3', forceResult:'home' },
  { id:24, home:'Mali',        away:'France',      group:'GROUP D · MD3', forceResult:'home' },
  // GROUP E
  { id:25, home:'Spain',       away:'Japan',       group:'GROUP E · MD1', forceResult:'home' },
  { id:26, home:'S. Korea',    away:'Iraq',        group:'GROUP E · MD1', forceResult:'home' },
  { id:27, home:'Spain',       away:'S. Korea',    group:'GROUP E · MD2', forceResult:'home' },
  { id:28, home:'Japan',       away:'Iraq',        group:'GROUP E · MD2', forceResult:'home' },
  { id:29, home:'Japan',       away:'S. Korea',    group:'GROUP E · MD3', forceResult:'home' },
  { id:30, home:'Iraq',        away:'Spain',       group:'GROUP E · MD3', forceResult:'home' },
];

const PICK_LABELS = ['HOME WIN', 'DRAW', 'AWAY WIN'];
const TIER_NAMES  = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const THRESHOLDS  = [2, 4, 6, 8];

const ABI = [
  'function mint() external',
  'function upgrade() external',
  'function predict(uint256 matchId, uint8 pick) external',
  'function scorePickBatch(address[] calldata players, uint256 matchId, uint8[] calldata picks, uint8 result) external',
  'function playerToken(address) external view returns (uint256)',
  'function correctPicks(address) external view returns (uint8)',
  'function tier(uint256) external view returns (uint8)',
  'function cardIndex(uint256) external view returns (uint8)',
  'function owner() external view returns (address)',
  'event Predicted(address indexed player, uint256 matchId, uint8 pick)',
];
const USDT_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address) external view returns (uint256)',
];
const MINT_PRICE = BigInt('500000'); // 0.5 USDT (6 decimals)

async function getProvider() {
  for (const url of ['https://testrpc.xlayer.tech/terigon', 'https://testrpc.xlayer.tech']) {
    try { const p = new ethers.JsonRpcProvider(url); await p.getBlockNumber(); return p; } catch {}
  }
  throw new Error('All XLayer RPCs failed');
}

// XLayer testnet caps eth_getLogs at 100 blocks per request
async function queryFilterChunked(contract, filter, fromBlock, toBlock, chunkSize = 100) {
  const results = [];
  for (let b = fromBlock; b <= toBlock; b += chunkSize) {
    const logs = await contract.queryFilter(filter, b, Math.min(b + chunkSize - 1, toBlock)).catch(() => []);
    results.push(...logs);
  }
  return results;
}

async function graphQuery(query) {
  const res  = await fetch(GRAPH, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query}) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upsertPlayers(contract, addresses) {
  try {
    const rows = await Promise.all(addresses.map(async addr => {
      try {
        const tokenId = await contract.playerToken(addr);
        if (!tokenId || tokenId === 0n) return null;
        const [tier, cardIndex, correctPicks] = await Promise.all([
          contract.tier(tokenId),
          contract.cardIndex(tokenId),
          contract.correctPicks(addr),
        ]);
        return {
          address:       addr.toLowerCase(),
          token_id:      Number(tokenId),
          tier:          Number(tier),
          card_index:    Number(cardIndex),
          correct_picks: Number(correctPicks),
          updated_at:    new Date().toISOString(),
        };
      } catch { return null; }
    }));
    const valid = rows.filter(Boolean);
    if (!valid.length) return;
    await fetch(`${SUPABASE_URL}/rest/v1/players`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(valid),
    });
  } catch (e) {
    console.log(`  ⚠  Supabase sync failed: ${e.message}`);
  }
}

let _stateScored = [];
function writeState(patch) {
  try {
    const state = { phase:'idle', matchId:null, secondsLeft:0, nextMatchId:null, scored:_stateScored };
    writeFileSync(STATE_FILE, JSON.stringify({ ...state, ...patch, ts: Date.now() }));
  } catch(_) {}
}

function prompt(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, ans => { rl.close(); resolve(ans); });
  });
}

function cls() { process.stdout.write('\x1Bc'); }

function bar(correct, threshold) {
  if (!threshold) return 'â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ LEGENDARY';
  const pct  = Math.min(1, correct / threshold);
  const fill = Math.round(pct * 20);
  return 'â–ˆ'.repeat(fill) + 'â–‘'.repeat(20 - fill) + ` ${correct}/${threshold}`;
}

function randomScore(forceWinner = null) {
  const goals = [0,0,0,1,1,1,1,2,2,2,3,3,4];
  let h = goals[Math.floor(Math.random() * goals.length)];
  let a = goals[Math.floor(Math.random() * goals.length)];
  if (forceWinner === 'home')  { if (h <= a) { h = a + 1; } }
  if (forceWinner === 'away')  { if (a <= h) { a = h + 1; } }
  if (forceWinner === 'draw')  { a = h; }
  const winner = h > a ? 'home' : a > h ? 'away' : 'draw';
  return { h, a, winner, code: ['home','draw','away'].indexOf(winner) };
}

// â”€â”€ SETUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function setup() {
  const ownerKey = process.env.OWNER_KEY;
  if (!ownerKey) { console.error('âŒ  Set OWNER_KEY env var'); process.exit(1); }

  const provider = await getProvider();
  const owner    = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  const contractOwner = await contract.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    console.error(`âŒ  ${owner.address} is not the contract owner`);
    process.exit(1);
  }

  const bal = await provider.getBalance(owner.address);
  console.log(`\nâœ“ Owner: ${owner.address}`);
  console.log(`  Balance: ${ethers.formatEther(bal)} OKB\n`);

  const bots = BOT_KEYS.map(k => new ethers.Wallet(k, provider));

  console.log('Bot wallets:');
  bots.forEach((b, i) => console.log(`  Bot ${i + 1}: ${b.address}`));

  console.log('\nMinting NFTs for bots (USDT)...');
  for (const bot of bots) {
    const tokenId = await contract.playerToken(bot.address);
    if (tokenId > 0n) {
      console.log(`  â†· ${bot.address.slice(0, 10)}... already minted token #${tokenId}`);
      continue;
    }
    const usdt = new ethers.Contract(USDT_CA, USDT_ABI, bot);
    const bal  = await usdt.balanceOf(bot.address);
    if (bal < MINT_PRICE) { console.log(`  âœ— ${bot.address.slice(0, 10)}... insufficient USDT`); continue; }
    const allowance = await usdt.allowance(bot.address, CA);
    if (allowance < MINT_PRICE) {
      const approveTx = await usdt.approve(CA, MINT_PRICE);
      await approveTx.wait();
    }
    const bc = new ethers.Contract(CA, ABI, bot);
    const tx = await bc.mint();
    await tx.wait();
    const newToken = await contract.playerToken(bot.address);
    console.log(`  âœ“ ${bot.address.slice(0, 10)}... â†’ token #${newToken}`);
    await sleep(1000);
  }

  writeFileSync(BOTS_FILE, JSON.stringify({
    bots: bots.map(b => ({ address: b.address, privateKey: b.privateKey })),
  }, null, 2));

  console.log('\nâœ“ Setup complete! bots.json saved.');
  console.log('\nâ”€â”€ NEXT STEPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
  console.log('1. Open the site â†’ mint your NFT â†’ make your predictions');
  console.log('\n2. Then run the tournament (bots predict each match live):');
  console.log('   OWNER_KEY=... PLAYER=<your-address> node demo.js score');
}

// â”€â”€ SCORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function score() {
  const ownerKey    = process.env.OWNER_KEY;
  const playerAddr  = process.env.PLAYER?.toLowerCase();
  const playerKey   = process.env.PLAYER_KEY; // optional â€” enables auto-upgrade for you
  if (!ownerKey)   { console.error('âŒ  Set OWNER_KEY env var'); process.exit(1); }
  if (!playerAddr) console.log('  No PLAYER set -- all wallets scored');

  const provider = await getProvider();
  const owner    = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  const botWallets = BOT_KEYS.map(k => new ethers.Wallet(k, provider));

  // Build signer map: address â†’ wallet (for upgrade calls)
  const signers = {};
  if (playerKey) {
    const pw = new ethers.Wallet(playerKey, provider);
    signers[pw.address.toLowerCase()] = pw;
  }
  for (const bot of botWallets) {
    signers[bot.address.toLowerCase()] = bot;
  }

  // Track who has already been upgraded this session
  const upgraded = new Set();

  async function tryUpgrade(addr, label) {
    if (upgraded.has(addr)) return;
    const tokenId = await contract.playerToken(addr);
    if (tokenId === 0n) return;
    const tierNum  = Number(await contract.tier(tokenId));
    const picks    = Number(await contract.correctPicks(addr));
    const threshold = THRESHOLDS[tierNum];
    if (!threshold || picks < threshold) return;
    const signer = signers[addr];
    if (!signer) return; // no key available
    upgraded.add(addr);
    console.log(`\n  â¬†ï¸  UPGRADE: ${label} hit ${picks}/${threshold} â€” upgrading card...`);
    try {
      const c = new ethers.Contract(CA, ABI, signer);
      const tx = await c.upgrade();
      await tx.wait();
      const newTier = Number(await contract.tier(await contract.playerToken(addr)));
      console.log(`  âœ“  ${label} is now ${TIER_NAMES[newTier]}!\n`);
    } catch(e) {
      console.log(`  âš ï¸  Upgrade failed (already upgraded?): ${e.shortMessage || e.message}\n`);
    }
  }

  let playerCorrect = 0;
  let playerTotal   = 0;
  const results   = [];
  const botPicks  = {};

  // Initial 1-minute countdown before the first match
  const first = DEMO_MATCHES[0];
  console.log(`\n  â³  First match starting in 1 minute: ${first.home.toUpperCase()} vs ${first.away.toUpperCase()}\n`);
  for (let s = 60; s > 0; s--) {
    process.stdout.write(`\r  â³  Match starts in ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}   `);
    writeState({ phase:'break', secondsLeft:s, nextMatchId:first.id });
    await sleep(1000);
  }
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  for (let i = 0; i < DEMO_MATCHES.length; i++) {
    const m    = DEMO_MATCHES[i];
    const next = DEMO_MATCHES[i + 1];

    cls();
    console.log('âš½  GLYPH WC 2026 â€” LIVE SIMULATION\n');
    console.log(`${'â”€'.repeat(52)}`);
    console.log(`  ${m.group} Â· MATCHDAY 1`);
    console.log(`  ${m.home.toUpperCase()}  vs  ${m.away.toUpperCase()}`);
    console.log(`${'â”€'.repeat(52)}\n`);

    // Bot 1 picks randomly â€” result will be forced to match it (always correct)
    // Bot 2 mirrors bot 1 only on match 0 (correct once), picks wrong otherwise
    // Bot 3 does not predict
    const [bot1, bot2] = botWallets;
    const bot1Pick = Math.floor(Math.random() * 3);
    const bot2Pick = i === 0 ? bot1Pick : (bot1Pick + 1) % 3;
    const botsToPredict = [
      { bot: bot1, pick: bot1Pick },
      { bot: bot2, pick: bot2Pick },
    ];
    process.stdout.write('  Bots placing picks... ');
    for (const { bot, pick } of botsToPredict) {
      if (!botPicks[bot.address]) botPicks[bot.address] = {};
      botPicks[bot.address][m.id] = pick;
      try {
        const bc = new ethers.Contract(CA, ABI, new ethers.Wallet(bot.privateKey, provider));
        const tx = await bc.predict(m.id, pick);
        await tx.wait();
        process.stdout.write('.');
      } catch(e) {
        process.stdout.write('âš ');
      }
    }
    console.log(' âœ“\n');

    console.log('  â— MATCH IN PROGRESS...\n');
    for (let s = 60; s > 0; s--) {
      process.stdout.write(`\r  â±  ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')} remaining   `);
      writeState({ phase:'live', matchId:m.id, secondsLeft:s });
      await sleep(1000);
    }
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    // 1. Query chain events directly (reliable, no subgraph lag)
    let preds = [];
    try {
      const latest = await provider.getBlockNumber();
      const filter = contract.filters.Predicted(null, m.id);
      const logs   = await queryFilterChunked(contract, filter, 31435500, latest);
      for (const log of logs) {
        preds.push({ player: log.args.player.toLowerCase(), pick: Number(log.args.pick) });
      }
      console.log(`  chain events: ${preds.length} pick(s) for match ${m.id}`);
    } catch(e) {
      console.log(`  chain query failed: ${e.shortMessage || e.message}`);
    }

    // 2. Supplement with subgraph (catches any the chain query missed)
    try {
      const data = await graphQuery(`{
        predictions(where: { matchId: "${m.id}" }, first: 1000) { player pick }
      }`);
      for (const p of (data.predictions || [])) {
        if (!preds.some(x => x.player === p.player.toLowerCase())) {
          preds.push({ player: p.player.toLowerCase(), pick: Number(p.pick) });
        }
      }
    } catch {}

    // 3. Fill bot picks from memory if still missing
    for (const bot of botWallets) {
      const pick = botPicks?.[bot.address]?.[m.id];
      if (pick !== undefined && !preds.some(x => x.player === bot.address.toLowerCase())) {
        preds.push({ player: bot.address.toLowerCase(), pick });
      }
    }
    // Use forceResult if set on the match, otherwise follow bot 1's pick
    const bot1Addr = bot1.address.toLowerCase();
    const bot1Pred = preds.find(p => p.player.toLowerCase() === bot1Addr)
                  ?? { pick: bot1Pick };
    const forceWinner = m.forceResult ?? ['home','draw','away'][Number(bot1Pred.pick)];
    const { h, a, winner, code } = randomScore(forceWinner);
    const resultLabel = winner === 'draw'
      ? `${h} - ${a}  DRAW`
      : winner === 'home'
        ? `${h} - ${a}  ${m.home.toUpperCase()} WIN`
        : `${h} - ${a}  ${m.away.toUpperCase()} WIN`;

    // Score on-chain
    if (preds.length) {
      const players = preds.map(p => p.player);
      const picks   = preds.map(p => Number(p.pick));
      const tx = await contract.scorePickBatch(players, m.id, picks, code);
      await tx.wait();
      // Sync updated state to Supabase leaderboard
      await upsertPlayers(contract, players);
    }

    // Find player pick
    const playerPred = preds.find(p => p.player.toLowerCase() === playerAddr);
    const playerPick = playerPred ? Number(playerPred.pick) : null;
    const playerHit  = playerPick !== null ? playerPick === code : null;
    if (playerHit === true)  playerCorrect++;
    if (playerPick !== null) playerTotal++;

    results.push({ m, h, a, winner, code, playerPick, playerHit });

    // Update state.json with scored result
    _stateScored = results.map(r => ({
      matchId: r.m.id,
      result: r.code,
      score: `${r.h}-${r.a}`,
      playerPick: r.playerPick,
      playerCorrect: r.playerHit,
    }));
    writeState({ phase:'scored', matchId:m.id, secondsLeft:0 });

    // Show result
    cls();
    console.log('âš½  GLYPH WC 2026 â€” LIVE SIMULATION\n');
    console.log(`${'â”€'.repeat(52)}`);
    console.log(`  ${m.group} Â· MATCHDAY 1`);
    console.log(`  ${m.home.toUpperCase()}  vs  ${m.away.toUpperCase()}`);
    console.log(`${'â”€'.repeat(52)}`);
    console.log(`\n  â¬›  FULL TIME:  ${resultLabel}\n`);

    if (playerHit === true)  console.log('  â˜…  YOUR PICK WAS CORRECT! +1 to your progress bar');
    else if (playerHit === false) console.log(`  âœ—  Your pick: ${PICK_LABELS[playerPick]} â€” wrong`);
    else console.log('  â€”  No pick found for this match');

    // Auto-upgrade bots + player if threshold hit
    for (const bot of botWallets) {
      await tryUpgrade(bot.address.toLowerCase(), bot.address.slice(0, 10) + '...');
    }
    if (playerAddr) await tryUpgrade(playerAddr, 'YOUR CARD');

    // Running tally
    const onChain = playerTotal > 0 ? await contract.correctPicks(playerAddr) : 0n;
    const tierId  = await contract.playerToken(playerAddr);
    let tierNum = 0, threshold = THRESHOLDS[0];
    if (tierId > 0n) { tierNum = Number(await contract.tier(tierId)); threshold = THRESHOLDS[tierNum] ?? null; }

    console.log('\n  YOUR PROGRESS:');
    console.log(`  ${TIER_NAMES[tierNum]} â†’ ${TIER_NAMES[Math.min(4, tierNum + 1)]}`);
    console.log(`  ${bar(Number(onChain), threshold)}\n`);

    if (next) {
      // 15-second result display window before break countdown starts
      for (let s = 15; s > 0; s--) {
        process.stdout.write(`\r  ðŸ“Š  Results showing on site in ${s}s...   `);
        await sleep(1000);
      }
      process.stdout.write('\r' + ' '.repeat(50) + '\r');

      console.log(`\n${'â”€'.repeat(52)}`);
      console.log(`  NEXT UP: ${next.group} Â· ${next.home.toUpperCase()} vs ${next.away.toUpperCase()}`);
      console.log(`${'â”€'.repeat(52)}\n`);
      for (let s = 60; s > 0; s--) {
        process.stdout.write(`\r  â³  Next match in ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}   `);
        writeState({ phase:'break', secondsLeft:s, nextMatchId:next.id });
        await sleep(1000);
      }
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
    }
  }
  writeState({ phase:'done', matchId:null, secondsLeft:0 });

  // Final scoreboard
  cls();
  console.log('âš½  GLYPH WC 2026 â€” SIMULATION COMPLETE\n');
  console.log(`${'â”€'.repeat(52)}`);
  console.log('  MATCH RESULTS RECAP');
  console.log(`${'â”€'.repeat(52)}`);
  for (const r of results) {
    const pickTag = r.playerHit === true ? 'âœ“' : r.playerHit === false ? 'âœ—' : 'â€”';
    const score   = `${r.h}-${r.a}`;
    console.log(`  [${pickTag}] ${r.m.group} MD1  ${r.m.home} ${score} ${r.m.away}`);
  }

  console.log(`\n${'â”€'.repeat(52)}`);
  console.log('  YOUR FINAL STATS');
  console.log(`${'â”€'.repeat(52)}`);

  const onChain = await contract.correctPicks(playerAddr);
  const tierId  = await contract.playerToken(playerAddr);
  let tierNum = 0, threshold = THRESHOLDS[0];
  if (tierId > 0n) { tierNum = Number(await contract.tier(tierId)); threshold = THRESHOLDS[tierNum] ?? null; }

  console.log(`  Tier:     ${TIER_NAMES[tierNum]}`);
  console.log(`  Correct:  ${playerCorrect} / ${playerTotal} this session`);
  console.log(`  Progress: ${bar(Number(onChain), threshold)}`);

  if (upgraded.has(playerAddr)) {
    console.log(`\n  ðŸ†  Card upgraded during the tournament! Check the dashboard.\n`);
  } else if (threshold && Number(onChain) >= threshold) {
    console.log(`\n  ðŸ†  UPGRADE READY! Run: PLAYER_KEY=0x... node demo.js upgrade\n`);
  } else {
    console.log(`\n  Open the dashboard to see your progress bar.\n`);
  }
}

// â”€â”€ UPGRADE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function upgrade() {
  const playerKey = process.env.PLAYER_KEY;
  if (!playerKey) { console.error('âŒ  Set PLAYER_KEY=0x... env var'); process.exit(1); }
  const provider = await getProvider();
  const wallet   = new ethers.Wallet(playerKey, provider);
  const contract = new ethers.Contract(CA, ABI, wallet);
  const tokenId  = await contract.playerToken(wallet.address);
  if (tokenId === 0n) { console.error('âŒ  No card found for this wallet'); process.exit(1); }
  const tierNum   = Number(await contract.tier(tokenId));
  const picks     = Number(await contract.correctPicks(wallet.address));
  const threshold = THRESHOLDS[tierNum];
  console.log(`\n  Card: token #${tokenId}  Tier: ${TIER_NAMES[tierNum]}  Correct picks: ${picks}`);
  if (!threshold) { console.log('  Already LEGENDARY â€” nothing to upgrade.'); return; }
  if (picks < threshold) {
    console.log(`  Need ${threshold - picks} more correct picks to upgrade. (${picks}/${threshold})`);
    return;
  }
  console.log(`  Upgrading ${TIER_NAMES[tierNum]} â†’ ${TIER_NAMES[tierNum + 1]}...`);
  const tx = await contract.upgrade();
  await tx.wait();
  const newToken = await contract.playerToken(wallet.address);
  const newTier  = Number(await contract.tier(newToken));
  console.log(`  âœ“ Upgraded! New tier: ${TIER_NAMES[newTier]}\n`);
}

// â”€â”€ STATUS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function status() {
  const ownerKey   = process.env.OWNER_KEY;
  const playerAddr = process.env.PLAYER;
  if (!ownerKey) { console.error('âŒ  Set OWNER_KEY env var'); process.exit(1); }

  const provider = await getProvider();
  const owner    = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  const addrs = [];
  if (playerAddr) addrs.push({ addr: playerAddr.toLowerCase(), tag: 'YOU  ' });
  BOT_KEYS.map(k => new ethers.Wallet(k)).forEach((b, i) => addrs.push({ addr: b.address.toLowerCase(), tag: `BOT ${i+1}` }));
  if (!addrs.length) { console.log('Set PLAYER=<address> or run setup first.'); return; }

  console.log('\nâ”€â”€ PLAYER STATUS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
  for (const { addr, tag } of addrs) {
    const tokenId = await contract.playerToken(addr);
    if (tokenId === 0n) { console.log(`  [${tag}] ${addr.slice(0,10)}... â€” no card`); continue; }
    const tierNum   = Number(await contract.tier(tokenId));
    const picks     = Number(await contract.correctPicks(addr));
    const threshold = THRESHOLDS[tierNum] ?? null;
    console.log(`  [${tag}] ${addr.slice(0,10)}... ${TIER_NAMES[tierNum].padEnd(9)} ${bar(picks, threshold)}`);
  }
  console.log('');
}

// â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const cmd = process.argv[2];
const cmds = { setup, score, status, upgrade };
if (!cmds[cmd]) {
  console.log(`
Glyph Demo Simulator

  node demo.js setup    Mint bots + make predictions on all 12 matches
  node demo.js score    Run tournament (auto, 2 min/match, 2 min break)
  node demo.js status   Show progress bars for all players
  node demo.js upgrade  Manually upgrade your card if threshold hit

  OWNER_KEY=0x...    private key of contract owner (required)
  PLAYER=0x...       your wallet address (score/status)
  PLAYER_KEY=0x...   your private key â€” enables auto-upgrade mid-demo
`);
} else {
  cmds[cmd]().catch(e => { console.error('âŒ', e.message); process.exit(1); });
}








