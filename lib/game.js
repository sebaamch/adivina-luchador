import crypto from "node:crypto";

export function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

export function compare(guess, target) {
  const near = (a, b, tolerance) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= tolerance;
  const same = (a, b) => a != null && b != null && a === b;
  return {
    promotion: { value: guess.promotion ?? "—", status: same(guess.promotion, target.promotion) ? "correct" : "wrong" },
    nationality: { value: guess.nationality ?? "—", status: same(guess.nationality, target.nationality) ? "correct" : "wrong" },
    gender: { value: guess.gender === "Mujer" ? "Mujer" : "Hombre", status: same(guess.gender, target.gender) ? "correct" : "wrong" },
    debut: { value: guess.debut_year ?`${guess.debut_year}${
                guess.debut_year > target.debut_year
                    ? "↓"
                    : guess.debut_year < target.debut_year
                    ? "↑"
                    : ""
            }`
            : "-", status: same(guess.start_year, target.start_year) ? "correct" : near(guess.start_year, target.start_year, 2) ? "near" : "wrong" },
    active: { value: guess.status ?? "-" , status: same(guess.status, target.status) ? "correct" : "wrong" },
    category: { value: guess.category ?? "—", status: same(guess.category, target.category) ? "correct" : "wrong" },
    style: { value: guess.wrestling_style ?? "—", status: same(guess.style, target.style) ? "correct" : "wrong" },
    height: { value: guess.height_cm ? `${guess.height_cm} cm` : "—", status: same(guess.height_cm, target.height_cm) ? "correct" : near(guess.height_cm, target.height_cm, 5) ? "near" : "wrong" },
    weight: { value: guess.weight_kg ? `${guess.weight_kg} kg` : "—", status: same(guess.weight_kg, target.weight_kg) ? "correct" : near(guess.weight_kg, target.weight_kg, 5) ? "near" : "wrong" },
worldChampion: {
    value:
        guess.cantidad_titulos
            ? `${guess.cantidad_titulos}${
                guess.cantidad_titulos > target.cantidad_titulos
                    ? "↓"
                    : guess.cantidad_titulos < target.cantidad_titulos
                    ? "↑"
                    : ""
            }`
            : "-",

    status:
       
        guess.cantidad_titulos === target.cantidad_titulos
            ? "correct"
            : "wrong"
},    rumble: { value: guess.royal_rumble_winner ? "Sí" : "No", status: guess.royal_rumble_winner === target.royal_rumble_winner ? "correct" : "wrong" },
    alignment: { value: guess.alignment ?? "—", status: same(guess.alignment, target.alignment) ? "correct" : "wrong" },
    hof: { value: guess.hall_of_fame ? "Sí" : "No", status: same(guess.hall_of_fame, target.hall_of_fame) ? "correct" : "wrong" }

  };
}

export function publicWrestler(w) {
  if (!w) return null;
  return { id: w.id, name: w.name, image_url: w.image_url ?? null, local_image: w.local_image ?? null };
}
