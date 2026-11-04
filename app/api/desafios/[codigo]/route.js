import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { codigo } = await params;

    const { data: challenge, error } = await supabaseAdmin
      .from("custom_challenges")
      .select("id, code, title, format, instructions, status")
      .eq("code", codigo.toUpperCase())
      .maybeSingle();

    if (error) throw error;

    if (!challenge) {
      return NextResponse.json(
        { error: "El desafío no existe." },
        { status: 404 }
      );
    }

    const { data: clues, error: cluesError } = await supabaseAdmin
      .from("custom_challenge_clues")
      .select("clue_text, position")
      .eq("challenge_id", challenge.id)
      .order("position", { ascending: true });

    if (cluesError) throw cluesError;

    return NextResponse.json(
      {
        challenge: {
          code: challenge.code,
          title: challenge.title,
          format: challenge.format,
          instructions: challenge.instructions,
          status: challenge.status,
          clues: (clues ?? []).map((clue) => clue.clue_text),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Error consultando desafío:", error);

    return NextResponse.json(
      { error: "No fue posible consultar el desafío." },
      { status: 500 }
    );
  }
}