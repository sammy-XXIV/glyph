// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Glyph is ERC721, Ownable, ReentrancyGuard {

    // ── Tiers ──────────────────────────────────────────────────────────────
    uint8 public constant COMMON    = 0;
    uint8 public constant UNCOMMON  = 1;
    uint8 public constant RARE      = 2;
    uint8 public constant EPIC      = 3;
    uint8 public constant LEGENDARY = 4;

    uint8[4] public THRESHOLDS = [2, 4, 6, 8];

    // ── NFT state ──────────────────────────────────────────────────────────
    uint256 public nextTokenId = 1;
    mapping(uint256 => uint8)   public tier;
    mapping(uint256 => uint8)   public cardIndex;
    mapping(address => uint256) public playerToken;
    mapping(address => uint8)   public correctPicks;

    // ── Mint guard: once minted, never again (survives transfer/burn) ──────
    mapping(address => bool) public everMinted;

    // ── Prediction guard: one pick per match per player ───────────────────
    mapping(address => mapping(uint256 => bool)) public hasPredicted;

    // ── Prize pool (USDT) ──────────────────────────────────────────────────
    IERC20  public immutable usdt;
    uint256 public constant MINT_PRICE = 500_000; // 0.5 USDT (6 decimals)
    uint256 public prizePool;
    uint256 public legendaryCount;

    // ── Commit-reveal for match results ────────────────────────────────────
    // Owner commits keccak256(matchId, result, salt) before the match ends,
    // then reveals 2 hours after commitment — giving users time to verify
    // the result against public sources before it's accepted on-chain.
    struct ResultCommit {
        bytes32 commitment;
        uint256 committedAt;
        bool    revealed;
    }
    mapping(uint256 => ResultCommit) public resultCommits;
    uint256 public constant REVEAL_DELAY = 2 hours;

    // ── Metadata ───────────────────────────────────────────────────────────
    string public baseImageUrl;

    // ── Events ─────────────────────────────────────────────────────────────
    event Minted(address indexed player, uint256 tokenId, uint8 tier, uint8 cardIndex);
    event Upgraded(address indexed player, uint256 burnedId, uint256 newId, uint8 newTier);
    event Predicted(address indexed player, uint256 matchId, uint8 pick);
    event PickScored(address indexed player, uint256 matchId, bool correct);
    event PrizeClaimed(address indexed player, uint256 amount);
    event ResultCommitted(uint256 indexed matchId, bytes32 commitment);
    event ResultRevealed(uint256 indexed matchId, uint8 result);

    constructor(address _usdt, string memory _baseImageUrl)
        ERC721("Glyph", "GLYPH")
        Ownable(msg.sender)
    {
        usdt = IERC20(_usdt);
        baseImageUrl = _baseImageUrl;
    }

    // ── Mint ───────────────────────────────────────────────────────────────
    function mint() external {
        require(!everMinted[msg.sender], "Wallet already minted");
        require(usdt.transferFrom(msg.sender, address(this), MINT_PRICE), "USDT transfer failed");
        prizePool += MINT_PRICE;
        everMinted[msg.sender] = true;
        _mintCard(msg.sender, COMMON, 0);
    }

    // ── Upgrade ────────────────────────────────────────────────────────────
    function upgrade() external {
        uint256 tokenId = playerToken[msg.sender];
        require(tokenId != 0 && _ownerOf(tokenId) == msg.sender, "No active card");
        uint8 currentTier = tier[tokenId];
        require(currentTier < LEGENDARY, "Already Legendary");
        require(correctPicks[msg.sender] >= THRESHOLDS[currentTier], "Not enough correct picks");

        correctPicks[msg.sender] = 0;
        playerToken[msg.sender] = 0;

        uint8 newTier = currentTier + 1;
        uint256 newId = _mintCard(msg.sender, newTier, tokenId);
        emit Upgraded(msg.sender, tokenId, newId, newTier);
    }

    // ── Predictions ────────────────────────────────────────────────────────
    function predict(uint256 matchId, uint8 pick) external {
        uint256 tokenId = playerToken[msg.sender];
        require(tokenId != 0 && _ownerOf(tokenId) == msg.sender, "No active card");
        require(pick <= 2, "Invalid pick");
        require(!hasPredicted[msg.sender][matchId], "Already predicted this match");
        hasPredicted[msg.sender][matchId] = true;
        emit Predicted(msg.sender, matchId, pick);
    }

    // ── Score picks (testnet / demo) ───────────────────────────────────────
    // Direct scoring without commit-reveal — kept for demo use.
    function scorePickBatch(
        address[] calldata players,
        uint256   matchId,
        uint8[]   calldata picks,
        uint8     result
    ) external onlyOwner {
        _applyScores(players, picks, matchId, result);
    }

    // ── Commit-reveal scoring (mainnet) ────────────────────────────────────
    // Step 1: call before or right after the match ends.
    // commitment = keccak256(abi.encodePacked(matchId, result, salt))
    function commitResult(uint256 matchId, bytes32 commitment) external onlyOwner {
        require(!resultCommits[matchId].revealed, "Already revealed");
        resultCommits[matchId] = ResultCommit(commitment, block.timestamp, false);
        emit ResultCommitted(matchId, commitment);
    }

    // Step 2: call after REVEAL_DELAY has passed. Scoring is applied here.
    function revealResult(
        address[] calldata players,
        uint256   matchId,
        uint8[]   calldata picks,
        uint8     result,
        bytes32   salt
    ) external onlyOwner {
        ResultCommit storage rc = resultCommits[matchId];
        require(rc.committedAt > 0, "Not committed");
        require(!rc.revealed, "Already revealed");
        require(block.timestamp >= rc.committedAt + REVEAL_DELAY, "Reveal too early");
        require(
            keccak256(abi.encodePacked(matchId, result, salt)) == rc.commitment,
            "Commitment mismatch"
        );
        rc.revealed = true;
        emit ResultRevealed(matchId, result);
        _applyScores(players, picks, matchId, result);
    }

    // ── Prize claim (pull) ─────────────────────────────────────────────────
    function claimPrize() external nonReentrant {
        uint256 tokenId = playerToken[msg.sender];
        require(tokenId != 0 && _ownerOf(tokenId) == msg.sender, "No active card");
        require(tier[tokenId] == LEGENDARY, "Not Legendary");
        require(legendaryCount > 0, "No Legendaries");

        uint256 share = prizePool / legendaryCount;
        prizePool -= share;
        legendaryCount--;

        _burn(tokenId);
        playerToken[msg.sender] = 0;

        require(usdt.transfer(msg.sender, share), "Transfer failed");
        emit PrizeClaimed(msg.sender, share);
    }

    // ── Auto-distribute to all legendary holders (push) ───────────────────
    // Owner supplies the list of legendary holder addresses (from subgraph).
    // Contract verifies each address holds a LEGENDARY token before paying.
    function distribute(address[] calldata holders) external onlyOwner nonReentrant {
        // Count valid legendary holders first
        uint256 count = 0;
        for (uint256 i = 0; i < holders.length; i++) {
            if (_isLegendary(holders[i])) count++;
        }
        require(count > 0, "No valid legendary holders");

        uint256 share = prizePool / count;

        for (uint256 i = 0; i < holders.length; i++) {
            if (!_isLegendary(holders[i])) continue;
            uint256 tokenId = playerToken[holders[i]];
            prizePool      -= share;
            legendaryCount--;
            _burn(tokenId);
            playerToken[holders[i]] = 0;
            require(usdt.transfer(holders[i], share), "Transfer failed");
            emit PrizeClaimed(holders[i], share);
        }
    }

    // ── View helpers ───────────────────────────────────────────────────────
    function isActivePlayer(address player) external view returns (bool) {
        uint256 tokenId = playerToken[player];
        return tokenId != 0 && _ownerOf(tokenId) == player;
    }

    // ── Metadata ───────────────────────────────────────────────────────────
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return string(abi.encodePacked(baseImageUrl, _toString(tokenId)));
    }

    function setBaseImageUrl(string memory url) external onlyOwner {
        baseImageUrl = url;
    }

    // ── Internal ───────────────────────────────────────────────────────────
    function _isLegendary(address player) internal view returns (bool) {
        uint256 tokenId = playerToken[player];
        return tokenId != 0 && _ownerOf(tokenId) == player && tier[tokenId] == LEGENDARY;
    }

    function _applyScores(
        address[] calldata players,
        uint8[]   calldata picks,
        uint256   matchId,
        uint8     result
    ) internal {
        for (uint256 i = 0; i < players.length; i++) {
            bool correct = picks[i] == result;
            if (correct) correctPicks[players[i]]++;
            emit PickScored(players[i], matchId, correct);
        }
    }

    function _mintCard(address to, uint8 _tier, uint256 salt) internal returns (uint256) {
        uint8 idx = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, to, salt, nextTokenId))) % 5);
        uint256 newId = nextTokenId++;
        _safeMint(to, newId);
        tier[newId]      = _tier;
        cardIndex[newId] = idx;
        playerToken[to]  = newId;
        if (_tier == LEGENDARY) legendaryCount++;
        emit Minted(to, newId, _tier, idx);
        return newId;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
