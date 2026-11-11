
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function registrarEventos({
  challengeId,
  playerName,
  wrestlerId,
  correct,
  answered,
}) {
  const eventos = [
    {
      challenge_id: challengeId,
      player_name: playerName,
      event_type: "selected",
      wrestler_id: wrestlerId,
      is_correct: null,
    },
  ];

  // Solo se registra answered cuando la respuesta es definitiva.
  // En El Impostor siempre es definitiva; en Luchador secreto,
  // solamente cuando el participante acierta.
  if (answered) {
    eventos.push({
      challenge_id: challengeId,
      player_name: playerName,
      event_type: "answered",
      wrestler_id: wrestlerId,
      is_correct: correct,
    });
  }

  const { error } = await supabaseAdmin
    .from("custom_challenge_events")
    .insert(eventos);

  if (error) throw error;
}

export async function POST(request, { params }) {
  try {
    const { codigo } = await params;
    const body = await request.json();

    const wrestlerId = Number(body.wrestler_id);
    const playerName =
      typeof body.player_name === "string" && body.player_name.trim()
        ? body.player_name.trim().slice(0, 40)
        : "Jugador";

    if (!Number.isInteger(wrestlerId) || wrestlerId <= 0) {
      return NextResponse.json(
        { error: "Debes seleccionar un luchador válido." },
        { status: 400 }
      );
    }

    const { data: challenge, error: challengeError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select("id, format, status, settings")
        .eq("code", String(codigo).toUpperCase())
        .maybeSingle();

    if (challengeError) throw challengeError;

    if (!challenge) {
      return NextResponse.json(
        { error: "El desafío no existe." },
        { status: 404 }
      );
    }

    if (!["secret_wrestler", "impostor"].includes(challenge.format)) {
      return NextResponse.json(
        { error: "Este formato todavía no está habilitado." },
        { status: 400 }
      );
    }

    if (!["waiting", "playing"].includes(challenge.status)) {
      return NextResponse.json(
        { error: "Este desafío ya no está disponible." },
        { status: 400 }
      );
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("custom_challenge_items")
      .select("wrestler_id, position")
      .eq("challenge_id", challenge.id)
      .not("wrestler_id", "is", null)
      .order("position", { ascending: true });

    if (itemsError) throw itemsError;

    // LUCHADOR SECRETO
    if (challenge.format === "secret_wrestler") {
      const solution = items?.[0];

      if (!solution?.wrestler_id) {
        return NextResponse.json(
          { error: "El creador todavía no configuró la respuesta." },
          { status: 400 }
        );
      }

      const correct = Number(solution.wrestler_id) === wrestlerId;

      // Registrar selección. Si falla, el jugador puede volver a intentar.
      await registrarEventos({
        challengeId: challenge.id,
        playerName,
        wrestlerId,
        correct,
        answered: correct,
      });

      await supabaseAdmin
        .from("custom_challenges")
        .update({ status: "playing" })
        .eq("id", challenge.id)
        .eq("status", "waiting");

      if (!correct) {
        return NextResponse.json({
          correct: false,
          message: "No es correcto. ¡Inténtalo nuevamente!",
        });
      }

      const { data: wrestler, error: wrestlerError } =
        await supabaseAdmin
          .from("wrestlers")
          .select("id, name, local_image")
          .eq("id", solution.wrestler_id)
          .single();

      if (wrestlerError) throw wrestlerError;

      return NextResponse.json({
        correct: true,
        message: "¡Correcto! Adivinaste al luchador.",
        wrestler: {
          name: wrestler.name,
          local_image:
            wrestler.local_image || `/wrestlers/${wrestler.id}.svg`,
        },
      });
    }

    // EL IMPOSTOR
    if (items?.length !== 4) {
      return NextResponse.json(
        { error: "El desafío no tiene cuatro luchadores configurados." },
        { status: 400 }
      );
    }

    const settings = challenge.settings ?? {};
    const impostorPosition = Number(settings.impostor_position);
    const impostorReason = String(
      settings.impostor_reason ?? ""
    ).trim();

    if (
      !Number.isInteger(impostorPosition) ||
      impostorPosition < 1 ||
      impostorPosition > 4 ||
      !impostorReason
    ) {
      return NextResponse.json(
        { error: "La configuración del impostor está incompleta." },
        { status: 400 }
      );
    }

    const selectedItem = items.find(
      (item) => Number(item.wrestler_id) === wrestlerId
    );

    if (!selectedItem) {
      return NextResponse.json(
        { error: "El luchador seleccionado no pertenece a este desafío." },
        { status: 400 }
      );
    }

    const impostorItem = items.find(
      (item) => Number(item.position) === impostorPosition
    );

    if (!impostorItem) {
      return NextResponse.json(
        { error: "No se encontró el impostor configurado." },
        { status: 400 }
      );
    }

    const correct =
      Number(selectedItem.wrestler_id) ===
      Number(impostorItem.wrestler_id);

    // En este formato, el primer clic ya es la respuesta definitiva.
    await registrarEventos({
      challengeId: challenge.id,
      playerName,
      wrestlerId,
      correct,
      answered: true,
    });

    await supabaseAdmin
      .from("custom_challenges")
      .update({ status: "playing" })
      .eq("id", challenge.id)
      .eq("status", "waiting");

    const { data: impostor, error: impostorError } =
      await supabaseAdmin
        .from("wrestlers")
        .select("id, name, local_image")
        .eq("id", impostorItem.wrestler_id)
        .single();

    if (impostorError) throw impostorError;

    return NextResponse.json({
      correct,
      message: correct
        ? "¡Correcto! Encontraste al impostor."
        : "¡No era ese luchador! Has fallado.",
      impostor: {
        name: impostor.name,
        local_image:
          impostor.local_image || `/wrestlers/${impostor.id}.svg`,
      },
      reason: impostorReason,
    });
  } catch (error) {
    console.error("Error comprobando respuesta:", error);

    return NextResponse.json(
      { error: "No fue posible comprobar la respuesta." },
      { status: 500 }
    );
  }
}
