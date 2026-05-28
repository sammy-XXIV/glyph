// Glyph — shared Web3 module

const GLYPH = (() => {

  const CONTRACT_ADDRESS = '0xbb3AC0CBB5B8164Db2047b3cB26927e7e43B7Bb5';
  const USDT_ADDRESS    = '0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c';
  const XLAYER_TESTNET = {
    chainId: '0x7A0',
    chainName: 'XLayer Testnet',
    rpcUrls: ['https://testrpc.xlayer.tech/terigon', 'https://testrpc.xlayer.tech'],
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    blockExplorerUrls: ['https://www.oklink.com/xlayer-test'],
  };

  const GRAPH_URL = 'https://api.studio.thegraph.com/query/1753846/glyph/v0.0.9';
  const MINT_PRICE = BigInt('500000'); // 0.5 USDT (6 decimals)
  const USDT_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address) external view returns (uint256)',
  ];

  const ABI = [
    'function mint() external',
    'function upgrade() external',
    'function predict(uint256 matchId, uint8 pick) external',
    'function playerToken(address) external view returns (uint256)',
    'function tier(uint256) external view returns (uint8)',
    'function cardIndex(uint256) external view returns (uint8)',
    'function correctPicks(address) external view returns (uint8)',
    'function prizePool() external view returns (uint256)',
    'function nextTokenId() external view returns (uint256)',
    'function legendaryCount() external view returns (uint256)',
    'function claimPrize() external',
    'function isActivePlayer(address) external view returns (bool)',
    'function everMinted(address) external view returns (bool)',
    'function hasPredicted(address, uint256) external view returns (bool)',
  ];

  const TIER_NAMES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  const THRESHOLDS = [2, 4, 6, 8];

  let provider = null;
  let signer   = null;
  let contract = null;
  let wallet   = null;

  // â”€â”€ Detect any injected wallet (MetaMask, OKX, Rabby, etc) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getEthereum() {
    if (window.ethereum) return window.ethereum;
    // EIP-6963: check providers array
    if (window.ethereum?.providers?.length) return window.ethereum.providers[0];
    return null;
  }

  function _setupProvider(eth) {
    provider = new ethers.BrowserProvider(eth);
  }

  // â”€â”€ Connect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function connect() {
    const eth = getEthereum();
    if (!eth) {
      alert('No wallet detected. Open this page inside MetaMask or OKX Wallet browser.');
      return null;
    }

    let accounts;
    try {
      accounts = await eth.request({ method: 'eth_requestAccounts' });
    } catch (e) {
      if (e.code === 4001) return null; // user rejected
      throw e;
    }

    if (!accounts?.length) return null;
    wallet = accounts[0];

    // Switch / add XLayer testnet
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: XLAYER_TESTNET.chainId }],
      });
    } catch (e) {
      if (e.code === 4902 || e.code === -32603) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [XLAYER_TESTNET],
        });
      }
    }

    _setupProvider(eth);
    signer   = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    _updateNavWallet(wallet);

    // Listen for account/chain changes
    eth.on('accountsChanged', (accs) => {
      if (!accs.length) { wallet = null; window.location.href = 'index.html'; }
      else { wallet = accs[0]; _updateNavWallet(wallet); }
    });
    eth.on('chainChanged', () => window.location.reload());

    return wallet;
  }

  // â”€â”€ Get already-connected wallet (no popup) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function getWallet() {
    if (wallet) return wallet;
    const eth = getEthereum();
    if (!eth) return null;
    const accounts = await eth.request({ method: 'eth_accounts' });
    if (!accounts?.length) return null;
    wallet = accounts[0];
    _setupProvider(eth);
    signer   = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    _updateNavWallet(wallet);
    return wallet;
  }

  function _updateNavWallet(addr) {
    const short = addr.slice(0, 6) + '...' + addr.slice(-4);
    // Only update the drawer — nav.js owns wallet-display and manages its dropdown
    const drawer = document.getElementById('drawer-wallet-display');
    if (drawer) drawer.textContent = short;
    // For wallet-display, update only the text node to preserve the dropdown child
    const pill = document.getElementById('wallet-display');
    if (pill) {
      const textNode = [...pill.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = short;
    }
  }

  // â”€â”€ Contract writes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function _ensureContract() {
    if (contract) return;
    const addr = await getWallet();
    if (!addr) throw new Error('Wallet not connected');
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  }

  async function mintCard() {
    await _ensureContract();

    // Make sure we're on XLayer testnet before sending
    const eth = getEthereum();
    const chainId = await eth.request({ method: 'eth_chainId' });
    if (chainId !== XLAYER_TESTNET.chainId) {
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: XLAYER_TESTNET.chainId }] });
      } catch (e) {
        if (e.code === 4902 || e.code === -32603) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [XLAYER_TESTNET] });
        } else {
          throw new Error('Please switch to XLayer Testnet in your wallet and try again.');
        }
      }
      // Re-init signer after chain switch
      provider = new ethers.BrowserProvider(eth);
      signer = await provider.getSigner();
      contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    }

    const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer);
    const balance = await usdt.balanceOf(wallet);
    if (balance < MINT_PRICE) throw new Error('Insufficient USDT balance (need 0.5 USDT)');
    const allowance = await usdt.allowance(wallet, CONTRACT_ADDRESS);
    if (allowance < MINT_PRICE) {
      const approveTx = await usdt.approve(CONTRACT_ADDRESS, MINT_PRICE);
      await approveTx.wait();
    }
    const tx = await contract.mint();
    return tx.wait();
  }

  async function upgradeCard() {
    await _ensureContract();
    const tx = await contract.upgrade();
    return tx.wait();
  }

  async function submitPrediction(matchId, pick) {
    await _ensureContract();
    const tx = await contract.predict(matchId, pick);
    return tx.wait();
  }

  async function claimPrize() {
    await _ensureContract();
    const tx = await contract.claimPrize();
    return tx.wait();
  }

  // â”€â”€ Contract reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function getPlayerData(addr) {
    const eth = getEthereum();
    if (!eth) return null;
    if (!provider) _setupProvider(eth);
    const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const active = await readContract.isActivePlayer(addr);
    if (!active) return null;
    const tokenId = await readContract.playerToken(addr);
    const [t, idx, picks, pool, nextId] = await Promise.all([
      readContract.tier(tokenId),
      readContract.cardIndex(tokenId),
      readContract.correctPicks(addr),
      readContract.prizePool(),
      readContract.nextTokenId(),
    ]);
    return {
      tokenId: tokenId.toString(),
      tier: Number(t),
      tierName: TIER_NAMES[Number(t)],
      cardIndex: Number(idx),
      correctPicks: Number(picks),
      threshold: THRESHOLDS[Number(t)] || null,
      progress: THRESHOLDS[Number(t)] ? Math.min(100, Math.round(Number(picks) / THRESHOLDS[Number(t)] * 100)) : 100,
      prizePool: (Number(pool) / 1e6).toFixed(2),
      totalMinted: (Number(nextId) - 1).toString(),
    };
  }

  async function getChainStats() {
    const RPCS = ['https://testrpc.xlayer.tech/terigon', 'https://xlayertestrpc.okx.com', 'https://testrpc.xlayer.tech'];
    let rpc;
    for (const url of RPCS) {
      try { rpc = new ethers.JsonRpcProvider(url); await rpc.getBlockNumber(); break; } catch { rpc = null; }
    }
    if (!rpc) throw new Error('No RPC available');
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpc);
    const [pool, nextId, legendary] = await Promise.all([
      c.prizePool(), c.nextTokenId(), c.legendaryCount(),
    ]);
    return {
      prizePool: (Number(pool) / 1e6).toFixed(2),
      totalMinted: Number(nextId) - 1,
      legendaryCount: Number(legendary),
    };
  }

  // â”€â”€ The Graph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function graphQuery(query) {
    const res = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  }

  async function getLeaderboard() {
    const data = await graphQuery(`{
      players(first: 50, orderBy: correctPicks, orderDirection: desc) {
        id tier cardIndex correctPicks totalPicks
      }
    }`);
    return data.players;
  }

  async function getLeaderboardChain(addresses) {
    const RPCS = ['https://testrpc.xlayer.tech/terigon', 'https://xlayertestrpc.okx.com', 'https://testrpc.xlayer.tech'];
    let rpc;
    for (const url of RPCS) {
      try { rpc = new ethers.JsonRpcProvider(url); await rpc.getBlockNumber(); break; } catch { rpc = null; }
    }
    if (!rpc) throw new Error('No RPC available');
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, rpc);

    const results = await Promise.all(addresses.map(async (addr) => {
      try {
        const tokenId = await c.playerToken(addr);
        if (tokenId === 0n) return null;
        const [t, picks] = await Promise.all([c.tier(tokenId), c.correctPicks(addr)]);
        return { id: addr, tier: t.toString(), correctPicks: picks.toString() };
      } catch { return null; }
    }));

    return results
      .filter(Boolean)
      .sort((a, b) => Number(b.correctPicks) - Number(a.correctPicks));
  }

  async function getMyPredictions(addr) {
    const data = await graphQuery(`{
      predictions(where: { player: "${addr.toLowerCase()}" }, orderBy: submittedAt, orderDirection: desc) {
        matchId pick isCorrect submittedAt
      }
    }`);
    return data.predictions;
  }

  return {
    connect, getWallet, getPlayerData, getChainStats,
    mintCard, upgradeCard, submitPrediction, claimPrize,
    getLeaderboard, getLeaderboardChain, getMyPredictions, graphQuery,
    TIER_NAMES, THRESHOLDS,
  };
})();





