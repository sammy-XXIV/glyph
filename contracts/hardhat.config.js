require('@nomicfoundation/hardhat-ethers');
require('dotenv').config();

module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  networks: {
    xlayer_testnet: {
      url: 'https://testrpc.xlayer.tech',
      chainId: 1952,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    xlayer_mainnet: {
      url: 'https://rpc.xlayer.tech',
      chainId: 196,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
