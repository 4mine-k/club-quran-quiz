// server.js — pure Node HTTP server (no external packages)
// Serves the quiz frontend + API for Club Quran ENSIAS

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { QUESTIONS, TIME_PER_QUESTION } = require("./questions");
const { gradeOpen } = require("./grading");
const db = require("./db");
const xport = require("./export");
const { verifyIdToken } = require("./google");

// Google OAuth client ID — set via environment variable on Replit (Secrets).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Detect the best LAN IPv4 (prefer common private WiFi ranges, skip virtual adapters)
function detectLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address;
      let score = 0;
      if (/^192\.168\./.test(ip)) score = 100;
      else if (/^10\./.test(ip)) score = 90;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score = 80;
      else score = 10;
      // Penalize virtual adapters
      if (/virtual|vmware|hyper-v|loopback|vethernet|vbox/i.test(name)) score -= 50;
      if (/wi-?fi|wlan|wireless/i.test(name)) score += 15;
      candidates.push({ ip, name, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].ip : "localhost";
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Max points per question; faster answers earn more of the time bonus.
const BASE_POINTS = 100;
const TIME_BONUS = 100;

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

// Public view of a question (never expose the correct answer)
function publicQuestion(q) {
  const base = {
    id: q.id,
    category: q.category,
    type: q.type,
    text: q.text,
    index: QUESTIONS.findIndex((x) => x.id === q.id) + 1,
    total: QUESTIONS.length,
    timePerQuestion: TIME_PER_QUESTION,
  };
  if (q.type === "mcq") base.options = q.options;
  return base;
}

function serveStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  rel = decodeURIComponent(rel.split("?")[0]);
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ---------- API ----------

  // Frontend config: expose the Google Client ID + whether auth is enabled
  if (p === "/api/config" && req.method === "GET") {
    return sendJSON(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID,
      googleEnabled: !!GOOGLE_CLIENT_ID,
    });
  }

  if (p === "/api/register" && req.method === "POST") {
    const body = await readBody(req);
    const username = (body.name || "").toString().trim();
    if (!username) return sendJSON(res, 400, { error: "اختر اسم اللاعب أولاً" });

    // If Google auth is enabled, require a valid Google ID token.
    let googleEmail = null;
    let googleName = null;
    let googleSub = null;
    if (GOOGLE_CLIENT_ID) {
      const credential = (body.credential || "").toString();
      if (!credential) return sendJSON(res, 401, { error: "يجب تسجيل الدخول عبر Google" });
      try {
        const payload = await verifyIdToken(credential, GOOGLE_CLIENT_ID);
        googleEmail = payload.email || null;
        googleName = payload.name || null;
        googleSub = payload.sub || null;
      } catch (e) {
        return sendJSON(res, 401, { error: "فشل التحقق من حساب Google" });
      }
    }

    const player = db.createPlayer(username, { googleEmail, googleName, googleSub });
    return sendJSON(res, 200, {
      playerId: player.id,
      name: player.name,
      total: QUESTIONS.length,
      timePerQuestion: TIME_PER_QUESTION,
    });
  }

  if (p === "/api/questions" && req.method === "GET") {
    return sendJSON(res, 200, {
      total: QUESTIONS.length,
      timePerQuestion: TIME_PER_QUESTION,
      questions: QUESTIONS.map(publicQuestion),
    });
  }

  if (p === "/api/answer" && req.method === "POST") {
    const body = await readBody(req);
    const { playerId, questionId, answer, timeMs } = body;
    const player = db.getPlayer(playerId);
    if (!player) return sendJSON(res, 404, { error: "اللاعب غير موجود" });
    const q = QUESTIONS.find((x) => x.id === Number(questionId));
    if (!q) return sendJSON(res, 404, { error: "السؤال غير موجود" });

    // Prevent double-answering the same question
    if (player.answers.some((a) => a.questionId === q.id)) {
      return sendJSON(res, 200, { alreadyAnswered: true });
    }

    let isCorrect = false;
    if (q.type === "mcq") {
      isCorrect = Number(answer) === q.correct;
    } else {
      isCorrect = gradeOpen(answer, q.accepted);
    }

    const t = Math.max(0, Number(timeMs) || 0);
    let points = 0;
    if (isCorrect) {
      const limitMs = TIME_PER_QUESTION * 1000;
      const frac = Math.max(0, Math.min(1, 1 - t / limitMs));
      points = BASE_POINTS + Math.round(TIME_BONUS * frac);
    }

    db.updatePlayer(playerId, (pl) => {
      pl.answers.push({
        questionId: q.id,
        answer: String(answer),
        isCorrect,
        timeMs: t,
        points,
      });
      pl.score += points;
      if (isCorrect) pl.correctCount += 1;
      pl.totalTimeMs += t;
    });

    return sendJSON(res, 200, {
      isCorrect,
      points,
      correctAnswer: q.type === "mcq" ? q.options[q.correct] : q.accepted[0],
      explanation: q.explanation,
    });
  }

  if (p === "/api/finish" && req.method === "POST") {
    const body = await readBody(req);
    const player = db.getPlayer(body.playerId);
    if (!player) return sendJSON(res, 404, { error: "اللاعب غير موجود" });
    const updated = db.updatePlayer(body.playerId, (pl) => {
      pl.finished = true;
      pl.finishedAt = Date.now();
    });
    // Players never see correctness or score; only a thank-you message.
    return sendJSON(res, 200, { ok: true });
  }

  if (p === "/api/leaderboard" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit")) || 3;
    return sendJSON(res, 200, { top: db.leaderboard(limit) });
  }

  // All players (for the admin dashboard)
  if (p === "/api/allplayers" && req.method === "GET") {
    const data = db.load();
    const players = data.players.map((p) => ({
      name: p.name,
      score: p.score,
      correctCount: p.correctCount,
      totalTimeMs: p.totalTimeMs,
      finished: p.finished,
    }));
    return sendJSON(res, 200, { players });
  }

  // Join info: the URL that phones should open.
  // When hosted (Render etc.) use the public host from the request headers.
  // When running locally, fall back to the LAN IP so phones on the same WiFi can connect.
  if (p === "/api/joininfo" && req.method === "GET") {
    const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || "";
    const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const hostName = hostHeader.split(":")[0];
    const isLocal =
      !hostHeader ||
      hostName === "localhost" ||
      hostName === "127.0.0.1" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostName); // raw IP = local LAN access

    let joinUrl;
    if (isLocal) {
      const ip = detectLanIp();
      joinUrl = `http://${ip}:${PORT}`;
    } else {
      // Public deployment: honor the real public host + scheme
      joinUrl = `${proto}://${hostHeader}`;
    }
    return sendJSON(res, 200, { url: joinUrl, hosted: !isLocal });
  }

  // QR code image (SVG) encoding the join URL
  // QR is rendered client-side on the /join page using public/qrcode.min.js

  // Download all results as a real Excel .xlsx file
  if (p === "/export.xlsx" && req.method === "GET") {
    const data = db.load();
    const buf = xport.toXlsx(data.players, QUESTIONS);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="club-quran-results.xlsx"',
      "Cache-Control": "no-store",
    });
    return res.end(buf);
  }

  // Download results as CSV (Excel-friendly, UTF-8 BOM)
  if (p === "/export.csv" && req.method === "GET") {
    const data = db.load();
    const csv = xport.toCsv(data.players, QUESTIONS);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="club-quran-results.csv"',
      "Cache-Control": "no-store",
    });
    return res.end(Buffer.from(csv, "utf8"));
  }

  // ---------- Static files ----------
  if (req.method === "GET") {
    if (p === "/join") return serveStatic(req, res, "/join.html");
    if (p === "/admin") return serveStatic(req, res, "/admin.html");
    return serveStatic(req, res, p);
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  const hosted = !!process.env.RENDER || !!process.env.PORT_PUBLIC || process.env.NODE_ENV === "production";
  console.log("\n  ✅ Club Quran Quiz is running on port " + PORT + "!\n");
  if (process.env.RENDER_EXTERNAL_URL) {
    const u = process.env.RENDER_EXTERNAL_URL;
    console.log("  🌍 Public URL:   " + u);
    console.log("  📱 Join + QR:    " + u + "/join");
    console.log("  🏆 Admin+Excel:  " + u + "/admin\n");
  } else {
    const ip = detectLanIp();
    console.log("  ➜ On this computer:         http://localhost:" + PORT);
    console.log("  ➜ On phones (same WiFi):    http://" + ip + ":" + PORT);
    console.log("  ➜ Join page + QR (project): http://localhost:" + PORT + "/join");
    console.log("  ➜ Admin / winners + Excel:  http://localhost:" + PORT + "/admin");
    console.log("  ➜ Download Excel directly:  http://localhost:" + PORT + "/export.xlsx\n");
    console.log("  📱 افتح /join واعرضها على البروجيكتور ليمسح الطلاب رمز QR.\n");
  }
});
