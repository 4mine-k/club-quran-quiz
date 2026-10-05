// db.js — tiny JSON-file database (no external packages required)
// Stores every player and all their answers in data/players.json

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "players.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ players: [] }, null, 2), "utf8");
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    return { players: [] };
  }
}

function save(data) {
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Create a new player, returns the player object
function createPlayer(name, google = {}) {
  const data = load();
  const id = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const player = {
    id,
    name: String(name || "").trim().slice(0, 40) || "لاعب",
    googleEmail: google.googleEmail || null,
    googleName: google.googleName || null,
    googleSub: google.googleSub || null,
    score: 0,
    correctCount: 0,
    totalTimeMs: 0,
    answers: [], // { questionId, answer, isCorrect, timeMs, points }
    startedAt: Date.now(),
    finishedAt: null,
    finished: false,
  };
  data.players.push(player);
  save(data);
  return player;
}

function getPlayer(id) {
  return load().players.find((p) => p.id === id) || null;
}

function updatePlayer(id, updater) {
  const data = load();
  const idx = data.players.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  updater(data.players[idx]);
  save(data);
  return data.players[idx];
}

// Leaderboard: finished players ranked by score desc, then total time asc
function leaderboard(limit = 3) {
  const data = load();
  const finished = data.players.filter((p) => p.finished);
  finished.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalTimeMs - b.totalTimeMs;
  });
  return finished.slice(0, limit).map((p, i) => ({
    rank: i + 1,
    name: p.name,
    score: p.score,
    correctCount: p.correctCount,
    totalTimeMs: p.totalTimeMs,
  }));
}

module.exports = { createPlayer, getPlayer, updatePlayer, leaderboard, load };
