# Glyph — FIFA World Cup 2026 Prediction NFT

**Trade your predictions. Climb the tiers. Split the prize pool.**

Live demo → [sammy-xxiv.github.io/glyph](https://sammy-xxiv.github.io/glyph)

---

## What is Glyph?

Glyph is an on-chain NFT prediction game built around the 2026 FIFA World Cup. Mint a card, predict match outcomes, and climb through five tiers — Common all the way to Legendary. Legendary holders split the prize pool at the end of the tournament.

---

## How it works

1. **Mint** — Pay 0.5 USDT to receive a random Common card (one of 5 designs)
2. **Predict** — Pick Home Win / Draw / Away Win for each match before it kicks off
3. **Score** — Correct picks fill your progress bar
4. **Upgrade** — Hit the threshold → burn your card → mint the next tier
5. **Claim** — Legendary holders split the entire prize pool equally at tournament end

### Tier thresholds

| Tier | Correct picks needed |
|------|----------------------|
| Common → Uncommon | 2 |
| Uncommon → Rare | 4 |
| Rare → Epic | 6 |
| Epic → Legendary | 8 |

---

## Tech stack

| Layer | Stack |
|-------|-------|
| Smart contract | Solidity (ERC-721 + ERC-20), deployed on XLayer testnet |
| Frontend | Vanilla HTML / CSS / JS — no framework |
| Pick storage | Supabase (instant saves) + on-chain events (fallback) |
| NFT metadata | Cloudflare Worker serving JSON + SVG |
| Hosting | GitHub Pages (auto-deploys from `main`) |

---

## Contract

- **Network:** XLayer Testnet (Chain ID 1952)
- **Address:** `0x5dd98E1e55475252E4e6527cdb8182377160300b`
- **USDT:** `0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c`

---

## Project structure

```
glyph/
├── index.html          # Landing page
├── mint.html           # Mint your card
├── predictions.html    # Submit match picks
├── dashboard.html      # Your card + progress bar
├── gallery.html        # All 5 card designs
├── leaderboard.html    # Live standings (Supabase + chain fallback)
├── web3.js             # Shared ethers.js helpers
├── nav.css / nav.js    # Shared nav bar
├── worker.js           # Cloudflare Worker — NFT metadata
└── scripts/
    └── demo.js         # Tournament simulator (owner only)
```

---

## Running the demo

The demo script simulates a live tournament — bots place picks, matches score every 60 seconds, cards auto-upgrade as thresholds are hit.

```bash
cd scripts
npm install

# First time: mint bot wallets
OWNER_KEY=0x... node demo.js setup

# Run the tournament
OWNER_KEY=0x... PLAYER=0x<your-wallet> node demo.js score

# Speed it up (10s matches, 5s breaks)
MATCH_SECS=10 BREAK_SECS=5 OWNER_KEY=0x... PLAYER=0x... node demo.js score
```

---

## Local development

No build step needed. Open any `.html` file directly in a browser, or serve with:

```bash
npx serve .
```

Make sure MetaMask is set to **XLayer Testnet** (Chain ID 1952).

---

## License

MIT

