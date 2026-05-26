// Glyph Cloudflare Worker
// Routes: / → chain stats | /fixtures → WC2026 fixtures | /nft/:id → metadata | /nft/:id.svg → SVG card

const RPC      = 'https://testrpc.xlayer.tech/terigon';
const CONTRACT = '0x8DaFD7678Dc6bdc66a82dA50D541c4895757e362';
const BASE_URL = 'https://lucky-credit-3f16.samsonsamuel531.workers.dev';
const IMG_BASE = 'https://sammy-xxiv.github.io/glyph/assets';
const PNG_BASE = 'https://raw.githubusercontent.com/sammy-XXIV/glyph/main/assets/cards';
const FIXTURES = 'https://fixturedownload.com/feed/json/fifa-world-cup-2026';

const CORS = { 'Access-Control-Allow-Origin': '*' };

// ── Card data ─────────────────────────────────────────────────────────────────
const TIER_NAMES = ['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY'];
const THRESHOLDS = [10, 20, 35, 55];

const CARDS = [
  // COMMON (tier 0)
  { id:'nigeria',     name:'NIGERIA',      nation:'Nigeria',      flag:'🇳🇬', img:'nigeria.png',      wc:0, ovr:70 },
  { id:'costarica',   name:'COSTA RICA',   nation:'Costa Rica',   flag:'🇨🇷', img:'costarica.png',    wc:0, ovr:68 },
  { id:'saudi',       name:'SAUDI ARABIA', nation:'Saudi Arabia', flag:'🇸🇦', img:'saudi.png',        wc:0, ovr:67 },
  { id:'cameroon',    name:'CAMEROON',     nation:'Cameroon',     flag:'🇨🇲', img:'cameroon.png',     wc:0, ovr:69 },
  { id:'ghana',       name:'GHANA',        nation:'Ghana',        flag:'🇬🇭', img:'ghana.png',        wc:0, ovr:68 },
  // UNCOMMON (tier 1)
  { id:'mexico',      name:'MEXICO',       nation:'Mexico',       flag:'🇲🇽', img:'mexico.png',       wc:0, ovr:74 },
  { id:'colombia',    name:'COLOMBIA',     nation:'Colombia',     flag:'🇨🇴', img:'colombia.png',     wc:0, ovr:73 },
  { id:'morocco',     name:'MOROCCO',      nation:'Morocco',      flag:'🇲🇦', img:'morocco.png',      wc:0, ovr:75 },
  { id:'switzerland', name:'SWITZERLAND',  nation:'Switzerland',  flag:'🇨🇭', img:'switzerland.png',  wc:0, ovr:72 },
  { id:'denmark',     name:'DENMARK',      nation:'Denmark',      flag:'🇩🇰', img:'denmark.png',      wc:0, ovr:71 },
  // RARE (tier 2)
  { id:'japan',       name:'JAPAN',        nation:'Japan',        flag:'🇯🇵', img:'japan.png',        wc:0, ovr:78 },
  { id:'senegal',     name:'SENEGAL',      nation:'Senegal',      flag:'🇸🇳', img:'senegal.png',      wc:0, ovr:77 },
  { id:'uruguay',     name:'URUGUAY',      nation:'Uruguay',      flag:'🇺🇾', img:'uruguay.png',      wc:2, ovr:80 },
  { id:'usa',         name:'USA',          nation:'USA',          flag:'🇺🇸', img:'usa.png',          wc:0, ovr:76 },
  { id:'croatia',     name:'CROATIA',      nation:'Croatia',      flag:'🇭🇷', img:'croatia.png',      wc:0, ovr:82 },
  // EPIC (tier 3)
  { id:'germany',     name:'GERMANY',      nation:'Germany',      flag:'🇩🇪', img:'germany.jpg',      wc:4, ovr:85 },
  { id:'belgium',     name:'BELGIUM',      nation:'Belgium',      flag:'🇧🇪', img:'belgium.jpg',      wc:0, ovr:84 },
  { id:'netherlands', name:'NETHERLANDS',  nation:'Netherlands',  flag:'🇳🇱', img:'netherlands.jpg',  wc:0, ovr:85 },
  { id:'italy',       name:'ITALY',        nation:'Italy',        flag:'🇮🇹', img:'italy.jpg',        wc:4, ovr:86 },
  { id:'portugal',    name:'PORTUGAL',     nation:'Portugal',     flag:'🇵🇹', img:'portugal.jpg',     wc:0, ovr:87 },
  // LEGENDARY (tier 4)
  { id:'france',      name:'FRANCE',       nation:'France',       flag:'🇫🇷', img:'player.jpg',       wc:2, ovr:91 },
  { id:'brazil',      name:'BRAZIL',       nation:'Brazil',       flag:'🇧🇷', img:'brazil.jpg',       wc:5, ovr:89 },
  { id:'argentina',   name:'ARGENTINA',    nation:'Argentina',    flag:'🇦🇷', img:'argentina.jpg',    wc:3, ovr:92 },
  { id:'england',     name:'ENGLAND',      nation:'England',      flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', img:'england.jpg',     wc:1, ovr:88 },
  { id:'spain',       name:'SPAIN',        nation:'Spain',        flag:'🇪🇸', img:'spain.png',        wc:1, ovr:90 },
];

function getCard(tier, cardIndex) {
  return CARDS[tier * 5 + (cardIndex % 5)];
}

// ── RPC helpers ───────────────────────────────────────────────────────────────
async function ethCall(sig) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call',
      params: [{ to: CONTRACT, data: sig }, 'latest'] }),
  });
  const { result } = await r.json();
  return BigInt(result);
}

async function getTokenData(tokenId) {
  const id = '0x' + tokenId.toString(16).padStart(64, '0');
  const [tier, cardIndex] = await Promise.all([
    ethCall('0x6dda34db' + id.slice(2)), // tier(uint256)
    ethCall('0xca89f4e4' + id.slice(2)), // cardIndex(uint256)
  ]);
  return { tier: Number(tier), cardIndex: Number(cardIndex) };
}

// ── SVG generator ─────────────────────────────────────────────────────────────
function makeSVG(card, tierName, tokenId, score = 0) {
  const COLORS = {
    COMMON:    { color:'#94a3b8', prog0:'#475569', prog1:'#94a3b8', prog2:'#e2e8f0' },
    UNCOMMON:  { color:'#4ade80', prog0:'#15803d', prog1:'#4ade80', prog2:'#bbf7d0' },
    RARE:      { color:'#4d9fff', prog0:'#1a6bcc', prog1:'#4d9fff', prog2:'#bfdbfe' },
    EPIC:      { color:'#c084fc', prog0:'#7c3aed', prog1:'#c084fc', prog2:'#ede9fe' },
    LEGENDARY: { color:'#FFD700', prog0:'#cc9900', prog1:'#FFD700', prog2:'#fef9c3' },
  };
  const c = COLORS[tierName] || COLORS.COMMON;
  const id = 'c' + tokenId;
  const fillW = Math.round(score / 100 * 468);
  const imgUrl = `${IMG_BASE}/${card.img}`;

  return `<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
<defs>
  <clipPath id="cl-${id}"><rect width="500" height="500"/></clipPath>
  <linearGradient id="sh-${id}" gradientUnits="userSpaceOnUse" x1="-250" y1="500" x2="250" y2="0">
    <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
    <stop offset="44%" stop-color="rgba(148,163,184,0.06)"/>
    <stop offset="50%" stop-color="rgba(203,213,225,0.12)"/>
    <stop offset="56%" stop-color="rgba(148,163,184,0.06)"/>
    <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="750,0;-750,0" dur="6s" repeatCount="indefinite"/>
  </linearGradient>
  <linearGradient id="ov-${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="rgba(5,5,16,0)"/>
    <stop offset="45%" stop-color="rgba(5,5,16,0.72)"/>
    <stop offset="100%" stop-color="rgba(5,5,16,0.97)"/>
  </linearGradient>
  <linearGradient id="pg-${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${c.prog0}"/>
    <stop offset="70%" stop-color="${c.prog1}"/>
    <stop offset="100%" stop-color="${c.prog2}"/>
  </linearGradient>
  <filter id="gw-${id}" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur in="SourceGraphic"><animate attributeName="stdDeviation" values="10;22;10" dur="5s" repeatCount="indefinite"/></feGaussianBlur>
  </filter>
</defs>
<image href="${imgUrl}" x="0" y="0" width="500" height="500" preserveAspectRatio="xMidYMid slice" clip-path="url(#cl-${id})"/>
<rect x="0" y="0" width="500" height="500" fill="url(#sh-${id})" clip-path="url(#cl-${id})"/>
<rect x="0" y="270" width="500" height="230" fill="url(#ov-${id})" clip-path="url(#cl-${id})"/>
<text x="16" y="356" font-family="'Bebas Neue',sans-serif" font-size="38" fill="#fff" letter-spacing="2">${card.name}</text>
<line x1="16" y1="368" x2="484" y2="368" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
<text x="16" y="384" font-family="monospace" font-size="8" fill="rgba(255,255,255,0.6)" letter-spacing="2">PREDICTION SCORE</text>
<text x="484" y="384" font-family="monospace" font-size="8" fill="${c.color}" text-anchor="end">${score} / 100</text>
<rect x="16" y="390" width="468" height="8" fill="rgba(255,255,255,0.07)"/>
<rect x="16" y="390" width="${fillW}" height="8" fill="url(#pg-${id})"/>
<text x="16" y="412" font-family="monospace" font-size="7" fill="rgba(255,255,255,0.4)" letter-spacing="1">ROOKIE</text>
<text x="484" y="412" font-family="monospace" font-size="7" fill="rgba(255,255,255,0.4)" text-anchor="end" letter-spacing="1">ORACLE</text>
<line x1="16" y1="424" x2="484" y2="424" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
<text x="16" y="440" font-family="monospace" font-size="8" fill="rgba(255,255,255,0.55)" letter-spacing="1">FIFA WC WINS</text>
<text x="16" y="462" font-family="'Bebas Neue',sans-serif" font-size="24" fill="${c.color}">${card.wc}</text>
<text x="484" y="440" font-family="monospace" font-size="8" fill="rgba(255,255,255,0.55)" text-anchor="end" letter-spacing="1">TEAM OVR</text>
<text x="484" y="462" font-family="'Bebas Neue',sans-serif" font-size="24" fill="${c.color}" text-anchor="end">${card.ovr}</text>
<text x="484" y="492" font-family="monospace" font-size="6.5" fill="rgba(255,255,255,0.18)" text-anchor="end" letter-spacing="1">ERC-721 · #${String(tokenId).padStart(4,'0')}</text>
<rect x="374" y="12" width="112" height="18" rx="4" fill="rgba(0,0,0,0.65)" stroke="${c.color}" stroke-width="0.5" stroke-opacity="0.4"/>
<text x="430" y="25" font-family="monospace" font-size="8.5" fill="${c.color}" text-anchor="middle" letter-spacing="2">${tierName}</text>
<rect x="388" y="36" width="98" height="18" rx="4" fill="rgba(0,0,0,0.6)"/>
<text x="437" y="49" font-family="sans-serif" font-size="10" font-weight="600" fill="#fff" text-anchor="middle">${card.nation} ${card.flag}</text>
<rect x="1" y="1" width="498" height="498" fill="none" stroke="${c.color}" stroke-width="4" filter="url(#gw-${id})" stroke-opacity="0.6">
  <animate attributeName="stroke-opacity" values="0.4;0.8;0.4" dur="5s" repeatCount="indefinite"/>
</rect>
<rect x="1" y="1" width="498" height="498" fill="none" stroke="${c.color}" stroke-width="1.5" stroke-opacity="0.7"/>
</svg>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // /fixtures
    if (path === '/fixtures') {
      const res = await fetch(FIXTURES);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // /nft/:id.svg
    const svgMatch = path.match(/^\/nft\/(\d+)\.svg$/);
    if (svgMatch) {
      const tokenId = parseInt(svgMatch[1]);
      try {
        const { tier, cardIndex } = await getTokenData(tokenId);
        const card = getCard(tier, cardIndex);
        const tierName = TIER_NAMES[tier];
        const svg = makeSVG(card, tierName, tokenId, 0);
        return new Response(svg, {
          headers: { ...CORS, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' },
        });
      } catch (e) {
        return new Response('Not found', { status: 404, headers: CORS });
      }
    }

    // /nft/:id  (metadata JSON)
    const metaMatch = path.match(/^\/nft\/(\d+)$/);
    if (metaMatch) {
      const tokenId = parseInt(metaMatch[1]);
      try {
        const { tier, cardIndex } = await getTokenData(tokenId);
        const card = getCard(tier, cardIndex);
        const tierName = TIER_NAMES[tier];
        const threshold = THRESHOLDS[tier] || null;
        const metadata = {
          name: `Glyph #${tokenId} — ${card.name}`,
          description: `A Glyph prediction card for FIFA World Cup 2026. Tier: ${tierName}.`,
          image: `${PNG_BASE}/glyph_${card.id}_${tierName.toLowerCase()}_1080p.png`,
          animation_url: `${BASE_URL}/nft/${tokenId}.svg`,
          attributes: [
            { trait_type: 'Tier',       value: tierName },
            { trait_type: 'Nation',     value: card.nation },
            { trait_type: 'OVR Rating', value: card.ovr },
            { trait_type: 'WC Wins',    value: card.wc },
            ...(threshold ? [{ trait_type: 'Upgrade Threshold', value: threshold }] : []),
          ],
        };
        return new Response(JSON.stringify(metadata), {
          headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
        });
      } catch (e) {
        return new Response('Not found', { status: 404, headers: CORS });
      }
    }

    // / — chain stats
    try {
      const [pool, nextId, legendary] = await Promise.all([
        ethCall('0x719ce73e'),
        ethCall('0x75794a3c'),
        ethCall('0xce0348c6'),
      ]);
      return new Response(JSON.stringify({
        prizePool:      (Number(pool) / 1e18).toFixed(2),
        totalMinted:    Number(nextId) - 1,
        legendaryCount: Number(legendary),
      }), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  }
};
