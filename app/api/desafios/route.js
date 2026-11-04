
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_FORMATS = [
  "secret_wrestler",
  "impostor",
  "similarity",
  "blind_ranking",
  "top_10",
  "custom",
];

function generateCode() {
  return randomBytes(4)
    .toString("hex")
    .toUpperCase()
    .slice(0, 6);
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      creator_name,
      format,
      title,
      instructions = "",
      settings = {},
      items = [],
      clues = [],
    } = body;

    if (!creator_name?.trim() || !title?.trim()) {
      return NextResponse.json(
        { error: "Debes indicar el nombre del creador y el título." },
        { status: 400 }
      );
    }

    if (!ALLOWED_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: "Formato de desafío no válido." },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || !Array.isArray(clues)) {
      return NextResponse.json(
        { error: "Los elementos y las pistas deben ser listas." },
        { status: 400 }
      );
    }

    // Generar un código único
    let code;
    let challenge;
    let error;

    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateCode();

      const result = await supabaseAdmin
        .from("custom_challenges")
        .insert({
          code,
          creator_name: creator_name.trim(),
          format,
          title: title.trim(),
          instructions,
          settings,
          status: "waiting",
        })
        .select("id, code, title, format, status")
        .single();

      challenge = result.data;
      error = result.error;

      if (!error) break;

      if (error.code !== "23505") {
        throw error;
      }
    }

    if (!challenge) {
      throw error || new Error("No fue posible generar un código único.");
    }

    // Guardar elementos del desafío
    if (items.length > 0) {
      const challengeItems = items.map((item, index) => ({
        challenge_id: challenge.id,
        wrestler_id: item.wrestler_id ?? null,
        custom_text: item.custom_text ?? null,
        custom_image: item.custom_image ?? null,
        position: item.position ?? index + 1,
        extra_data: item.extra_data ?? {},
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("custom_challenge_items")
        .insert(challengeItems);

      if (itemsError) throw itemsError;
    }

    // Guardar pistas
    if (clues.length > 0) {
      const challengeClues = clues.map((clue, index) => ({
        challenge_id: challenge.id,
        clue_text: typeof clue === "string" ? clue : clue.text,
        position: index + 1,
      }));

      const { error: cluesError } = await supabaseAdmin
        .from("custom_challenge_clues")
        .insert(challengeClues);

      if (cluesError) throw cluesError;
    }

    return NextResponse.json(
      {
        success: true,
        challenge: {
          id: challenge.id,
          code: challenge.code,
          title: challenge.title,
          format: challenge.format,
          status: challenge.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creando desafío:", error);

    return NextResponse.json(
      { error: "No fue posible crear el desafío." },
      { status: 500 }
    );
  }
}
