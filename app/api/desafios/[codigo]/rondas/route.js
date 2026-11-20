
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

function getErrorStatus(message = "") {
    const conflictMessages = [
        "no está en curso",
        "esperar la elección",
        "esperar la elección de la ronda actual",
        "ya participó",
        "ya fue finalizado",
        "ronda actual",
        "ambos participantes deben estar listos",
    ];

    return conflictMessages.some(text =>
        message.toLowerCase().includes(text)
    )
        ? 409
        : 400;
}

export async function POST(request, { params }) {
    try {
        const { codigo } = await params;

        // Validar token del creador.
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

        const body = await request.json();

        // Buscar desafío y validar al creador.
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

        if (challenge.format !== "what_would_you_choose") {
            return NextResponse.json(
                {
                    error: "Este endpoint es exclusivo de ¿Qué prefieres?.",
                },
                { status: 400 }
            );
        }

        if (!tokenMatches(token, challenge.creator_token_hash)) {
            return NextResponse.json(
                {
                    error: "Solo el creador puede agregar luchadores.",
                },
                { status: 403 }
            );
        }

        // Preparar los IDs para la función RPC.
        // Primera ronda: wrestler_ids con dos elementos.
        // Siguientes rondas: wrestler_id con un elemento.
        let wrestlerIds;

        if (Array.isArray(body.wrestler_ids)) {
            wrestlerIds = body.wrestler_ids;
        } else if (
            body.wrestler_id !== undefined &&
            body.wrestler_id !== null &&
            body.wrestler_id !== ""
        ) {
            wrestlerIds = [body.wrestler_id];
        } else {
            wrestlerIds = [];
        }

        // Crear la ronda directamente en Supabase.
        const { data: result, error: rpcError } =
            await supabaseAdmin.rpc("crear_ronda", {
                p_challenge_id: challenge.id,
                p_wrestler_ids: wrestlerIds,
            });

        if (rpcError) {
            console.error("Error en RPC crear_ronda:", rpcError);

            return NextResponse.json(
                {
                    error: rpcError.message || "No fue posible crear la ronda.",
                },
                {
                    status: getErrorStatus(rpcError.message),
                }
            );
        }

        // Obtener los datos de los luchadores insertados.
        const insertedItems = result?.items || [];

        const insertedWrestlerIds = insertedItems
            .map(item => Number(item.wrestler_id))
            .filter(id => Number.isInteger(id) && id > 0);

        let wrestlers = [];

        if (insertedWrestlerIds.length > 0) {
            const { data: wrestlerData, error: wrestlerError } =
                await supabaseAdmin
                    .from("wrestlers")
                    .select("id, name, local_image")
                    .in("id", insertedWrestlerIds);

            if (wrestlerError) {
                // La ronda ya fue creada. No informar un fallo
                // que pueda provocar que el usuario intente duplicarla.
                console.error(
                    "Ronda creada, pero no se pudieron recuperar los luchadores:",
                    wrestlerError
                );
            } else {
                wrestlers = wrestlerData || [];
            }
        }

        return NextResponse.json({
            success: true,
            message: `Ronda ${result.round_number} creada correctamente.`,
            round_number: result.round_number,
            items: insertedItems,
            wrestlers,
        });

    } catch (error) {
        console.error("Error agregando ronda:", error);

        return NextResponse.json(
            {
                error: "No fue posible agregar los luchadores.",
            },
            { status: 500 }
        );
    }
}
