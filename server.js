// LIVE WORLD 3D — servidor único (Node 20+). Sem framework web: HTTP + WebSocket próprio.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { LiveManager } from "./lib/live.js";
import { createTikTokConnection } from "./lib/adapter.js";
import { attachWebSocket } from "./lib/ws.js";
import { MusicLibrary, httpErr } from "./lib/music.js";
import { cleanUsername } from "./lib/events.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const DANCES = ["auto", "groove", "bounce", "samba", "hiphop", "passinho", "wave", "celebrate", "spin"];

function makeLogger(level = process.env.LOG_LEVEL || "info") {
  const min = LEVELS[level] ?? 1;
  return (lvl, msg, meta) => {
    if ((LEVELS[lvl] ?? 1) < min) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
    (lvl === "error" || lvl === "warn" ? console.error : console.log)(line);
  };
}
const json = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
};
async function readJson(req, limit = 16 * 1024) {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > limit) throw httpErr(413, "Corpo da requisição muito grande."); chunks.push(c); }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw httpErr(400, "JSON inválido."); }
}
function sendFile(req, res, file, type, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: "Não encontrado." });
    const size = st.size; let start = 0, end = size - 1, status = 200;
    const h = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && (m[1] || m[2])) {
      if (m[1] === "") start = Math.max(0, size - Number(m[2]));
      else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
      if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
      status = 206; h["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    h["Content-Length"] = end - start + 1;
    res.writeHead(status, h);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
  });
}

export function createApp(opts = {}) {
  const cfg = {
    port: opts.port ?? Number(process.env.PORT || 3000),
    host: opts.host ?? "0.0.0.0",
    adminToken: opts.adminToken ?? process.env.ADMIN_TOKEN ?? "",
    enableTestEvents: opts.enableTestEvents ?? process.env.ENABLE_TEST_EVENTS === "1",
    musicDir: opts.musicDir ?? process.env.MUSIC_DIR ?? path.join(ROOT, "data", "music"),
    maxUploadMb: Number(opts.maxUploadMb ?? process.env.MAX_UPLOAD_MB ?? 30),
    backoff: opts.backoff ?? (process.env.RECONNECT_BACKOFF_MS || "2000,4000,8000,16000,30000").split(",").map(Number).filter((n) => n > 0),
  };
  const log = opts.log ?? makeLogger();
  const publicDir = path.join(ROOT, "public");
  const threeDir = path.join(ROOT, "node_modules", "three");
  let gifts = { default: { dance: "celebrate", effect: "confetti", focusSeconds: 5 }, tiers: [], byName: {} };
  try { gifts = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "gifts.json"), "utf8")); } catch (e) { log("warn", "config/gifts.json inválido, usando padrão", { detail: String(e.message) }); }

  const manager = new LiveManager({ factory: opts.connectorFactory ?? createTikTokConnection, backoff: cfg.backoff, log });
  const music = new MusicLibrary({ dir: cfg.musicDir, maxBytes: cfg.maxUploadMb * 1048576 });
  const bootedAt = Date.now();
  const authFails = new Map();

  const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  function requireAuth(req) {
    if (!cfg.adminToken) return;
    const ip = clientIp(req), now = Date.now();
    const f = authFails.get(ip);
    if (f && f.n >= 10 && now - f.t < 60000) throw httpErr(429, "Muitas tentativas. Aguarde um minuto.");
    const a = Buffer.from(String(req.headers["x-admin-token"] || "")), b = Buffer.from(cfg.adminToken);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) { authFails.delete(ip); return; }
    authFails.set(ip, { n: (f && now - f.t < 60000 ? f.n : 0) + 1, t: now });
    throw httpErr(401, "Token de administrador ausente ou incorreto.");
  }

  const musicMsg = () => ({ t: "music", music: music.snapshot(), serverTime: Date.now() });
  const httpServer = http.createServer();
  let wsApi; // criado abaixo, depois das rotas

  const health = () => ({
    ok: true, name: "live-world-3d", version: VERSION, node: process.version,
    uptimeSec: Math.round((Date.now() - bootedAt) / 1000), time: new Date().toISOString(),
    tiktok: { status: manager.status, username: manager.username },
    connectorInstalled: fs.existsSync(path.join(ROOT, "node_modules", "tiktok-live-connector", "package.json")),
    threeInstalled: fs.existsSync(path.join(threeDir, "build", "three.module.js")),
    wsClients: wsApi?.count() ?? 0, musicTracks: music.tracks.length,
    adminProtected: !!cfg.adminToken, testEvents: cfg.enableTestEvents,
  });

  async function api(req, res, p, url) {
    const m = req.method;
    if (m === "GET" && p === "/api/status") return json(res, 200, { ...manager.snapshot(), ...manager.roster.snapshot() });
    if (m === "GET" && p === "/api/config") return json(res, 200, { version: VERSION, adminRequired: !!cfg.adminToken, testEvents: cfg.enableTestEvents, gifts, dances: DANCES, maxUploadMb: cfg.maxUploadMb });
    if (m === "GET" && p === "/api/music") return json(res, 200, { ...music.snapshot(), serverTime: Date.now() });
    if (m === "GET" && p.startsWith("/api/music/file/")) {
      const f = music.fileFor(p.slice("/api/music/file/".length));
      if (!f) throw httpErr(404, "Música não encontrada.");
      return sendFile(req, res, f.file, f.type, "public, max-age=3600");
    }
    if (m === "GET" && p === "/api/auth-check") { requireAuth(req); return json(res, 200, { ok: true }); }

    if (m === "POST" && p === "/api/connect") {
      requireAuth(req);
      const body = await readJson(req);
      try { await manager.connect(body.username); return json(res, 200, { ok: true, ...manager.snapshot() }); }
      catch (e) {
        if (!e.friendly) throw e;
        return json(res, e.kind === "invalid" ? 400 : e.kind === "unavailable" ? 503 : 502, { error: e.message, kind: e.kind, status: manager.snapshot() });
      }
    }
    if (m === "POST" && p === "/api/disconnect") { requireAuth(req); await manager.disconnect(); return json(res, 200, { ok: true, ...manager.snapshot() }); }
    if (m === "POST" && p === "/api/cmd") {
      requireAuth(req);
      const b = await readJson(req), cmd = {};
      if (b.camera !== undefined) { if (!["auto", "wide", "manual"].includes(b.camera)) throw httpErr(400, "Câmera inválida."); cmd.camera = b.camera; }
      if (b.dance !== undefined) { if (!DANCES.includes(b.dance)) throw httpErr(400, "Dança inválida."); cmd.dance = b.dance; }
      if (b.quality !== undefined) { if (!["low", "med", "high"].includes(b.quality)) throw httpErr(400, "Qualidade inválida."); cmd.quality = b.quality; }
      if (!Object.keys(cmd).length) throw httpErr(400, "Nenhum comando.");
      wsApi.broadcast({ t: "cmd", cmd }); return json(res, 200, { ok: true });
    }
    if (m === "POST" && p === "/api/test-event") {
      if (!cfg.enableTestEvents) throw httpErr(404, "Eventos de teste desativados (ENABLE_TEST_EVENTS=1 para ativar).");
      requireAuth(req);
      const b = await readJson(req);
      const uid = cleanUsername(b.uniqueId || b.name) || "teste";
      const user = { id: uid, uniqueId: uid, name: String(b.name || uid).replace(/[<>]/g, "").slice(0, 24) };
      const type = b.type;
      let ev;
      if (type === "member") ev = { type, user };
      else if (type === "chat") ev = { type, user, text: String(b.text || "Olá!").slice(0, 200) };
      else if (type === "like") ev = { type, user, count: Math.min(50, Math.max(1, Number(b.count) || 1)), total: null };
      else if (type === "gift") { const count = Math.min(99, Math.max(1, Number(b.count) || 1)), d = Math.max(0, Number(b.diamonds) || 1); ev = { type, user, giftId: "test", giftName: String(b.giftName || "Rose").slice(0, 40), count, diamonds: d, total: d * count }; }
      else throw httpErr(400, "Tipo inválido (member, chat, like, gift).");
      manager.injectTest(ev); return json(res, 200, { ok: true, note: "Evento LOCAL de teste. Não vem do TikTok." });
    }

    if (m === "POST" && p === "/api/music") {
      requireAuth(req);
      if (Number(req.headers["content-length"]) > cfg.maxUploadMb * 1048576) { req.resume(); throw httpErr(413, `Arquivo maior que ${cfg.maxUploadMb} MB.`); }
      let name = ""; try { name = decodeURIComponent(String(req.headers["x-filename"] || "")); } catch { /* nome inválido */ }
      const t = await music.add(req, name);
      return json(res, 201, { ok: true, track: t });
    }
    if (m === "POST" && p === "/api/music/control") { requireAuth(req); const b = await readJson(req); music.control(b.action, b.value); return json(res, 200, { ok: true }); }
    if (m === "DELETE" && p.startsWith("/api/music/")) { requireAuth(req); music.remove(p.slice("/api/music/".length)); return json(res, 200, { ok: true }); }
    throw httpErr(404, "Rota não encontrada.");
  }

  function serveStatic(req, res, p) {
    let rel;
    try { rel = decodeURIComponent(p); } catch { throw httpErr(400, "URL inválida."); }
    let root = publicDir, cache = "no-cache";
    if (rel.startsWith("/vendor/three/")) {
      const sub = rel.slice("/vendor/three/".length);
      if (!/^(build|examples\/jsm)\//.test(sub)) throw httpErr(404, "Não encontrado.");
      if (!fs.existsSync(threeDir)) throw httpErr(503, "Three.js não instalado no servidor. Rode npm install.");
      root = threeDir; rel = "/" + sub; cache = "public, max-age=86400";
    } else if (rel.startsWith("/models/")) cache = "public, max-age=3600";
    if (rel.split("/").some((s) => s.startsWith(".") && s !== "")) throw httpErr(404, "Não encontrado.");
    if (rel.endsWith("/")) rel += "index.html";
    let full = path.normalize(path.join(root, rel));
    if (!full.startsWith(root + path.sep)) throw httpErr(404, "Não encontrado.");
    try { if (fs.statSync(full).isDirectory()) full = path.join(full, "index.html"); } catch { /* 404 abaixo */ }
    return sendFile(req, res, full, MIME[path.extname(full).toLowerCase()] || "application/octet-stream", cache);
  }

  httpServer.on("request", async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const url = new URL(req.url, "http://localhost"); const p = url.pathname;
      if (p === "/health" || p === "/healthz") return json(res, 200, health());
      if (p.startsWith("/api/")) return await api(req, res, p, url);
      if (req.method !== "GET" && req.method !== "HEAD") throw httpErr(405, "Método não permitido.");
      return serveStatic(req, res, p);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500 && status !== 503) log("error", "erro na requisição", { url: req.url, detail: String(err?.stack || err) });
      if (res.headersSent) return res.destroy();
      json(res, status, { error: err.expose ? err.message : "Erro interno do servidor." });
    }
  });
  httpServer.keepAliveTimeout = 65000; httpServer.headersTimeout = 66000;

  wsApi = attachWebSocket(httpServer, {
    log,
    onConnect: (c) => wsApi.send(c, { t: "hello", serverTime: Date.now(), version: VERSION, status: manager.snapshot(), ...manager.roster.snapshot(), music: music.snapshot(), testEvents: cfg.enableTestEvents }),
    onMessage: (_c, msg) => { if (msg?.t === "ended" && typeof msg.id === "string") music.ended(msg.id); },
  });
  manager.on("status", (s) => wsApi.broadcast({ t: "status", status: s }));
  manager.on("event", (ev) => wsApi.broadcast({ t: "event", ev }));
  manager.on("reset", () => wsApi.broadcast({ t: "reset" }));
  music.on("change", () => wsApi.broadcast(musicMsg()));
  let lastStats = "";
  const statsTimer = setInterval(() => {
    const s = JSON.stringify(manager.roster.snapshot().stats);
    if (s !== lastStats) { lastStats = s; wsApi.broadcast({ t: "stats", stats: manager.roster.stats }); }
  }, 1000);
  statsTimer.unref();

  return {
    server: httpServer, manager, music, cfg,
    async start() {
      await new Promise((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(cfg.port, cfg.host, resolve); });
      const port = httpServer.address().port;
      log("info", `LIVE WORLD 3D v${VERSION} na porta ${port}`, { node: process.version, adminProtected: !!cfg.adminToken, testEvents: cfg.enableTestEvents });
      if (!cfg.adminToken) log("warn", "ADMIN_TOKEN não definido: qualquer pessoa com o link pode conectar/desconectar a LIVE e enviar músicas. Defina ADMIN_TOKEN em produção.");
      const h = health();
      if (!h.threeInstalled) log("warn", "Three.js ausente (node_modules/three): o palco 3D não carrega. Rode npm install.");
      if (!h.connectorInstalled) log("warn", "tiktok-live-connector ausente: a conexão com a LIVE falhará até rodar npm install.");
      return port;
    },
    async stop() {
      clearInterval(statsTimer);
      try { await manager.disconnect(); } catch { /* ignora */ }
      wsApi.close();
      await new Promise((r) => { httpServer.close(r); httpServer.closeAllConnections?.(); });
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const log = makeLogger();
  const app = createApp({ log });
  process.on("unhandledRejection", (r) => log("error", "promessa rejeitada sem tratamento", { detail: String(r?.stack || r) }));
  process.on("uncaughtException", (e) => { log("error", "exceção não tratada", { detail: String(e?.stack || e) }); setTimeout(() => process.exit(1), 200); });
  const shutdown = (sig) => { log("info", `${sig} recebido, encerrando…`); setTimeout(() => process.exit(0), 8000).unref(); app.stop().finally(() => process.exit(0)); };
  process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT"));
  app.start().catch((e) => { log("error", "falha ao iniciar", { detail: String(e?.message || e) }); process.exit(1); });
}
