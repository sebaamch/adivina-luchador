
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
    return createHash("sha256").update(token).digest();
}

function validarToken(token, tokenHashGuardado) {
    if (!token || !tokenHashGuardado) return false;

    try {
        const recibido = hashToken(token);
        const guardado = Buffer.from(tokenHashGuardado, "hex");

        if (recibido.length !== guardado.length) return false;

        return timingSafeEqual(recibido, guardado);
    } catch {
        return false;
    }
}
export async function POST(request, { params }) {
    try {
        const { codigo } = await params;

        const body = await request.json();
        const playerName = String(body.player_name || "").trim();

        if (!playerName) {
            return NextResponse.json(
                { error: "Debes ingresar un nombre de jugador." },
                { status: 400 }
            );
        }

        const { data: challenge, error: challengeError } =
            await supabaseAdmin
                .from("custom_challenges")
                .select(`
                    id,
                    code,
                    format,
                    status,
                    opponent_name,
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

        const supportedFormats = [
            "yes_no_questions",
            "what_would_you_choose",
            "blind_top_5"
        ];

        if (!supportedFormats.includes(challenge.format)) {
            return NextResponse.json(
                { error: "Este formato no permite ingresar mediante esta ruta." },
                { status: 400 }
            );
        }

        if (challenge.status !== "waiting") {
            return NextResponse.json(
                { error: "El desafío ya comenzó o finalizó." },
                { status: 409 }
            );
        }

        if (
            challenge.opponent_token_hash ||
            challenge.opponent_name
        ) {
            return NextResponse.json(
                { error: "Este desafío ya tiene un adversario registrado." },
                { status: 409 }
            );
        }

        // Generar token privado para el adversario.
        const opponentToken = randomBytes(32).toString("hex");
        const opponentTokenHash = hashToken(opponentToken).toString("hex");

        const updateData = {
            opponent_name: playerName,
            opponent_token_hash: opponentTokenHash
        };

        // Top 5 a ciegas comienza inmediatamente al ingresar
        // el segundo participante.
        if (challenge.format === "blind_top_5") {
            updateData.status = "playing";
            updateData.started_at = new Date().toISOString();
            updateData.ends_at = null;
        }

        // La condición evita que dos jugadores ingresen
        // simultáneamente al mismo desafío.
        const { data: updatedChallenge, error: updateError } =
            await supabaseAdmin
                .from("custom_challenges")
                .update(updateData)
                .eq("id", challenge.id)
                .eq("status", "waiting")
                .is("opponent_token_hash", null)
                .is("opponent_name", null)
                .select("status")
                .maybeSingle();

        if (updateError) throw updateError;

        if (!updatedChallenge) {
            return NextResponse.json(
                { error: "Otro jugador ya ingresó o el desafío ya comenzó." },
                { status: 409 }
            );
        }

        return NextResponse.json({
            success: true,
            opponent_token: opponentToken,
            status: updatedChallenge.status
        });

    } catch (error) {
        console.error("Error al ingresar al desafío:", error);

        return NextResponse.json(
            { error: "No fue posible ingresar al desafío." },
            { status: 500 }
        );
    }
}

export async function GET(request, { params }) {
    try {
        const { codigo } = await params;

        const { data: challenge, error: challengeError } =
            await supabaseAdmin
                .from("custom_challenges")
                .select(`
                    id,
                    code,
                    title,
                    format,
                    instructions,
                    status,
                    creator_name,
                    opponent_name,
                    creator_ready,
                    opponent_ready,
                    started_at,
                    ends_at,
                    winner,
                    creator_token_hash,
                    opponent_token_hash
                `)
                .eq("code", String(codigo).toUpperCase())
                .single();

        if (challengeError || !challenge) {
            return NextResponse.json(
                { error: "Desafío no encontrado." },
                { status: 404 }
            );
        }

        let currentStatus = challenge.status;

        // Si el tiempo terminó, finalizar la partida.
        if (
            challenge.format === "yes_no_questions" &&
            currentStatus === "playing" &&
            challenge.ends_at &&
            new Date(challenge.ends_at) <= new Date()
        ) {
            const { data: finished, error: finishError } =
                await supabaseAdmin
                    .from("custom_challenges")
                    .update({
                        status: "finished",
                        winner: "Tiempo agotado"
                    })
                    .eq("id", challenge.id)
                    .eq("status", "playing")
                    .select("status,winner")
                    .maybeSingle();

            if (finishError) throw finishError;

            if (finished) {
                currentStatus = finished.status;
                challenge.winner = finished.winner;
            } else {
                const { data: refreshed, error: refreshError } =
                    await supabaseAdmin
                        .from("custom_challenges")
                        .select("status,winner")
                        .eq("id", challenge.id)
                        .single();

                if (refreshError) throw refreshError;

                currentStatus = refreshed.status;
                challenge.winner = refreshed.winner;
            }
        }

        const authorization =
            request.headers.get("authorization") || "";

        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        const isCreator = validarToken(
            token,
            challenge.creator_token_hash
        );

        const isOpponent = validarToken(
            token,
            challenge.opponent_token_hash
        );

        // Obtener elementos del desafío.
        const { data: items, error: itemsError } =
            await supabaseAdmin
                .from("custom_challenge_items")
                .select(`
                    wrestler_id,
                    position,
                    custom_text,
                    custom_image,
                    extra_data
                `)
                .eq("challenge_id", challenge.id)
                .order("position", { ascending: true });

        if (itemsError) throw itemsError;

        const allItems = items || [];

        // Mantener comportamiento de los formatos anteriores.
        const visibleItems =
            challenge.format === "what_would_you_choose"
                ? allItems.slice(-2)
                : allItems;

        let wrestlers = [];

        const revealSecret =
            challenge.format === "yes_no_questions" &&
            currentStatus === "finished";

        const loadWrestlers =
            challenge.format === "impostor" ||
            challenge.format === "what_would_you_choose" ||
            revealSecret;

        if (loadWrestlers && visibleItems.length > 0) {
            const wrestlerIds = visibleItems
                .map(item => item.wrestler_id)
                .filter(Boolean);

            if (wrestlerIds.length > 0) {
                const { data: wrestlerData, error: wrestlerError } =
                    await supabaseAdmin
                        .from("wrestlers")
                        .select("id,name,local_image")
                        .in("id", wrestlerIds);

                if (wrestlerError) throw wrestlerError;

                wrestlers = wrestlerData || [];
            }
        }

        let publicItems = allItems;

        // Los luchadores secretos de preguntas no se envían
        // mientras la partida continúa activa.
        if (
            challenge.format === "yes_no_questions" &&
            !revealSecret
        ) {
            publicItems = [];
        }

        // TOP CINCO A CIEGAS
        if (challenge.format === "blind_top_5") {
            if (!isCreator && !isOpponent) {
                return NextResponse.json(
                    { error: "No autorizado para consultar este desafío." },
                    { status: 401 }
                );
            }

            if (isCreator) {
                // El creador necesita conocer los cinco luchadores.
                publicItems = allItems;

                const wrestlerIds = allItems
                    .map(item => item.wrestler_id)
                    .filter(Boolean);

                if (wrestlerIds.length > 0) {
                    const { data: wrestlerData, error: wrestlerError } =
                        await supabaseAdmin
                            .from("wrestlers")
                            .select("id,name,local_image")
                            .in("id", wrestlerIds);

                    if (wrestlerError) throw wrestlerError;

                    wrestlers = wrestlerData || [];
                }
            } else {
                // El participante solamente recibe los luchadores
                // que ya fueron revelados mediante eventos.
                const { data: revealedEvents, error: eventsError } =
                    await supabaseAdmin
                        .from("custom_challenge_events")
                        .select("wrestler_id")
                        .eq("challenge_id", challenge.id)
                        .eq("event_type", "revealed");

                if (eventsError) throw eventsError;

                const revealedIds = [
                    ...new Set(
                        (revealedEvents || [])
                            .map(event => event.wrestler_id)
                            .filter(Boolean)
                    )
                ];

                publicItems = allItems.filter(item =>
                    revealedIds.includes(item.wrestler_id)
                );

                if (revealedIds.length > 0) {
                    const { data: wrestlerData, error: wrestlerError } =
                        await supabaseAdmin
                            .from("wrestlers")
                            .select("id,name,local_image")
                            .in("id", revealedIds);

                    if (wrestlerError) throw wrestlerError;

                    wrestlers = wrestlerData || [];
                }
            }
        }

        // No exponer hashes privados de los tokens.
        const {
            creator_token_hash,
            opponent_token_hash,
            ...publicChallenge
        } = challenge;

        return NextResponse.json(
            {
                challenge: {
                    ...publicChallenge,
                    status: currentStatus
                },
                items: publicItems,
                wrestlers
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate"
                }
            }
        );

    } catch (error) {
        console.error("Error al obtener desafío:", error);

        return NextResponse.json(
            { error: "Error al obtener el desafío." },
            { status: 500 }
        );
    }
}
