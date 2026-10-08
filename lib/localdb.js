import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");
const WRESTLERS_PATH = path.join(process.cwd(), "data", "wrestlers.json");

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const wrestlers = JSON.parse(fs.readFileSync(WRESTLERS_PATH, "utf8"));
    fs.writeFileSync(DB_PATH, JSON.stringify({ wrestlers, games: [] }, null, 2));
  }
}

export function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

export function writeDb(db) {
  ensureDb();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

export function getWrestlers(query = "") {
  const db = readDb();
  const q = query.trim().toLowerCase();
  return db.wrestlers
    .filter((w) => w.eligible !== false && (!q || w.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12);
}

export function getWrestler(id) {
  return readDb().wrestlers.find((w) => String(w.id) === String(id) && w.eligible !== false) || null;
}

export function getGame(code) {
  return readDb().games.find((g) => g.code === String(code).toUpperCase()) || null;
}

export function updateGame(code, updater) {
  const db = readDb();
  const index = db.games.findIndex((g) => g.code === String(code).toUpperCase());
  if (index < 0) return null;
  const next = updater(db.games[index]);
  db.games[index] = next;
  writeDb(db);
  return next;
}

export function addGame(game) {
  const db = readDb();
  db.games.push(game);
  writeDb(db);
  return game;
}
