import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { makeToken, hashToken } from "@/lib/game";
import { makeHotPotatoLetters } from "@/lib/hotPotato";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const code = String(body?.code || "").trim().toUpperCase();
    const playerName = String(body?.playerName || "").trim().slice(0, 24);

    if (playerName.length < 2) {
      return NextResponse.json({ error: "Ingresa un nombre de al menos 2 caracteres." }, { status: 400 });
    }
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return NextResponse.json({ error: "Ingresa un código de sala válido de 6 caracteres." }, { status: 400 });
    }

    const { data: game, error: readError } = await supabaseAdmin
      .from("hot_potato_games")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (readError) throw readError;
    if (!game) return NextResponse.json({ error: "No existe una sala con ese código." }, { status: 404 });
    if (game.status !== "waiting" || game.player2_name) {
      return NextResponse.json({ error: "La sala ya comenzó o está completa." }, { status: 409 });
    }

    const currentLetters = await makeHotPotatoLetters(game.used_wrestler_ids || []);
    const token = makeToken();
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 90_000);

    // La condición evita que dos personas ocupen simultáneamente el segundo puesto.
    const { data: joined, error: joinError } = await supabaseAdmin
      .from("hot_potato_games")
      .update({
        player2_name: playerName,
        player2_token_hash: hashToken(token),
        status: "playing",
        turn_player: 1,
        started_at: startedAt.toISOString(),
        ends_at: endsAt.toISOString(),
        current_letters: currentLetters
      })
      .eq("id", game.id)
      .eq("status", "waiting")
      .is("player2_name", null)
      .select("id, code, status, current_letters, started_at, ends_at")
      .maybeSingle();

    if (joinError) throw joinError;
    if (!joined) return NextResponse.json({ error: "Otro jugador ya ocupó esta sala. Prueba otra vez." }, { status: 409 });

    return NextResponse.json({ success: true, game: joined, player: { playerNo: 2, name: playerName, token } });
  } catch (error) {
    console.error("Error uniéndose a Bomba de tiempo:", error);
    return NextResponse.json({ error: error.message || "No se pudo unir a la partida." }, { status: 500 });
  }
}
