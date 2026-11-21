
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

        // Obtener token del adversario.
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

        // Obtener luchador y posición seleccionados.
        const body = await request.json();

        const wrestlerId = Number(body.wrestler_id);
        const position = Number(body.position);

        if (!Number.isInteger(wrestlerId) || wrestlerId <= 0) {
            return NextResponse.json(
                { error: "Debes seleccionar un luchador válido." },
                { status: 400 }
            );
        }

        if (!Number.isInteger(position) || position < 1 || position > 5) {
            return NextResponse.json(
                { error: "La posición debe estar entre 1 y 5." },
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
                    status,
                    opponent_token_hash
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

        // Solo el adversario puede asignar posiciones.
        if (!tokenMatches(token, challenge.opponent_token_hash)) {
            return NextResponse.json(
                { error: "Solo el adversario puede asignar posiciones." },
                { status: 403 }
            );
        }

        // Ejecutar RPC.
        const tokenHash = createHash("sha256")
            .update(token)
            .digest("hex");

        const { data: result, error: rpcError } =
            await supabaseAdmin.rpc("blind_top_5_assign", {
                p_code: String(codigo).toUpperCase(),
                p_token_hash: tokenHash,
                p_wrestler_id: wrestlerId,
                p_assigned_position: position,
            });
        if (rpcError) {
            console.error("Error en RPC blind_top_5_assign:", rpcError);

            return NextResponse.json(
                {
                    error: rpcError.message ||
                        "No fue posible asignar el luchador."
                },
                { status: 400 }
            );
        }

        if (!result || result.success !== true) {
            return NextResponse.json(
                {
                    error: result?.error ||
                        "No fue posible asignar el luchador."
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Luchador asignado correctamente.",
            wrestler: result.wrestler,
            position: result.assigned_position,
        });

    } catch (error) {
        console.error("Error asignando luchador:", error);

        return NextResponse.json(
            { error: "No fue posible asignar el luchador." },
            { status: 500 }
        );
    }
}
