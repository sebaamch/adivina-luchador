
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { codigo } = await params;

    const { data: challenge, error } = await supabaseAdmin
      .from("custom_challenges")
      .select("id, code, title, format, instructions, status, settings")
      .eq("code", codigo.toUpperCase())
      .maybeSingle();

    if (error) throw error;

    if (!challenge) {
      return NextResponse.json(
        { error: "El desafío no existe." },
        { status: 404 }
      );
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("custom_challenge_items")
      .select("wrestler_id, position")
      .eq("challenge_id", challenge.id)
      .not("wrestler_id", "is", null)
      .order("position", { ascending: true });

    if (itemsError) throw itemsError;

    let wrestlers = [];

    if (challenge.format === "impostor") {
      const wrestlerIds = (items ?? [])
        .map((item) => item.wrestler_id)
        .filter(Boolean);

      if (wrestlerIds.length !== 4) {
        return NextResponse.json(
          { error: "El desafío no tiene cuatro luchadores configurados." },
          { status: 400 }
        );
      }

      const { data: wrestlerData, error: wrestlersError } =
        await supabaseAdmin
          .from("wrestlers")
          .select("id, name, local_image")
          .in("id", wrestlerIds);

      if (wrestlersError) throw wrestlersError;

      // Mantener el orden definido por el creador.
      wrestlers = items.map((item) => {
        const wrestler = wrestlerData.find(
          (w) => Number(w.id) === Number(item.wrestler_id)
        );

        if (!wrestler) return null;

        return {
          id: wrestler.id,
          name: wrestler.name,
          local_image:
            wrestler.local_image || `/wrestlers/${wrestler.id}.svg`,
          position: item.position,
        };
      });

      if (wrestlers.some((w) => !w)) {
        return NextResponse.json(
          { error: "No fue posible cargar todos los luchadores." },
          { status: 500 }
        );
      }
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
          wrestlers,
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
