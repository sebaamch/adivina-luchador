
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

    try {
        const received = hashToken(token);
        const stored = Buffer.from(storedHash, "hex");

        return (
            received.length === stored.length &&
            timingSafeEqual(received, stored)
        );
    } catch {
        return false;
    }
}

export async function POST(request, { params }) {
    try {
        const { codigo } = await params;

        // Obtener token del creador.
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

        // Validar luchador seleccionado.
        const body = await request.json();
        const wrestlerId = Number(body.wrestler_id);

        if (!Number.isInteger(wrestlerId) || wrestlerId <= 0) {
            return NextResponse.json(
                { error: "Debes seleccionar un luchador válido." },
                { status: 400 }
            );
        }

        // Buscar desafío.
        const { data: challenge, error: challengeError } =
            await supabaseAdmin
                .from("custom_challenges")
                .select(`
                    id,
                    format,
                    creator_token_hash
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

        // Validar formato.
        if (challenge.format !== "blind_top_5") {
            return NextResponse.json(
                { error: "Este endpoint es exclusivo de Blind Top 5." },
                { status: 400 }
            );
        }

        // Solo el creador puede revelar.
        if (!tokenMatches(token, challenge.creator_token_hash)) {
            return NextResponse.json(
                { error: "Solo el creador puede revelar luchadores." },
                { status: 403 }
            );
        }

        // Ejecutar RPC.
        const tokenHash = createHash("sha256")
            .update(token)
            .digest("hex");

        const { data: result, error: rpcError } =
            await supabaseAdmin.rpc("blind_top_5_reveal", {
                p_code: String(codigo).toUpperCase(),
                p_token_hash: tokenHash,
                p_wrestler_id: wrestlerId,
            });

        if (rpcError) {
            console.error("Error en RPC blind_top_5_reveal:", rpcError);

            return NextResponse.json(
                { error: rpcError.message || "No fue posible revelar el luchador." },
                { status: 400 }
            );
        }

        if (!result || result.success !== true) {
            return NextResponse.json(
                {
                    error: result?.error || "No fue posible revelar el luchador."
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Luchador revelado correctamente.",
            wrestler: result.wrestler,
        });

    } catch (error) {
        console.error("Error revelando luchador:", error);

        return NextResponse.json(
            { error: "No fue posible revelar el luchador." },
            { status: 500 }
        );
    }
}
