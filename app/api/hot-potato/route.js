import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { makeRoomCode, makeToken, hashToken } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const playerName = String(body?.playerName || "").trim().slice(0, 24);
    if (playerName.length < 2) {
      return NextResponse.json({ error: "Ingresa un nombre de al menos 2 caracteres." }, { status: 400 });
    }

    let code;
    let existing;
    do {
      code = makeRoomCode();
      const { data, error } = await supabaseAdmin
        .from("hot_potato_games")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      existing = data;
    } while (existing);

    const token = makeToken();
    const { data, error } = await supabaseAdmin
      .from("hot_potato_games")
      .insert({
        code,
        status: "waiting",
        player1_name: playerName,
        player1_token_hash: hashToken(token),
        turn_player: 1,
        player1_score: 0,
        player2_score: 0,
        current_letters: [],
        used_wrestler_ids: [],
        history: []
      })
      .select("id, code, status")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, game: data, player: { playerNo: 1, name: playerName, token } });
  } catch (error) {
    console.error("Error creando partida Bomba de tiempo:", error);
    return NextResponse.json({ error: error.message || "No se pudo crear la partida." }, { status: 500 });
  }
}
