
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  makeCloserRoomCode,
  makeCloserToken,
  hashCloserToken,
  hasChallengeValue,
  chooseCloserRound,
  calculateCloserResult,
  getAge
} from "@/lib/closerGame";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOTAL_ROUNDS = 10;

const WRESTLER_FIELDS =
  "id,name,local_image,birth_date,debut_year,height_cm,weight_kg";

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function publicWrestler(w) {
  if (!w) return null;

  return {
    id: w.id,
    name: w.name,
    local_image: w.local_image || `/wrestlers/${w.id}.svg`,
    birth_date: w.birth_date,
    age: getAge(w.birth_date),
    debut_year: w.debut_year,
    height_cm: w.height_cm,
    weight_kg: w.weight_kg
  };
}

async function getWrestlers() {
  const { data, error } = await supabaseAdmin
    .from("wrestlers")
    .select(WRESTLER_FIELDS)
    .eq("eligible", true)
    .limit(5000);

  if (error) throw new Error(error.message);

  return data || [];
}

async function getRoom(code) {
  const { data, error } = await supabaseAdmin
    .from("closer_games")
    .select("*")
    .eq("code", String(code || "").trim().toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

function identifyPlayer(room, token) {
  if (!room || !token) return null;

  const hash = hashCloserToken(token);

  if (hash === room.player1_token_hash) return "player1";
  if (room.player2_token_hash && hash === room.player2_token_hash) {
    return "player2";
  }

  return null;
}

async function getAuthenticatedRoom(body) {
  const room = await getRoom(body.code);
  if (!room) return { error: "No se encontró la sala.", status: 404 };

  const player = identifyPlayer(room, body.token);
  if (!player) {
    return { error: "El token de jugador no es válido.", status: 401 };
  }

  return { room, player };
}

async function saveRoom(room, changes) {
  const { data, error } = await supabaseAdmin
    .from("closer_games")
    .update({
      ...changes,
      updated_at: new Date().toISOString()
    })
    .eq("id", room.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data;
}

function publicRoom(room, player) {
  const round = room.round_data || {};
  const answers = round.answers || {};
  const bothAnswered = Boolean(answers.player1 && answers.player2);
  const revealed = bothAnswered && Boolean(round.result);

  return {
    code: room.code,
    status: room.status,
    player,
    player1Name: room.player1_name,
    player2Name: room.player2_name,
    player1Score: room.player1_score,
    player2Score: room.player2_score,
    roundNumber: room.round_number,
    totalRounds: TOTAL_ROUNDS,
    myAnswered: Boolean(answers[player]),
    opponentAnswered: Boolean(
      answers[player === "player1" ? "player2" : "player1"]
    ),
    challenge: round.challenge
      ? {
          id: round.challenge.id,
          label: round.challenge.label,
          field: round.challenge.field,
          direction: round.challenge.direction,
          unit: round.challenge.unit
        }
      : null,
    reference: publicWrestler(round.reference),
    bothAnswered,
    revealed,
    answers: revealed
      ? {
          player1: publicWrestler(
            round.selectedWrestlers?.player1
          ),
          player2: publicWrestler(
            round.selectedWrestlers?.player2
          )
        }
      : null,
    result: revealed ? round.result : null,
    history: room.history || []
  };
}

async function createRoom(body) {
  const name = String(body.name || "").trim().slice(0, 30);

  if (!name) {
    return json({ error: "Escribe tu nombre para crear la sala." }, 400);
  }

  const token = makeCloserToken();

  let room = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCloserRoomCode();

    const { data, error } = await supabaseAdmin
      .from("closer_games")
      .insert({
        code,
        status: "waiting",
        player1_name: name,
        player1_token_hash: hashCloserToken(token),
        player1_score: 0,
        player2_score: 0,
        round_number: 0,
        round_data: {},
        history: []
      })
      .select("*")
      .single();

    if (!error) {
      room = data;
      break;
    }

    // Reintentar solamente si el código generado ya existe.
    if (error.code !== "23505") {
      return json({ error: error.message }, 500);
    }
  }

  if (!room) {
    return json({ error: "No se pudo crear un código de sala." }, 500);
  }

  return json({
    token,
    room: publicRoom(room, "player1")
  });
}

async function joinRoom(body) {
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim().slice(0, 30);

  if (!code || !name) {
    return json({ error: "Ingresa el código de sala y tu nombre." }, 400);
  }

  const room = await getRoom(code);

  if (!room) return json({ error: "No existe una sala con ese código." }, 404);
  if (room.status !== "waiting" || room.player2_token_hash) {
    return json({ error: "La sala ya está ocupada o comenzó la partida." }, 409);
  }

  const wrestlers = await getWrestlers();
  const round = chooseCloserRound(wrestlers);
  const token = makeCloserToken();

  const updated = await saveRoom(room, {
    status: "playing",
    player2_name: name,
    player2_token_hash: hashCloserToken(token),
    round_number: 1,
    round_data: round
  });

  return json({
    token,
    room: publicRoom(updated, "player2")
  });
}

async function getState(body) {
  const auth = await getAuthenticatedRoom(body);
  if (auth.error) return json({ error: auth.error }, auth.status);

  return json({
    room: publicRoom(auth.room, auth.player)
  });
}

async function submitAnswer(body) {
  const auth = await getAuthenticatedRoom(body);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const { room, player } = auth;

  if (room.status !== "playing") {
    return json({ error: "La partida no está en curso." }, 409);
  }

  const round = room.round_data || {};
  const answers = { ...(round.answers || {}) };

  if (answers[player]) {
    return json({ error: "Ya respondiste esta ronda." }, 409);
  }

  const wrestlers = await getWrestlers();
  const selected = wrestlers.find(
    (w) => String(w.id) === String(body.wrestlerId)
  );

  if (!selected) {
    return json({ error: "El luchador seleccionado no es válido." }, 400);
  }

  if (String(selected.id) === String(round.reference?.id)) {
    return json({
      error: "Debes elegir un luchador distinto al de referencia."
    }, 400);
  }

  if (!hasChallengeValue(selected, round.challenge)) {
    return json({
      error: "Ese luchador no tiene los datos necesarios para este desafío."
    }, 400);
  }

  answers[player] = selected.id;

  // Si falta la respuesta rival, guardamos la nuestra sin revelarla.
  if (!answers.player1 || !answers.player2) {
    const updatedRound = { ...round, answers };

    const updated = await saveRoom(room, {
      round_data: updatedRound
    });

    return json({
      room: publicRoom(updated, player)
    });
  }

  const player1 = wrestlers.find(
    (w) => String(w.id) === String(answers.player1)
  );
  const player2 = wrestlers.find(
    (w) => String(w.id) === String(answers.player2)
  );

  if (!player1 || !player2) {
    return json({ error: "No se pudieron recuperar ambas respuestas." }, 500);
  }

  const result = calculateCloserResult(
    { ...round, answers },
    player1,
    player2
  );

  let player1Score = room.player1_score;
  let player2Score = room.player2_score;

  if (result.winner === "player1") player1Score++;
  if (result.winner === "player2") player2Score++;

  const historyEntry = {
    roundNumber: room.round_number,
    challenge: round.challenge.label,
    reference: publicWrestler(round.reference),
    player1: publicWrestler(player1),
    player2: publicWrestler(player2),
    result
  };

  const updatedRound = {
    ...round,
    answers,
    selectedWrestlers: {
      player1,
      player2
    },
    result
  };

  const updated = await saveRoom(room, {
    round_data: updatedRound,
    player1_score: player1Score,
    player2_score: player2Score,
    history: [...(room.history || []), historyEntry]
  });

  return json({
    room: publicRoom(updated, player)
  });
}

async function nextRound(body) {
  const auth = await getAuthenticatedRoom(body);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const { room, player } = auth;

  // Solo el anfitrión avanza para evitar saltar rondas si ambos hacen clic.
  if (player !== "player1") {
    return json({
      error: "Espera a que el anfitrión avance a la siguiente ronda."
    }, 403);
  }

  if (room.status !== "playing") {
    return json({ error: "La partida no está en curso." }, 409);
  }

  if (!room.round_data?.result) {
    return json({ error: "Ambos jugadores deben responder primero." }, 409);
  }

  if (room.round_number >= TOTAL_ROUNDS) {
    const updated = await saveRoom(room, {
      status: "finished"
    });

    return json({ room: publicRoom(updated, player) });
  }

  const wrestlers = await getWrestlers();
  const round = chooseCloserRound(wrestlers);

  const updated = await saveRoom(room, {
    round_number: room.round_number + 1,
    round_data: round
  });

  return json({ room: publicRoom(updated, player) });
}

export async function POST(request) {
  try {
    const body = await request.json();

    switch (body.action) {
      case "create":
        return await createRoom(body);
      case "join":
        return await joinRoom(body);
      case "state":
        return await getState(body);
      case "answer":
        return await submitAnswer(body);
      case "next":
        return await nextRound(body);
      default:
        return json({ error: "Acción no válida." }, 400);
    }
  } catch (error) {
    console.error("Error en ¿Quién está más cerca?:", error);

    return json(
      { error: error.message || "Ocurrió un error inesperado." },
      500
    );
  }
}
