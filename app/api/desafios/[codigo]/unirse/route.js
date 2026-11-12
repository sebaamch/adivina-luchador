import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request, { params }) {
  try {
    const { codigo } = await params;
    const body = await request.json();

    const playerName =
      typeof body.player_name === "string"
        ? body.player_name.trim().slice(0, 40)
        : "";

    if (!playerName) {
      return NextResponse.json(
        { error: "Debes ingresar tu nombre." },
        { status: 400 }
      );
    }

    const { data: challenge, error: challengeError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select("id, code, format, status, creator_name, opponent_name")
        .eq("code", String(codigo).toUpperCase())
        .maybeSingle();

    if (challengeError) throw challengeError;

    if (!challenge) {
      return NextResponse.json(
        { error: "El desafío no existe." },
        { status: 404 }
      );
    }

    if (challenge.format !== "yes_no_questions") {
      return NextResponse.json(
        { error: "Este desafío no utiliza este tipo de ingreso." },
        { status: 400 }
      );
    }

    if (challenge.status !== "waiting") {
      return NextResponse.json(
        { error: "La partida ya comenzó o finalizó." },
        { status: 400 }
      );
    }

    if (
      challenge.creator_name.trim().toLowerCase() ===
      playerName.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "El creador no puede ingresar como adversario." },
        { status: 400 }
      );
    }

    if (challenge.opponent_name) {
      return NextResponse.json(
        { error: "Este desafío ya tiene un adversario." },
        { status: 409 }
      );
    }

    const opponentToken = randomBytes(32).toString("hex");
    const opponentTokenHash = hashToken(opponentToken);

    // La condición opponent_name IS NULL evita que dos personas
    // ocupen simultáneamente el lugar del adversario.
    const { data: updatedChallenge, error: updateError } =
      await supabaseAdmin
        .from("custom_challenges")
        .update({
          opponent_name: playerName,
          opponent_ready: false,
          opponent_token_hash: opponentTokenHash,
        })
        .eq("id", challenge.id)
        .eq("status", "waiting")
        .is("opponent_name", null)
        .select("code, creator_name, opponent_name, status")
        .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedChallenge) {
      return NextResponse.json(
        { error: "Otro jugador acaba de ingresar a este desafío." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      challenge: updatedChallenge,
      opponent_token: opponentToken,
    });
  } catch (error) {
    console.error("Error ingresando al desafío:", error);

    return NextResponse.json(
      { error: "No fue posible ingresar al desafío." },
      { status: 500 }
    );
  }
}