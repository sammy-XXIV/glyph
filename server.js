import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'state.json');
const DEMO_SCRIPT = path.join(__dirname, 'scripts', 'demo.js');

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
};

let demoProcess = null;
let demoRunning = false;
let demoPaused  = false;

let currentState = { phase: 'idle', matchId: null, secondsLeft: 0, nextMatchId: null, scored: [], ts: 0 };

function resetState() {
  currentState = { phase: 'idle', matchId: null, secondsLeft: 0, nextMatchId: null, scored: [], ts: 0 };
  fs.writeFileSync(STATE_FILE, JSON.stringify(currentState));
}

function startDemo(playerAddr) {
  if (demoRunning) return { ok: false, message: 'Demo already running' };

  resetState();
  demoRunning = true;

  const env = { ...process.env };
  if (playerAddr) env.PLAYER = playerAddr;

  demoProcess = spawn('node', [DEMO_SCRIPT, 'score'], {
    env,
    cwd: path.join(__dirname, 'scripts'),
  });

  demoProcess.stdout.on('data', d => process.stdout.write(d));
  demoProcess.stderr.on('data', d => process.stderr.write(d));
  demoProcess.on('close', () => { demoRunning = false; demoPaused = false; demoProcess = null; resetState(); });

  return { ok: true, message: 'Demo started' };
}

function stopDemo() {
  if (!demoRunning || !demoProcess) return { ok: false, message: 'No demo running' };
  demoProcess.kill('SIGTERM');
  demoRunning = false;
  demoPaused  = false;
  demoProcess = null;
  resetState();
  return { ok: true, message: 'Demo stopped' };
}

function pauseDemo() {
  if (!demoRunning || !demoProcess) return { ok: false, message: 'No demo running' };
  if (demoPaused) return { ok: false, message: 'Already paused' };
  try { demoProcess.kill('SIGSTOP'); } catch {}
  demoPaused = true;
  return { ok: true, message: 'Demo paused' };
}

function resumeDemo() {
  if (!demoRunning || !demoProcess) return { ok: false, message: 'No demo running' };
  if (!demoPaused) return { ok: false, message: 'Not paused' };
  try { demoProcess.kill('SIGCONT'); } catch {}
  demoPaused = false;
  return { ok: true, message: 'Demo resumed' };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  if (req.method === 'POST' && pathname === '/pause') {
    const result = pauseDemo();
    res.writeHead(result.ok ? 200 : 409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'POST' && pathname === '/resume') {
    const result = resumeDemo();
    res.writeHead(result.ok ? 200 : 409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: demoRunning, paused: demoPaused }));
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

  // Static file serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  if (!ext) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Glyph demo server on http://localhost:${PORT}`);
  resetState();
});
