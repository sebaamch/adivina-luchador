
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    // El buscador necesita al menos 2 caracteres.
    if (q.length < 2) {
      return NextResponse.json({ wrestlers: [] });
    }

    const { data, error } = await supabase
      .from("wrestlers")
      .select("id, name,local_image")
      .eq("eligible", true)
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(12);

    if (error) {
      console.error("Error buscando luchadores en Supabase:", error);

      return NextResponse.json(
        { error: "Error buscando luchadores en Supabase" },
        { status: 500 }
      );
    }

    const wrestlers = (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      local_image: w.local_image ?? `/wrestlers/${w.id}.svg`,
    }));

    return NextResponse.json(
      { wrestlers },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Error en /api/wrestlers:", error);

    return NextResponse.json(
      { error: "Error interno buscando luchadores" },
      { status: 500 }
    );
  }
}
