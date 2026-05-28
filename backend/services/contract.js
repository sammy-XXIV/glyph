const { ethers } = require('ethers');

// Minimal ABI — only what the backend needs to call
const ABI = [
  'function mintCommon(address to) external returns (uint256)',
  'function burnAndUpgrade(uint256 tokenId, address to, uint8 newTier) external returns (uint256)',
  'function getTier(uint256 tokenId) external view returns (uint8)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
];

const TIERS = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

let provider, signer, contract;

function init() {
  provider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC_URL);
  signer = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, signer);
}

async function mintCommon(toAddress) {
  const tx = await contract.mintCommon(toAddress);
  const receipt = await tx.wait();
  // Parse Transfer event to get tokenId
  const transferLog = receipt.logs.find(
    (l) => l.topics[0] === ethers.id('Transfer(address,address,uint256)')
  );
  return BigInt(transferLog.topics[3]).toString();
}

async function burnAndUpgrade(tokenId, toAddress, currentTier) {
  const nextTierIndex = TIERS.indexOf(currentTier) + 1;
  if (nextTierIndex >= TIERS.length) throw new Error('Already Legendary');
  const tx = await contract.burnAndUpgrade(tokenId, toAddress, nextTierIndex);
  const receipt = await tx.wait();
  const transferLog = receipt.logs.find(
    (l) => l.topics[0] === ethers.id('Transfer(address,address,uint256)')
  );
  return {
    newTokenId: BigInt(transferLog.topics[3]).toString(),
    newTier: TIERS[nextTierIndex],
  };
}

module.exports = { init, mintCommon, burnAndUpgrade, TIERS };
