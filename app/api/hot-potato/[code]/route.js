import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/game";
import { canFormName, getAvailableWrestlers, makeHotPotatoLetters, normalizeWrestlerName } from "@/lib/hotPotato";

export const dynamic = "force-dynamic";

function playerNoForToken(game, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  if (game.player1_token_hash === tokenHash) return 1;
  if (game.player2_token_hash && game.player2_token_hash === tokenHash) return 2;
  return null;
}

async function readGame(code) {
  const { data, error } = await supabaseAdmin
    .from("hot_potato_games")
    .select("*")
    .eq("code", String(code).toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function expireIfNeeded(game) {
  if (game?.status === "playing" && game.ends_at && Date.now() >= new Date(game.ends_at).getTime()) {
    const { error } = await supabaseAdmin
      .from("hot_potato_games")
      .update({ status: "finished" })
      .eq("id", game.id)
      .eq("status", "playing");
    if (error) throw error;
    return { ...game, status: "finished" };
  }
  return game;
}

function publicRoom(game, playerNo) {
  return {
    code: game.code,
    status: game.status,
    playerNo,
    players: [
      { playerNo: 1, name: game.player1_name, score: game.player1_score || 0 },
      ...(game.player2_name ? [{ playerNo: 2, name: game.player2_name, score: game.player2_score || 0 }] : [])
    ],
    turnPlayer: game.status === "playing" ? game.turn_player : null,
    currentLetters: game.current_letters || [],
    startedAt: game.started_at,
    endsAt: game.ends_at,
    player1Score: game.player1_score || 0,
    player2Score: game.player2_score || 0,
    history: game.history || [],
    winner: game.status !== "finished" ? null : (game.player1_score === game.player2_score ? "draw" : game.player1_score > game.player2_score ? 1 : 2)
  };
}

export async function GET(request, { params }) {
  try {
    const { code } = await params;
    const token = new URL(request.url).searchParams.get("token");
    let game = await readGame(code);
    if (!game) return NextResponse.json({ error: "Sala no encontrada." }, { status: 404 });
    const playerNo = playerNoForToken(game, token);
    if (!playerNo) return NextResponse.json({ error: "Token de jugador inválido." }, { status: 401 });
    game = await expireIfNeeded(game);
    return NextResponse.json(publicRoom(game, playerNo));
  } catch (error) {
    console.error("Error consultando Bomba de tiempo:", error);
    return NextResponse.json({ error: error.message || "No se pudo consultar la sala." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { code } = await params;
    const body = await request.json();
    const token = body?.token;
    const answer = String(body?.answer || "").trim().slice(0, 80);
    if (!answer) return NextResponse.json({ error: "Escribe el nombre de un luchador." }, { status: 400 });

    let game = await readGame(code);
    if (!game) return NextResponse.json({ error: "Sala no encontrada." }, { status: 404 });
    const playerNo = playerNoForToken(game, token);
    if (!playerNo) return NextResponse.json({ error: "Token de jugador inválido." }, { status: 401 });
    game = await expireIfNeeded(game);
    if (game.status !== "playing") return NextResponse.json({ error: game.status === "finished" ? "La partida terminó." : "Esperando al segundo jugador." }, { status: 409 });
    if (game.turn_player !== playerNo) return NextResponse.json({ error: "No es tu turno." }, { status: 409 });

    const wrestlers = await getAvailableWrestlers();
    const normalizedAnswer = normalizeWrestlerName(answer);
    const wrestler = wrestlers.find((w) => normalizeWrestlerName(w.name) === normalizedAnswer) || null;
    const usedIds = (game.used_wrestler_ids || []).map(String);
    const alreadyUsed = wrestler ? usedIds.includes(String(wrestler.id)) : false;
    const lettersMatch = wrestler ? canFormName(wrestler.name, game.current_letters || []) : false;
    const scoredWrestler = wrestler && !alreadyUsed && lettersMatch ? wrestler : null;
    const nextUsedIds = scoredWrestler ? [...usedIds, String(scoredWrestler.id)] : usedIds;
    const nextLetters = await makeHotPotatoLetters(nextUsedIds);

    const { data: result, error: rpcError } = await supabaseAdmin.rpc("submit_hot_potato_turn", {
      p_code: String(code).toUpperCase(),
      p_player_no: playerNo,
      p_wrestler_id: scoredWrestler ? String(scoredWrestler.id) : null,
      p_answer_name: answer,
      p_new_letters: nextLetters
    });
    if (rpcError) throw rpcError;
    if (!result?.ok) {
      const errors = {
        not_found: "Sala no encontrada.",
        not_playing: "La partida ya no está activa.",
        wrong_turn: "El turno cambió; actualicé la partida.",
        time_expired: "Se acabó el tiempo. La partida terminó."
      };
      return NextResponse.json({ error: errors[result?.error] || "No se pudo registrar el turno." }, { status: 409 });
    }

    let message;
    if (result.scored) message = `¡Correcto! ${scoredWrestler.name} suma un punto.`;
    else if (!wrestler) message = "Ese nombre no existe en la base de datos. El turno pasa al rival.";
    else if (alreadyUsed) message = "Ese luchador ya fue utilizado. El turno pasa al rival.";
    else message = "Ese nombre no se puede formar con las letras disponibles. El turno pasa al rival.";

    return NextResponse.json({ success: true, scored: Boolean(result.scored), message, room: result });
  } catch (error) {
    console.error("Error enviando respuesta Bomba de tiempo:", error);
    return NextResponse.json({ error: error.message || "No se pudo registrar la respuesta." }, { status: 500 });
  }
}
