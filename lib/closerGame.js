
import crypto from "node:crypto";

export function makeCloserRoomCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export function makeCloserToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashCloserToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const CLOSER_CHALLENGES = [
  {
    id: "older",
    label: "Quién tiene más edad, pero está más cerca",
    field: "birth_date",
    direction: "lower",
    unit: "días"
  },
  {
    id: "younger",
    label: "Quién tiene menos edad, pero está más cerca",
    field: "birth_date",
    direction: "higher",
    unit: "días"
  },
  {
    id: "debut_before",
    label: "Quién debutó antes, está más cerca ",
    field: "debut_year",
    direction: "lower",
    unit: "años"
  },
  {
    id: "debut_after",
    label: "Quién debutó después, pero está más cerca",
    field: "debut_year",
    direction: "higher",
    unit: "años"
  },
  {
    id: "heavier",
    label: "Quién es más pesado pero está más cerca",
    field: "weight_kg",
    direction: "higher",
    unit: "kg"
  },
  {
    id: "lighter",
    label: "Quién es menos pesado pero está más cerca",
    field: "weight_kg",
    direction: "lower",
    unit: "kg"
  },
  {
    id: "taller",
    label: "Quién es más alto pero está más cerca",
    field: "height_cm",
    direction: "higher",
    unit: "cm"
  },
  {
    id: "shorter",
    label: "Quién es más pequeño pero está más cerca",
    field: "height_cm",
    direction: "lower",
    unit: "cm"
  }
];

export function hasChallengeValue(wrestler, challenge) {
  const value = wrestler?.[challenge.field];

  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (challenge.field === "birth_date") {
    return Number.isFinite(Date.parse(value));
  }

  return Number.isFinite(Number(value));
}

export function getChallengeValue(wrestler, challenge) {
  if (challenge.field === "birth_date") {
    return Date.parse(wrestler.birth_date);
  }

  return Number(wrestler[challenge.field]);
}

export function getAge(birthDate) {
  if (!birthDate) return null;

  const birth = new Date(`${birthDate}T00:00:00Z`);

  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();

  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() &&
      today.getUTCDate() < birth.getUTCDate());

  if (beforeBirthday) age--;

  return age;
}

export function chooseCloserRound(wrestlers) {
  const usableChallenges = CLOSER_CHALLENGES.filter((challenge) => {
    return wrestlers.filter((w) => hasChallengeValue(w, challenge)).length >= 3;
  });

  if (usableChallenges.length === 0) {
    throw new Error(
      "No hay suficientes luchadores con datos para generar un desafío."
    );
  }

  // Barajar para evitar que las rondas sigan siempre el mismo orden.
  const challenges = [...usableChallenges].sort(() => Math.random() - 0.5);

  for (const challenge of challenges) {
    const pool = wrestlers.filter((w) =>
      hasChallengeValue(w, challenge)
    );

    const reference = pool[Math.floor(Math.random() * pool.length)];

    const candidates = pool.filter((w) => String(w.id) !== String(reference.id));

    if (candidates.length < 2) continue;

    return {
      challenge,
      reference,
      answers: {
        player1: null,
        player2: null
      },
      result: null
    };
  }

  throw new Error("No se pudo generar una ronda válida.");
}

export function calculateCloserResult(roundData, player1, player2) {
  const challenge = roundData.challenge;
  const reference = roundData.reference;

  const referenceValue = getChallengeValue(reference, challenge);

  function evaluate(wrestler) {
    if (!wrestler || !hasChallengeValue(wrestler, challenge)) {
      return {
        valid: false,
        satisfiesCondition: false,
        distance: null
      };
    }

    const value = getChallengeValue(wrestler, challenge);

    const satisfiesCondition =
      challenge.direction === "lower"
        ? value < referenceValue
        : value > referenceValue;

    return {
      valid: true,
      satisfiesCondition,
      distance: Math.abs(value - referenceValue)
    };
  }

  const p1 = evaluate(player1);
  const p2 = evaluate(player2);

  let winner = "tie";

  if (p1.satisfiesCondition && !p2.satisfiesCondition) {
    winner = "player1";
  } else if (!p1.satisfiesCondition && p2.satisfiesCondition) {
    winner = "player2";
  } else if (p1.satisfiesCondition && p2.satisfiesCondition) {
    if (p1.distance < p2.distance) {
      winner = "player1";
    } else if (p2.distance < p1.distance) {
      winner = "player2";
    }
  }

  return {
    winner,
    player1: p1,
    player2: p2,
    referenceValue,
    challengeId: challenge.id
  };
}
