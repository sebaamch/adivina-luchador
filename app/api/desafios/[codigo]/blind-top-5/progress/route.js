
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

export async function GET(request, { params }) {
    try {
        const { codigo } = await params;

        // Obtener token del participante.
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

        // Buscar desafío.
        const { data: challenge, error: challengeError } =
            await supabaseAdmin
                .from("custom_challenges")
                .select(`
                    id,
                    format,
                    creator_token_hash,
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

        if (challenge.format !== "blind_top_5") {
            return NextResponse.json(
                { error: "Este endpoint es exclusivo de Blind Top 5." },
                { status: 400 }
            );
        }

        // Identificar participante.
        let role = null;

        if (tokenMatches(token, challenge.creator_token_hash)) {
            role = "creator";
        } else if (tokenMatches(token, challenge.opponent_token_hash)) {
            role = "opponent";
        }

        if (!role) {
            return NextResponse.json(
                { error: "No tienes autorización para consultar el progreso." },
                { status: 403 }
            );
        }

        // Ejecutar RPC de progreso.
        const tokenHash = createHash("sha256")
            .update(token)
            .digest("hex");

        const { data: result, error: rpcError } =
            await supabaseAdmin.rpc("blind_top_5_progress", {
                p_code: String(codigo).toUpperCase(),
                p_token_hash: tokenHash,
            });

        if (rpcError) {
            console.error("Error en RPC blind_top_5_progress:", rpcError);

            return NextResponse.json(
                {
                    error: rpcError.message ||
                        "No fue posible consultar el progreso."
                },
                { status: 400 }
            );
        }

        if (!result || result.success !== true) {
            return NextResponse.json(
                {
                    error: result?.error ||
                        "No fue posible consultar el progreso."
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            role,
            progress: result,
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });

    } catch (error) {
        console.error("Error consultando progreso Blind Top 5:", error);

        return NextResponse.json(
            { error: "No fue posible consultar el progreso." },
            { status: 500 }
        );
    }
}
