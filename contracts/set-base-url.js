require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('https://testrpc.xlayer.tech/terigon');
  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(
    '0x6d69a00107Ed9d487904700a00E31e657dA8a392',
    ['function setBaseImageUrl(string) external'],
    signer
  );
  const tx = await contract.setBaseImageUrl('https://lucky-credit-3f16.samsonsamuel531.workers.dev/nft/');
  await tx.wait();
  console.log('Done:', tx.hash);
}
main().catch(console.error);
