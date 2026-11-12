
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;

  const received = hashToken(token);
  const stored = Buffer.from(storedHash, "hex");

  return (
    stored.length === received.length &&
    timingSafeEqual(stored, received)
  );
}

export async function POST(request, { params }) {
  try {
    const { codigo } = await params;
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    const body = await request.json();
    const role = body.role;

    if (!token || !["creator", "opponent"].includes(role)) {
      return NextResponse.json(
        { error: "Credenciales o participante no válidos." },
        { status: 401 }
      );
    }

    const { data: challenge, error: challengeError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select(`
          id,
          format,
          status,
          creator_token_hash,
          opponent_token_hash,
          opponent_name,
          creator_ready,
          opponent_ready,
          started_at,
          ends_at
        `)
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
        { error: "Este formato no utiliza sala de espera." },
        { status: 400 }
      );
    }

    const expectedHash =
      role === "creator"
        ? challenge.creator_token_hash
        : challenge.opponent_token_hash;

    if (!tokenMatches(token, expectedHash)) {
      return NextResponse.json(
        { error: "No tienes autorización para esta sala." },
        { status: 403 }
      );
    }

    if (challenge.status !== "waiting") {
      return NextResponse.json(
        { error: "La partida ya comenzó o finalizó." },
        { status: 409 }
      );
    }

    if (role === "opponent" && !challenge.opponent_name) {
      return NextResponse.json(
        { error: "Todavía no ha ingresado el adversario." },
        { status: 400 }
      );
    }

    // Registrar la confirmación del participante.
    const readyColumn =
      role === "creator" ? "creator_ready" : "opponent_ready";

    const { error: readyError } = await supabaseAdmin
      .from("custom_challenges")
      .update({ [readyColumn]: true })
      .eq("id", challenge.id)
      .eq("status", "waiting");

    if (readyError) throw readyError;

    // Consultar el estado actualizado de ambos participantes.
    const { data: current, error: currentError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select(`
          status,
          creator_ready,
          opponent_ready,
          started_at,
          ends_at
        `)
        .eq("id", challenge.id)
        .single();

    if (currentError) throw currentError;

    // La partida comienza cuando ambos están listos.
    if (
      current.status === "waiting" &&
      current.creator_ready &&
      current.opponent_ready
    ) {
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + 90 * 1000);

      const { error: startError } = await supabaseAdmin
        .from("custom_challenges")
        .update({
          status: "playing",
          started_at: startedAt.toISOString(),
          ends_at: endsAt.toISOString(),
        })
        .eq("id", challenge.id)
        .eq("status", "waiting")
        .is("started_at", null);

      if (startError) throw startError;
    }

    // Devolver el estado definitivo de la sala.
    const { data: finalState, error: finalError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select(`
          status,
          creator_ready,
          opponent_ready,
          started_at,
          ends_at
        `)
        .eq("id", challenge.id)
        .single();

    if (finalError) throw finalError;

    return NextResponse.json({
      success: true,
      room: finalState,
    });
  } catch (error) {
    console.error("Error marcando participante listo:", error);

    return NextResponse.json(
      { error: "No fue posible actualizar el estado de la sala." },
      { status: 500 }
    );
  }
}
