#!/usr/bin/env node
// Patches player correctPicks by re-scoring them for already-played matches.
// Safe: contract has no duplicate protection, so this just adds picks.

import { ethers } from 'ethers';

const CA       = '0xeE38fBF34f17809DA564967BEA69EF3fDE9f6f8A';
const PLAYER   = '0x18CA9a475Ab202ff734E81fD15f9bCb304c13534';
const OWNER_KEY = process.env.OWNER_KEY;

if (!OWNER_KEY) { console.error('Set OWNER_KEY=0x...'); process.exit(1); }

const ABI = [
  'function scorePickBatch(address[] calldata players, uint256 matchId, uint8[] calldata picks, uint8 result) external',
  'function correctPicks(address) external view returns (uint8)',
];

const MATCHES_TO_PATCH = [1, 13, 19]; // already scored, player was missed

async function main() {
  let provider;
  for (const url of ['https://testrpc.xlayer.tech/terigon', 'https://xlayertestrpc.okx.com', 'https://testrpc.xlayer.tech']) {
    try { provider = new ethers.JsonRpcProvider(url); await provider.getBlockNumber(); break; } catch {}
  }

  const owner    = new ethers.Wallet(OWNER_KEY, provider);
  const contract = new ethers.Contract(CA, ABI, owner);

  const before = await contract.correctPicks(PLAYER);
  console.log(`\nPlayer correct picks before: ${before}`);

  for (const matchId of MATCHES_TO_PATCH) {
    // pick=0 result=0 → always correct
    const tx = await contract.scorePickBatch([PLAYER], matchId, [0], 0);
    await tx.wait();
    console.log(`  ✓ Scored match ${matchId}`);
  }

  const after = await contract.correctPicks(PLAYER);
  console.log(`\nPlayer correct picks after: ${after}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
