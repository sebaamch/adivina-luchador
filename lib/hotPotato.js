import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export function normalizeWrestlerName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function canFormName(name, letters) {
  const wanted = normalizeWrestlerName(name);
  if (!wanted) return false;

  const counts = new Map();
  for (const letter of letters || []) {
    const key = normalizeWrestlerName(letter);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (const letter of wanted) {
    const available = counts.get(letter) || 0;
    if (available < 1) return false;
    counts.set(letter, available - 1);
  }
  return true;
}

function randomLetter() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet[crypto.randomInt(0, alphabet.length)];
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function getAvailableWrestlers() {
  const { data, error } = await supabaseAdmin
    .from("wrestlers")
    .select("id, name, eligible")
    .limit(5000);

  if (error) throw error;
  return (data || []).filter((w) => w.name && w.eligible !== false);
}

/**
 * Crea un nuevo conjunto a partir del nombre de un luchador existente,
 * añade dos letras de relleno y las mezcla. Así siempre existe al menos
 * un nombre válido que puede formarse con las letras.
 */
export async function makeHotPotatoLetters(usedWrestlerIds = []) {
  const wrestlers = await getAvailableWrestlers();
  const used = new Set((usedWrestlerIds || []).map(String));
  const candidates = wrestlers.filter((w) => {
    const normalized = normalizeWrestlerName(w.name);
    return normalized.length >= 4 && normalized.length <= 10 && !used.has(String(w.id));
  });
  const fallback = wrestlers.filter((w) => {
    const normalized = normalizeWrestlerName(w.name);
    return normalized.length >= 4 && normalized.length <= 10;
  });
  const pool = candidates.length ? candidates : fallback;
  if (!pool.length) {
    throw new Error("No hay luchadores disponibles para generar las letras.");
  }

  const chosen = pool[crypto.randomInt(0, pool.length)];
  const letters = [...normalizeWrestlerName(chosen.name).toUpperCase()];
  letters.push(randomLetter(), randomLetter());
  return shuffle(letters);
}
