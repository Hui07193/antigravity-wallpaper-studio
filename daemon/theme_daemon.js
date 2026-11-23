#!/usr/bin/env node
'use strict';

/**
 * Antigravity Custom Theme Daemon (Windows / macOS / Linux)
 * Connects to Antigravity CDP (DevToolsActivePort), injects dist/theme_payload.js,
 * persists user theme preferences in theme_config.json, and hot-reloads on rebuild.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

if (typeof globalThis.WebSocket !== 'function') {
    console.error('[theme-daemon] Node.js >= 22 with built-in WebSocket is required.');
    process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PAYLOAD_PATH = path.join(DIST_DIR, 'theme_payload.js');
const LOG_FILE = path.join(ROOT_DIR, 'daemon.log');
const DEFAULT_CONFIG = {};
const MEDIA_PORT = parseInt(process.env.AGY_MEDIA_PORT || '47321', 10);

function discoverSteamWorkshopDirs() {
    const steamRoots = new Set();
    const workshopDirs = new Set();

    if (process.env.AGY_STEAM_WORKSHOP_DIR) {
        workshopDirs.add(process.env.AGY_STEAM_WORKSHOP_DIR);
    }

    if (process.platform === 'win32') {
        // 1. Query Windows Registry for the user's exact Steam install path
        try {
            const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 2000,
            });
            const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
            if (m && m[1]) {
                steamRoots.add(path.normalize(m[1].trim()));
            }
        } catch (_) {}

        // 2. Fallback common Windows Steam roots across drives
        for (const drive of ['C', 'D', 'E', 'F', 'G']) {
            steamRoots.add(`${drive}:\\Program Files (x86)\\Steam`);
            steamRoots.add(`${drive}:\\Program Files\\Steam`);
            steamRoots.add(`${drive}:\\Steam`);
            steamRoots.add(`${drive}:\\SteamLibrary`);
        }
    } else if (process.platform === 'darwin') {
        steamRoots.add(path.join(os.homedir(), 'Library', 'Application Support', 'Steam'));
    } else {
        steamRoots.add(path.join(os.homedir(), '.local', 'share', 'Steam'));
        steamRoots.add(path.join(os.homedir(), '.steam', 'steam'));
    }

    // 3. Parse libraryfolders.vdf in every found Steam root to discover all secondary SteamLibrary drives
    const allLibraries = new Set(steamRoots);
    for (const root of steamRoots) {
        const vdfCandidates = [
            path.join(root, 'steamapps', 'libraryfolders.vdf'),
            path.join(root, 'config', 'libraryfolders.vdf'),
        ];
        for (const vdfPath of vdfCandidates) {
            if (!fs.existsSync(vdfPath)) continue;
            try {
                const raw = fs.readFileSync(vdfPath, 'utf8');
                const pathMatches = raw.matchAll(/"path"\s+"([^"]+)"/gi);
                for (const match of pathMatches) {
                    const libPath = path.normalize(match[1].replace(/\\\\/g, '\\'));
                    if (libPath) allLibraries.add(libPath);
                }
            } catch (_) {}
        }
    }

    for (const lib of allLibraries) {
        const ws = path.join(lib, 'steamapps', 'workshop', 'content', '431960');
        if (fs.existsSync(ws)) workshopDirs.add(ws);
    }

    return Array.from(workshopDirs);
}

function scanSteamVideos() {
    const candidates = discoverSteamWorkshopDirs();
    const results = [];
    const seen = new Set();
    for (const root of candidates) {
        if (!fs.existsSync(root)) continue;
        let entries;
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        } catch (_) {
            continue;
        }
        for (const ent of entries) {
            if (!ent.isDirectory() || seen.has(ent.name)) continue;
            const itemDir = path.join(root, ent.name);
            let files;
            try {
                files = fs.readdirSync(itemDir);
            } catch (_) {
                continue;
            }
            const videoFile = files.find((f) => /\.(mp4|webm)$/i.test(f));
            if (!videoFile) continue;
            let title = ent.name;
            const projPath = path.join(itemDir, 'project.json');
            if (fs.existsSync(projPath)) {
                try {
                    const proj = JSON.parse(fs.readFileSync(projPath, 'utf8').replace(/^\uFEFF/, ''));
                    if (proj && proj.title) title = String(proj.title).trim();
                } catch (_) {}
            }
            const fullPath = path.join(itemDir, videoFile);
            let sizeMB = 0;
            try {
                sizeMB = Math.round((fs.statSync(fullPath).size / (1024 * 1024)) * 10) / 10;
            } catch (_) {}
            seen.add(ent.name);
            results.push({
                id: ent.name,
                title,
                file: videoFile,
                fullPath,
                sizeMB,
                url: `http://127.0.0.1:${MEDIA_PORT}/video/${encodeURIComponent(ent.name)}`,
            });
        }
    }
    results.sort((a, b) => a.title.localeCompare(b.title));
    return results;
}

let mediaServer = null;
function startMediaServer() {
    if (mediaServer) return;
    mediaServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${MEDIA_PORT}`);
        if (reqUrl.pathname === '/api/videos') {
            const list = scanSteamVideos().map(({ fullPath, ...pub }) => pub);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(list));
            return;
        }

        if (reqUrl.pathname.startsWith('/video/')) {
            const id = decodeURIComponent(reqUrl.pathname.slice('/video/'.length));
            const match = scanSteamVideos().find((v) => v.id === id);
            if (!match || !fs.existsSync(match.fullPath)) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const stat = fs.statSync(match.fullPath);
            const total = stat.size;
            const contentType = /\.webm$/i.test(match.fullPath) ? 'video/webm' : 'video/mp4';
            const range = req.headers.range;
            if (range) {
                const m = range.match(/bytes=(\d*)-(\d*)/);
                const start = m && m[1] ? parseInt(m[1], 10) : 0;
                const end = m && m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
                if (start >= total || start > end) {
                    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
                    res.end();
                    return;
                }
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${total}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': contentType,
                });
                fs.createReadStream(match.fullPath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Accept-Ranges': 'bytes',
                    'Content-Length': total,
                    'Content-Type': contentType,
                });
                fs.createReadStream(match.fullPath).pipe(res);
            }
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });
    mediaServer.on('error', (err) => {
        log(`Media server error on port ${MEDIA_PORT}: ${err.message}`);
    });
    mediaServer.listen(MEDIA_PORT, '127.0.0.1', () => {
        log(`Steam video media server listening on http://127.0.0.1:${MEDIA_PORT}`);
    });
}

function resolvePortFile() {
    if (process.env.AGY_PORT_FILE) {
        return process.env.AGY_PORT_FILE;
    }

    const home = os.homedir();
    let candidates;
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        candidates = [
            path.join(appData, 'antigravity', 'DevToolsActivePort'),
            path.join(appData, 'Antigravity', 'DevToolsActivePort'),
        ];
    } else if (process.platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support');
        candidates = [
            path.join(appSupport, 'antigravity', 'DevToolsActivePort'),
            path.join(appSupport, 'Antigravity', 'DevToolsActivePort'),
        ];
    } else {
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
        candidates = [
            path.join(xdgConfig, 'antigravity', 'DevToolsActivePort'),
            path.join(xdgConfig, 'Antigravity', 'DevToolsActivePort'),
        ];
    }

    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
            fs.writeFileSync(LOG_FILE, '');
        }
        fs.appendFileSync(LOG_FILE, line);
    } catch (_) {}
    if (process.stdout.isTTY || process.env.AGY_DAEMON_STDOUT === '1') {
        process.stdout.write(line);
    }
}

function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function acquirePidLock() {
    if (fs.existsSync(PID_FILE)) {
        const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
        if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
            log(`Another daemon instance is already running (PID ${existingPid}). Exiting.`);
            process.exit(0);
        }
    }
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

function removePidLock() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (_) {}
}

function readConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
            if (parsed && typeof parsed === 'object') {
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        }
    } catch (err) {
        log(`Failed reading theme_config.json: ${err.message}`);
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(next) {
    try {
        const merged = { ...readConfig(), ...next };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
        return merged;
    } catch (err) {
        log(`Failed saving theme_config.json: ${err.message}`);
        return null;
    }
}

let missingPayloadLogged = false;
function buildInjectedSource() {
    if (!fs.existsSync(PAYLOAD_PATH)) {
        if (!missingPayloadLogged) {
            log(`Payload not built yet (${PAYLOAD_PATH}). Run: python scripts/build_payload.py`);
            missingPayloadLogged = true;
        }
        return null;
    }
    missingPayloadLogged = false;

    const cfgJson = JSON.stringify(readConfig());
    const videosJson = JSON.stringify(scanSteamVideos().map(({ fullPath, ...pub }) => pub));
    const payloadCode = fs.readFileSync(PAYLOAD_PATH, 'utf8');
    return `window.__AGY_INITIAL_CONFIG__ = ${cfgJson};\nwindow.__AGY_MEDIA_PORT__ = ${MEDIA_PORT};\nwindow.__AGY_STEAM_VIDEOS__ = ${videosJson};\n${payloadCode}`;
}

function getPortInfo() {
    const portFile = resolvePortFile();
    if (!fs.existsSync(portFile)) return null;
    const lines = fs
        .readFileSync(portFile, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    const port = parseInt(lines[0], 10);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { port, token: lines[1] || '' };
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 2000 }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
        req.on('error', reject);
    });
}

const sessions = new Map();
let lastPort = null;
let reloadTimer = null;

function createSession(target) {
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    const session = { id: target.id, ws, target };
    sessions.set(target.id, session);

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== 1) {
                reject(new Error('WebSocket is not open'));
                return;
            }
            const id = nextId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    session.reinject = async () => {
        const src = buildInjectedSource();
        if (!src) return;
        try {
            await send('Runtime.evaluate', { expression: src, awaitPromise: false });
        } catch (_) {}
    };

    ws.addEventListener('message', async (event) => {
        let msg;
        try {
            msg = JSON.parse(String(event.data));
        } catch (_) {
            return;
        }

        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
            else p.resolve(msg.result);
            return;
        }

        if (msg.method === 'Runtime.bindingCalled' && msg.params && msg.params.name === 'agySaveThemeConfig') {
            try {
                const payload = JSON.parse(msg.params.payload || '{}');
                saveConfig(payload);
                for (const other of sessions.values()) {
                    if (other.id !== target.id) {
                        other.reinject();
                    }
                }
            } catch (err) {
                log(`Config binding error: ${err.message}`);
            }
            return;
        }

        if (msg.method === 'Page.frameNavigated' && msg.params && msg.params.frame && !msg.params.frame.parentId) {
            await session.reinject();
        }
    });

    ws.addEventListener('open', async () => {
        try {
            await send('Page.enable');
            await send('Runtime.enable');
            try {
                await send('Runtime.addBinding', { name: 'agySaveThemeConfig' });
            } catch (_) {}

            const src = buildInjectedSource();
            if (src) {
                await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
                await send('Runtime.evaluate', { expression: src, awaitPromise: false });
            }
            log(`Attached target ${target.id} (${target.url})`);
        } catch (err) {
            log(`Attach error for ${target.id}: ${err.message}`);
        }
    });

    const cleanup = () => {
        for (const p of pending.values()) {
            p.reject(new Error('WebSocket closed'));
        }
        pending.clear();
        sessions.delete(target.id);
    };
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
}

async function scanPages() {
    const info = getPortInfo();
    if (!info) return;

    if (lastPort !== null && lastPort !== info.port) {
        for (const s of sessions.values()) {
            try {
                s.ws.close();
            } catch (_) {}
        }
        sessions.clear();
    }
    lastPort = info.port;

    let targets;
    try {
        targets = await fetchJson(`http://127.0.0.1:${info.port}/json`);
    } catch (_) {
        return;
    }
    if (!Array.isArray(targets)) return;

    const pages = targets.filter((t) => {
        if (!t || t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
        const url = String(t.url || '');
        if (url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return false;
        return url.includes('127.0.0.1') || url.includes('workbench') || url.includes('launchpad');
    });

    const liveIds = new Set(pages.map((p) => p.id));
    for (const [id, session] of sessions.entries()) {
        if (!liveIds.has(id)) {
            try {
                session.ws.close();
            } catch (_) {}
            sessions.delete(id);
        }
    }

    for (const page of pages) {
        if (!sessions.has(page.id)) {
            createSession(page);
        }
    }
}

function watchPayload() {
    try {
        if (!fs.existsSync(DIST_DIR)) {
            fs.mkdirSync(DIST_DIR, { recursive: true });
        }
        fs.watch(DIST_DIR, (_eventType, filename) => {
            if (filename && filename !== 'theme_payload.js') return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                log('Detected dist/theme_payload.js update; hot-reloading attached pages.');
                for (const s of sessions.values()) {
                    s.reinject();
                }
            }, 250);
        });
    } catch (err) {
        log(`fs.watch skipped: ${err.message}`);
    }
}

function shutdown(signal) {
    log(`Shutting down on ${signal}.`);
    for (const s of sessions.values()) {
        try {
            s.ws.close();
        } catch (_) {}
    }
    sessions.clear();
    removePidLock();
    process.exit(0);
}

acquirePidLock();
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', removePidLock);

log(`Theme daemon started (PID ${process.pid}, platform=${process.platform}, portFile=${resolvePortFile()}).`);
startMediaServer();
watchPayload();
scanPages();
setInterval(scanPages, 1500);
