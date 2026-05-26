require('dotenv').config();
const hre = require('hardhat');

async function main() {
  const CONTRACT = process.env.CONTRACT_ADDRESS;
  if (!CONTRACT) throw new Error('Set CONTRACT_ADDRESS in .env');

  const glyph = await hre.ethers.getContractAt('Glyph', CONTRACT);
  const url = 'https://lucky-credit-3f16.samsonsamuel531.workers.dev/nft/';

  const tx = await glyph.setBaseImageUrl(url);
  await tx.wait();
  console.log('baseImageUrl updated to:', url);
}

main().catch((err) => { console.error(err); process.exit(1); });
