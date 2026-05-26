require('dotenv').config();
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  // USDT on XLayer testnet — update if different
  const USDT_ADDRESS    = process.env.USDT_ADDRESS;
  const BASE_IMAGE_URL  = 'https://lucky-credit-3f16.samsonsamuel531.workers.dev/nft/';

  if (!USDT_ADDRESS) throw new Error('Set USDT_ADDRESS in .env');

  const Glyph = await hre.ethers.getContractFactory('Glyph');
  const glyph = await Glyph.deploy(USDT_ADDRESS, BASE_IMAGE_URL);

  await glyph.waitForDeployment();
  const address = await glyph.getAddress();
  console.log('Glyph deployed to:', address);
  console.log('Add to your .env: CONTRACT_ADDRESS=' + address);
}

main().catch((err) => { console.error(err); process.exit(1); });
