#!/usr/bin/env node
// Glyph demo simulator
// Usage:
//   OWNER_KEY=0x... node demo.js setup               → generate bots, fund, mint, predict
//   OWNER_KEY=0x... PLAYER=0x... node demo.js score  → run tournament match by match
//   OWNER_KEY=0x... PLAYER=0x... node demo.js status → show progress bars

import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import readline from 'readline';

const CA         = '0x8DaFD7678Dc6bdc66a82dA50D541c4895757e362';
const USDT_CA    = '0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c';
const GRAPH      = 'https://api.studio.thegraph.com/query/1753846/glyph/v0.0.4';
const BOT_KEYS   = [
  '0x583dc5b9dc11530013bd427b8831aca5bbaddc3e4ce74fc0ad943dadcd461878',
  '0x1a55a9daad0d9fc46ce8bdaa33df0f2f734cd3a6e8a223f0bb9bbd4c470f7177',
  '0xca1f9afcbb361936933a0442464811b7bdebceb37986e47b25fabc647a905e06',
];
const BOTS_FILE  = './bots.json';
const STATE_FILE = '../state.json';

const DEMO_MATCHES = [
  { id:1,  home:'USA',       away:'Mexico',    group:'GROUP A · MD1', forceResult:'home' },
  { id:2,  home:'Canada',    away:'Panama',    group:'GROUP A · MD1' },
  { id:14, home:'Paraguay',  away:'Venezuela', group:'GROUP C · MD1' },
  { id:20, home:'Senegal',   away:'Mali',      group:'GROUP D · MD1' },
];

const PICK_LABELS = ['HOME WIN', 'DRAW', 'AWAY WIN'];
const TIER_NAMES  = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const THRESHOLDS  = [10, 20, 35, 55];

const ABI = [
  'function mint() external',
  'function upgrade() external',
  'function predict(uint256 matchId, uint8 pick) external',
  'function scorePickBatch(address[] calldata players, uint256 matchId, uint8[] calldata picks, uint8 result) external',
  'function playerToken(address) external view returns (uint256)',
  'function correctPicks(address) external view returns (uint8)',
  'function tier(uint256) external view returns (uint8)',
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
  for (const url of ['https://testrpc.xlayer.tech/terigon', 'https://xlayertestrpc.okx.com', 'https://testrpc.xlayer.tech']) {
    try { const p = new ethers.JsonRpcProvider(url); await p.getBlockNumber(); return p; } catch {}
  }
  throw new Error('All XLayer RPCs failed');
}

async function graphQuery(query) {
  const res  = await fetch(GRAPH, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query}) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  if (!threshold) return '██████████ LEGENDARY';
  const pct  = Math.min(1, correct / threshold);
  const fill = Math.round(pct * 20);
  return '█'.repeat(fill) + '░'.repeat(20 - fill) + ` ${correct}/${threshold}`;
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

// ── SETUP ─────────────────────────────────────────────────────────────────
async function setup() {
  const ownerKey = process.env.OWNER_KEY;
  if (!ownerKey) { console.error('❌  Set OWNER_KEY env var'); process.exit(1); }

  const provider = await getProvider();
  const owner    = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  const contractOwner = await contract.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    console.error(`❌  ${owner.address} is not the contract owner`);
    process.exit(1);
  }

  const bal = await provider.getBalance(owner.address);
  console.log(`\n✓ Owner: ${owner.address}`);
  console.log(`  Balance: ${ethers.formatEther(bal)} OKB\n`);

  const bots = BOT_KEYS.map(k => new ethers.Wallet(k, provider));

  console.log('Bot wallets:');
  bots.forEach((b, i) => console.log(`  Bot ${i + 1}: ${b.address}`));

  console.log('\nMinting NFTs for bots (USDT)...');
  for (const bot of bots) {
    const tokenId = await contract.playerToken(bot.address);
    if (tokenId > 0n) {
      console.log(`  ↷ ${bot.address.slice(0, 10)}... already minted token #${tokenId}`);
      continue;
    }
    const usdt = new ethers.Contract(USDT_CA, USDT_ABI, bot);
    const bal  = await usdt.balanceOf(bot.address);
    if (bal < MINT_PRICE) { console.log(`  ✗ ${bot.address.slice(0, 10)}... insufficient USDT`); continue; }
    const allowance = await usdt.allowance(bot.address, CA);
    if (allowance < MINT_PRICE) {
      const approveTx = await usdt.approve(CA, MINT_PRICE);
      await approveTx.wait();
    }
    const bc = new ethers.Contract(CA, ABI, bot);
    const tx = await bc.mint();
    await tx.wait();
    const newToken = await contract.playerToken(bot.address);
    console.log(`  ✓ ${bot.address.slice(0, 10)}... → token #${newToken}`);
    await sleep(1000);
  }

  writeFileSync(BOTS_FILE, JSON.stringify({
    bots: bots.map(b => ({ address: b.address, privateKey: b.privateKey })),
  }, null, 2));

  console.log('\n✓ Setup complete! bots.json saved.');
  console.log('\n── NEXT STEPS ───────────────────────────────────────────────');
  console.log('1. Open the site → mint your NFT → make your predictions');
  console.log('\n2. Then run the tournament (bots predict each match live):');
  console.log('   OWNER_KEY=... PLAYER=<your-address> node demo.js score');
}

// ── SCORE ─────────────────────────────────────────────────────────────────
async function score() {
  const ownerKey    = process.env.OWNER_KEY;
  const playerAddr  = process.env.PLAYER?.toLowerCase();
  const playerKey   = process.env.PLAYER_KEY; // optional — enables auto-upgrade for you
  if (!ownerKey)   { console.error('❌  Set OWNER_KEY env var'); process.exit(1); }
  if (!playerAddr) { console.error('❌  Set PLAYER=<your-wallet> env var'); process.exit(1); }
  if (!existsSync(BOTS_FILE)) { console.error('❌  Run setup first'); process.exit(1); }

  const state    = JSON.parse(readFileSync(BOTS_FILE));
  const provider = await getProvider();
  const owner    = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  // Build signer map: address → wallet (for upgrade calls)
  const signers = {};
  if (playerKey) {
    const pw = new ethers.Wallet(playerKey, provider);
    signers[pw.address.toLowerCase()] = pw;
  }
  for (const bot of state.bots) {
    signers[bot.address.toLowerCase()] = new ethers.Wallet(bot.privateKey, provider);
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
    console.log(`\n  ⬆️  UPGRADE: ${label} hit ${picks}/${threshold} — upgrading card...`);
    try {
      const c = new ethers.Contract(CA, ABI, signer);
      const tx = await c.upgrade();
      await tx.wait();
      const newTier = Number(await contract.tier(await contract.playerToken(addr)));
      console.log(`  ✓  ${label} is now ${TIER_NAMES[newTier]}!\n`);
    } catch(e) {
      console.log(`  ⚠️  Upgrade failed (already upgraded?): ${e.shortMessage || e.message}\n`);
    }
  }

  let playerCorrect = 0;
  let playerTotal   = 0;
  const results = [];

  // Initial 2-minute countdown before the first match
  const first = DEMO_MATCHES[0];
  console.log(`\n  ⏳  First match starting in 2 minutes: ${first.home.toUpperCase()} vs ${first.away.toUpperCase()}\n`);
  for (let s = 120; s > 0; s--) {
    process.stdout.write(`\r  ⏳  Match starts in ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}   `);
    writeState({ phase:'break', secondsLeft:s, nextMatchId:first.id });
    await sleep(1000);
  }
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  for (let i = 0; i < DEMO_MATCHES.length; i++) {
    const m    = DEMO_MATCHES[i];
    const next = DEMO_MATCHES[i + 1];

    cls();
    console.log('⚽  GLYPH WC 2026 — LIVE SIMULATION\n');
    console.log(`${'─'.repeat(52)}`);
    console.log(`  ${m.group} · MATCHDAY 1`);
    console.log(`  ${m.home.toUpperCase()}  vs  ${m.away.toUpperCase()}`);
    console.log(`${'─'.repeat(52)}\n`);

    // Bot 1 picks randomly — result will be forced to match it (always correct)
    // Bot 2 mirrors bot 1 only on match 0 (correct once), picks wrong otherwise
    // Bot 3 does not predict
    if (!state.botPicks) state.botPicks = {};
    const [bot1, bot2] = state.bots;
    const bot1Pick = Math.floor(Math.random() * 3);
    const bot2Pick = i === 0 ? bot1Pick : (bot1Pick + 1) % 3;
    const botsToPredict = [
      { bot: bot1, pick: bot1Pick },
      { bot: bot2, pick: bot2Pick },
    ];
    process.stdout.write('  Bots placing picks... ');
    for (const { bot, pick } of botsToPredict) {
      if (!state.botPicks[bot.address]) state.botPicks[bot.address] = {};
      state.botPicks[bot.address][m.id] = pick;
      try {
        const bc = new ethers.Contract(CA, ABI, new ethers.Wallet(bot.privateKey, provider));
        const tx = await bc.predict(m.id, pick);
        await tx.wait();
        process.stdout.write('.');
      } catch(e) {
        process.stdout.write('⚠');
      }
    }
    console.log(' ✓\n');

    console.log('  ● MATCH IN PROGRESS...\n');
    for (let s = 120; s > 0; s--) {
      process.stdout.write(`\r  ⏱  ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')} remaining   `);
      writeState({ phase:'live', matchId:m.id, secondsLeft:s });
      await sleep(1000);
    }
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    // Fetch all predictions from The Graph (or fall back)
    let preds = [];
    try {
      const data = await graphQuery(`{
        predictions(where: { matchId: "${m.id}" }, first: 1000) { player pick }
      }`);
      preds = data.predictions || [];
    } catch {}

    if (!preds.length) {
      // fallback: subgraph unavailable — use picks we just submitted (bots only)
      for (const bot of state.bots) {
        const pick = state.botPicks?.[bot.address]?.[m.id];
        if (pick !== undefined) preds.push({ player: bot.address.toLowerCase(), pick });
      }
    }

    // Chain fallback: if player's pick is missing from subgraph, query event logs
    const playerInPreds = preds.some(p => p.player.toLowerCase() === playerAddr);
    if (!playerInPreds) {
      try {
        const filter = contract.filters.Predicted(playerAddr);
        const logs = await contract.queryFilter(filter);
        const log = logs.find(l => Number(l.args.matchId) === m.id);
        if (log) {
          preds.push({ player: playerAddr, pick: Number(log.args.pick) });
          console.log(`  ℹ️  Loaded your pick from chain events (subgraph lag)`);
        }
      } catch(e) {
        console.log(`  ⚠️  Could not query chain events: ${e.shortMessage || e.message}`);
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
    console.log('⚽  GLYPH WC 2026 — LIVE SIMULATION\n');
    console.log(`${'─'.repeat(52)}`);
    console.log(`  ${m.group} · MATCHDAY 1`);
    console.log(`  ${m.home.toUpperCase()}  vs  ${m.away.toUpperCase()}`);
    console.log(`${'─'.repeat(52)}`);
    console.log(`\n  ⬛  FULL TIME:  ${resultLabel}\n`);

    if (playerHit === true)  console.log('  ★  YOUR PICK WAS CORRECT! +1 to your progress bar');
    else if (playerHit === false) console.log(`  ✗  Your pick: ${PICK_LABELS[playerPick]} — wrong`);
    else console.log('  —  No pick found for this match');

    // Auto-upgrade bots + player if threshold hit
    for (const bot of state.bots) {
      await tryUpgrade(bot.address.toLowerCase(), bot.address.slice(0, 10) + '...');
    }
    await tryUpgrade(playerAddr, 'YOUR CARD');

    // Running tally
    const onChain = playerTotal > 0 ? await contract.correctPicks(playerAddr) : 0n;
    const tierId  = await contract.playerToken(playerAddr);
    let tierNum = 0, threshold = THRESHOLDS[0];
    if (tierId > 0n) { tierNum = Number(await contract.tier(tierId)); threshold = THRESHOLDS[tierNum] ?? null; }

    console.log('\n  YOUR PROGRESS:');
    console.log(`  ${TIER_NAMES[tierNum]} → ${TIER_NAMES[Math.min(4, tierNum + 1)]}`);
    console.log(`  ${bar(Number(onChain), threshold)}\n`);

    if (next) {
      // 15-second result display window before break countdown starts
      for (let s = 15; s > 0; s--) {
        process.stdout.write(`\r  📊  Results showing on site in ${s}s...   `);
        await sleep(1000);
      }
      process.stdout.write('\r' + ' '.repeat(50) + '\r');

      console.log(`\n${'─'.repeat(52)}`);
      console.log(`  NEXT UP: ${next.group} · ${next.home.toUpperCase()} vs ${next.away.toUpperCase()}`);
      console.log(`${'─'.repeat(52)}\n`);
      for (let s = 120; s > 0; s--) {
        process.stdout.write(`\r  ⏳  Next match in ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}   `);
        writeState({ phase:'break', secondsLeft:s, nextMatchId:next.id });
        await sleep(1000);
      }
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
    }
  }
  writeState({ phase:'done', matchId:null, secondsLeft:0 });

  // Final scoreboard
  cls();
  console.log('⚽  GLYPH WC 2026 — SIMULATION COMPLETE\n');
  console.log(`${'─'.repeat(52)}`);
  console.log('  MATCH RESULTS RECAP');
  console.log(`${'─'.repeat(52)}`);
  for (const r of results) {
    const pickTag = r.playerHit === true ? '✓' : r.playerHit === false ? '✗' : '—';
    const score   = `${r.h}-${r.a}`;
    console.log(`  [${pickTag}] ${r.m.group} MD1  ${r.m.home} ${score} ${r.m.away}`);
  }

  console.log(`\n${'─'.repeat(52)}`);
  console.log('  YOUR FINAL STATS');
  console.log(`${'─'.repeat(52)}`);

  const onChain = await contract.correctPicks(playerAddr);
  const tierId  = await contract.playerToken(playerAddr);
  let tierNum = 0, threshold = THRESHOLDS[0];
  if (tierId > 0n) { tierNum = Number(await contract.tier(tierId)); threshold = THRESHOLDS[tierNum] ?? null; }

  console.log(`  Tier:     ${TIER_NAMES[tierNum]}`);
  console.log(`  Correct:  ${playerCorrect} / ${playerTotal} this session`);
  console.log(`  Progress: ${bar(Number(onChain), threshold)}`);

  if (upgraded.has(playerAddr)) {
    console.log(`\n  🏆  Card upgraded during the tournament! Check the dashboard.\n`);
  } else if (threshold && Number(onChain) >= threshold) {
    console.log(`\n  🏆  UPGRADE READY! Run: PLAYER_KEY=0x... node demo.js upgrade\n`);
  } else {
    console.log(`\n  Open the dashboard to see your progress bar.\n`);
  }
}

// ── UPGRADE ───────────────────────────────────────────────────────────────
async function upgrade() {
  const playerKey = process.env.PLAYER_KEY;
  if (!playerKey) { console.error('❌  Set PLAYER_KEY=0x... env var'); process.exit(1); }
  const provider = await getProvider();
  const wallet   = new ethers.Wallet(playerKey, provider);
  const contract = new ethers.Contract(CA, ABI, wallet);
  const tokenId  = await contract.playerToken(wallet.address);
  if (tokenId === 0n) { console.error('❌  No card found for this wallet'); process.exit(1); }
  const tierNum   = Number(await contract.tier(tokenId));
  const picks     = Number(await contract.correctPicks(wallet.address));
  const threshold = THRESHOLDS[tierNum];
  console.log(`\n  Card: token #${tokenId}  Tier: ${TIER_NAMES[tierNum]}  Correct picks: ${picks}`);
  if (!threshold) { console.log('  Already LEGENDARY — nothing to upgrade.'); return; }
  if (picks < threshold) {
    console.log(`  Need ${threshold - picks} more correct picks to upgrade. (${picks}/${threshold})`);
    return;
  }
  console.log(`  Upgrading ${TIER_NAMES[tierNum]} → ${TIER_NAMES[tierNum + 1]}...`);
  const tx = await contract.upgrade();
  await tx.wait();
  const newToken = await contract.playerToken(wallet.address);
  const newTier  = Number(await contract.tier(newToken));
  console.log(`  ✓ Upgraded! New tier: ${TIER_NAMES[newTier]}\n`);
}

// ── STATUS ────────────────────────────────────────────────────────────────
async function status() {
  const ownerKey   = process.env.OWNER_KEY;
  const playerAddr = process.env.PLAYER;
  if (!ownerKey) { console.error('❌  Set OWNER_KEY env var'); process.exit(1); }

  const provider = await getProvider();
  const owner    = new ethers.Wallet(ownerKey, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  const addrs = [];
  if (playerAddr) addrs.push({ addr: playerAddr.toLowerCase(), tag: 'YOU  ' });
  if (existsSync(BOTS_FILE)) {
    const state = JSON.parse(readFileSync(BOTS_FILE));
    state.bots.forEach((b, i) => addrs.push({ addr: b.address.toLowerCase(), tag: `BOT ${i+1}` }));
  }
  if (!addrs.length) { console.log('Set PLAYER=<address> or run setup first.'); return; }

  console.log('\n── PLAYER STATUS ───────────────────────────────────────');
  for (const { addr, tag } of addrs) {
    const tokenId = await contract.playerToken(addr);
    if (tokenId === 0n) { console.log(`  [${tag}] ${addr.slice(0,10)}... — no card`); continue; }
    const tierNum   = Number(await contract.tier(tokenId));
    const picks     = Number(await contract.correctPicks(addr));
    const threshold = THRESHOLDS[tierNum] ?? null;
    console.log(`  [${tag}] ${addr.slice(0,10)}... ${TIER_NAMES[tierNum].padEnd(9)} ${bar(picks, threshold)}`);
  }
  console.log('');
}

// ── MAIN ──────────────────────────────────────────────────────────────────
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
  PLAYER_KEY=0x...   your private key — enables auto-upgrade mid-demo
`);
} else {
  cmds[cmd]().catch(e => { console.error('❌', e.message); process.exit(1); });
}
