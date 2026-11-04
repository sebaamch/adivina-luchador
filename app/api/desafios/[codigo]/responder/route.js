import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const { codigo } = await params;
    const body = await request.json();
    const wrestlerId = Number(body.wrestler_id);

    if (!Number.isInteger(wrestlerId) || wrestlerId <= 0) {
      return NextResponse.json(
        { error: "Debes seleccionar un luchador válido." },
        { status: 400 }
      );
    }

    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from("custom_challenges")
      .select("id, format, status")
      .eq("code", codigo.toUpperCase())
      .maybeSingle();

    if (challengeError) throw challengeError;

    if (!challenge) {
      return NextResponse.json(
        { error: "El desafío no existe." },
        { status: 404 }
      );
    }

    if (challenge.format !== "secret_wrestler") {
      return NextResponse.json(
        { error: "Este formato todavía no está habilitado." },
        { status: 400 }
      );
    }

    if (challenge.status !== "waiting" && challenge.status !== "playing") {
      return NextResponse.json(
        { error: "Este desafío ya no está disponible." },
        { status: 400 }
      );
    }

    const { data: solution, error: solutionError } = await supabaseAdmin
      .from("custom_challenge_items")
      .select("wrestler_id")
      .eq("challenge_id", challenge.id)
      .not("wrestler_id", "is", null)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (solutionError) throw solutionError;

    if (!solution?.wrestler_id) {
      return NextResponse.json(
        { error: "El creador todavía no configuró la respuesta." },
        { status: 400 }
      );
    }

    const correct = Number(solution.wrestler_id) === wrestlerId;

    if (!correct) {
      return NextResponse.json({
        correct: false,
        message: "No es correcto. ¡Inténtalo nuevamente!",
      });
    }

    const { data: wrestler, error: wrestlerError } = await supabaseAdmin
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
        local_image: wrestler.local_image ?? `/wrestlers/${wrestler.id}.svg`,
      },
    });
  } catch (error) {
    console.error("Error comprobando respuesta:", error);

    return NextResponse.json(
      { error: "No fue posible comprobar la respuesta." },
      { status: 500 }
    );
  }
}