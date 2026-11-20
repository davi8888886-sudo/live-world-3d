import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));

let live = null;
let username = null;
let state = "disconnected";

function broadcastStatus(message) {
  io.emit("connection-status", { status: state, username, message });
}
function emit(type, data) {
  io.emit("live-event", { type, data, at: Date.now() });
}
function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, "")
    .split(/[/?#]/)[0];
}

app.get("/api/status", (_req, res) => res.json({ status: state, username }));

app.post("/api/connect", async (req, res) => {
  const user = cleanUsername(req.body?.username);
  if (!/^[a-zA-Z0-9._]{2,24}$/.test(user)) {
    return res.status(400).json({ error: "Digite um @ válido do TikTok." });
  }

  if (live) {
    try { await live.disconnect(); } catch {}
    live = null;
  }

  username = user;
  state = "connecting";
  broadcastStatus();

  const connection = new TikTokLiveConnection(user);
  live = connection;

  connection.on(WebcastEvent.CHAT, e => emit("chat", {
    username: e.user?.nickname || e.user?.uniqueId || "Usuário",
    text: e.comment || ""
  }));
  connection.on(WebcastEvent.MEMBER, e => emit("member", {
    username: e.user?.nickname || e.user?.uniqueId || "Novo espectador"
  }));
  connection.on(WebcastEvent.GIFT, e => emit("gift", {
    username: e.user?.nickname || e.user?.uniqueId || "Espectador",
    giftName: e.giftDetails?.giftName || e.gift?.name || "Presente",
    count: e.repeatCount || 1
  }));
  connection.on(WebcastEvent.LIKE, e => emit("like", {
    username: e.user?.nickname || e.user?.uniqueId || "Espectador",
    count: e.likeCount || e.count || 1
  }));
  connection.on("disconnected", () => {
    if (live === connection) {
      state = "disconnected";
      broadcastStatus("A transmissão encerrou ou a conexão foi perdida.");
    }
  });
  connection.on("error", err => {
    if (live === connection) {
      state = "error";
      broadcastStatus(err?.message || "Erro no conector do TikTok.");
    }
  });

  try {
    const result = await connection.connect();
    if (live !== connection) return;
    state = "connected";
    broadcastStatus();
    res.json({ ok: true, username: user, roomId: result?.roomId || null });
  } catch (err) {
    if (live === connection) live = null;
    state = "error";
    const message = err?.message || "Não foi possível conectar à LIVE.";
    broadcastStatus(message);
    res.status(502).json({
      error: message,
      hint: "Confirme que o perfil está ao vivo e público. O conector é comunitário, não oficial, e pode ser afetado por mudanças do TikTok."
    });
  }
});

app.post("/api/disconnect", async (_req, res) => {
  if (live) {
    try { await live.disconnect(); } catch {}
  }
  live = null;
  username = null;
  state = "disconnected";
  broadcastStatus();
  res.json({ ok: true });
});

io.on("connection", socket => {
  socket.emit("connection-status", { status: state, username });
});

server.listen(PORT, () => console.log(`LIVE WORLD 3D rodando na porta ${PORT}`));

process.on("SIGTERM", async () => {
  if (live) { try { await live.disconnect(); } catch {} }
  server.close(() => process.exit(0));
});
