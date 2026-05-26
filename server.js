import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'state.json');
const DEMO_SCRIPT = path.join(__dirname, 'scripts', 'demo.js');

let demoProcess = null;
let demoRunning = false;

// In-memory state (Railway has ephemeral filesystem)
let currentState = { phase: 'idle', matchId: null, secondsLeft: 0, nextMatchId: null, scored: [], ts: 0 };

function resetState() {
  currentState = { phase: 'idle', matchId: null, secondsLeft: 0, nextMatchId: null, scored: [], ts: 0 };
  fs.writeFileSync(STATE_FILE, JSON.stringify(currentState));
}

function startDemo(playerAddr) {
  if (demoRunning) return { ok: false, message: 'Demo already running' };
  if (!playerAddr) return { ok: false, message: 'Player address required' };

  resetState();
  demoRunning = true;

  demoProcess = spawn('node', [DEMO_SCRIPT, 'score'], {
    env: { ...process.env, PLAYER: playerAddr },
    cwd: path.join(__dirname, 'scripts'),
  });

  demoProcess.stdout.on('data', d => process.stdout.write(d));
  demoProcess.stderr.on('data', d => process.stderr.write(d));
  demoProcess.on('close', () => { demoRunning = false; demoProcess = null; resetState(); });

  return { ok: true, message: 'Demo started' };
}

function stopDemo() {
  if (!demoRunning || !demoProcess) return { ok: false, message: 'No demo running' };
  demoProcess.kill('SIGTERM');
  demoRunning = false;
  demoProcess = null;
  resetState();
  return { ok: true, message: 'Demo stopped' };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'POST' && pathname === '/start') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let player = '';
      try { player = JSON.parse(body).player || ''; } catch {}
      const result = startDemo(player);
      res.writeHead(result.ok ? 200 : 409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/stop') {
    const result = stopDemo();
    res.writeHead(result.ok ? 200 : 409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: demoRunning }));
    return;
  }

  if (pathname === '/state.json') {
    try {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(currentState));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'glyph-demo' }));
});

server.listen(PORT, () => {
  console.log(`Glyph demo server on port ${PORT}`);
  resetState();
});
