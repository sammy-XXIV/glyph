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
4. **Upgrade** — Hit the threshold → keep your old card and mint the next tier
5. **Claim** — Legendary holders split the entire prize pool equally at tournament end

> Tier thresholds and mint pricing are configured for mainnet at launch.

---

## Tech stack

| Layer | Stack |
|-------|-------|
| Smart contract | Solidity (ERC-721 + ERC-20), deployed on XLayer |
| Frontend | Vanilla HTML / CSS / JS — no framework |
| Pick storage | Supabase (instant saves) + on-chain events (fallback) |
| NFT metadata | Cloudflare Worker serving JSON + SVG |
| Hosting | GitHub Pages (auto-deploys from `main`) |

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
└── worker.js           # Cloudflare Worker — NFT metadata
```

---

## License

MIT

