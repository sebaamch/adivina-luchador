import { NextResponse } from "next/server";
import { getWrestlers } from "@/lib/localdb";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json({ wrestlers: [] });
    const wrestlers = getWrestlers(q).map((w) => ({ id: w.id, name: w.name, image_url: w.image_url ?? null, local_image: w.local_image ?? `/wrestlers/${w.id}.svg` }));
    return NextResponse.json({ wrestlers });
  } catch (error) { return NextResponse.json({ error: error.message ?? "Error buscando luchadores" }, { status: 500 }); }
}
