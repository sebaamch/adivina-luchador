
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function validarToken(token, tokenHashGuardado) {
  if (!token || !tokenHashGuardado) {
    return false;
  }

  try {
    const recibido = hashToken(token);
    const guardado = Buffer.from(tokenHashGuardado, "hex");

    if (recibido.length !== guardado.length) {
      return false;
    }

    return timingSafeEqual(recibido, guardado);
  } catch {
    return false;
  }
}

export async function GET(request, { params }) {
  try {
    const { codigo } = await params;
    const codigoNormalizado = String(codigo || "").toUpperCase();

    // Obtener el token enviado por el creador
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 401 }
      );
    }

    // Buscar el desafío y su hash privado
    const { data: challenge, error: challengeError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select("id, code, title, creator_name, status, creator_token_hash")
        .eq("code", codigoNormalizado)
        .maybeSingle();

    if (challengeError) {
      throw challengeError;
    }

    if (!challenge) {
      return NextResponse.json(
        { error: "El desafío no existe." },
        { status: 404 }
      );
    }

    // Validar que el solicitante sea el creador
    if (!validarToken(token, challenge.creator_token_hash)) {
      return NextResponse.json(
        { error: "No tienes permiso para observar este desafío." },
        { status: 403 }
      );
    }

    // Consultar eventos registrados
    const { data: eventos, error: eventosError } =
      await supabaseAdmin
        .from("custom_challenge_events")
        .select(`
          id,
          player_name,
          event_type,
          wrestler_id,
          is_correct,
          created_at
        `)
        .eq("challenge_id", challenge.id)
        .order("created_at", { ascending: true });

    if (eventosError) {
      throw eventosError;
    }

    // Obtener nombres e imágenes de los luchadores relacionados
    const wrestlerIds = [
      ...new Set(
        (eventos || [])
          .map((evento) => evento.wrestler_id)
          .filter((id) => id !== null)
      ),
    ];

    let wrestlersMap = {};

    if (wrestlerIds.length > 0) {
      const { data: wrestlers, error: wrestlersError } =
        await supabaseAdmin
          .from("wrestlers")
          .select("id, name, local_image")
          .in("id", wrestlerIds);

      if (wrestlersError) {
        throw wrestlersError;
      }

      wrestlersMap = Object.fromEntries(
        (wrestlers || []).map((wrestler) => [
          wrestler.id,
          wrestler,
        ])
      );
    }

    const eventosConLuchadores = (eventos || []).map((evento) => ({
      ...evento,
      wrestler: evento.wrestler_id
        ? wrestlersMap[evento.wrestler_id] || null
        : null,
    }));

    return NextResponse.json(
      {
        success: true,
        challenge: {
          code: challenge.code,
          title: challenge.title,
          creator_name: challenge.creator_name,
          status: challenge.status,
        },
        eventos: eventosConLuchadores,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error consultando eventos del desafío:", error);

    return NextResponse.json(
      { error: "No fue posible consultar la actividad del desafío." },
      { status: 500 }
    );
  }
}
