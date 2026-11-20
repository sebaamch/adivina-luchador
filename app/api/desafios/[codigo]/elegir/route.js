
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

function getErrorStatus(message) {
    const conflictMessages = [
        "no está en curso",
        "ya elegiste",
        "esperar",
        "ronda actual",
        "no se puede elegir",
        "no tiene dos luchadores",
    ];

    return conflictMessages.some(text =>
        message.toLowerCase().includes(text)
    ) ? 409 : 400;
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
        if (challenge.format !== "what_would_you_choose") {
            return NextResponse.json(
                {
                    error: "Este endpoint es exclusivo de ¿Qué prefieres?."
                },
                { status: 400 }
            );
        }

        // Solo el adversario puede elegir.
        if (!tokenMatches(token, challenge.opponent_token_hash)) {
            return NextResponse.json(
                {
                    error: "Solo el adversario puede elegir un luchador."
                },
                { status: 403 }
            );
        }

        // Registrar elección mediante RPC.
        const { data: result, error: rpcError } =
            await supabaseAdmin.rpc("registrar_eleccion", {
                p_challenge_id: challenge.id,
                p_wrestler_id: wrestlerId,
            });

        if (rpcError) {
            console.error("Error en RPC registrar_eleccion:", rpcError);

            const message = rpcError.message || "No fue posible registrar la elección.";

            return NextResponse.json(
                { error: message },
                { status: getErrorStatus(message) }
            );
        }

        if (!result || result.success !== true) {
            return NextResponse.json(
                {
                    error: result?.error || "No fue posible registrar la elección."
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Elección registrada correctamente.",
            round_number: result.round_number,
            event: result.event,
            wrestler: result.wrestler,
        });

    } catch (error) {
        console.error("Error registrando elección:", error);

        return NextResponse.json(
            { error: "No fue posible registrar la elección." },
            { status: 500 }
        );
    }
}
