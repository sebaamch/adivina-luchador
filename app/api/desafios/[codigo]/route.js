
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token, storedHash) {
    if (!token || !storedHash) return false;

    const calculatedHash = Buffer.from(hashToken(token), "hex");
    const expectedHash = Buffer.from(storedHash, "hex");

    if (calculatedHash.length !== expectedHash.length) {
        return false;
    }

    return timingSafeEqual(calculatedHash, expectedHash);
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

        // Finalizar preguntas cuando se agota el tiempo.
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

        let isCreator = false;
        let isOpponent = false;

               // Blind Top 5: autenticar creador o adversario.
        if (challenge.format === "blind_top_5") {
            const authorization = request.headers.get("authorization");
            const token = authorization?.startsWith("Bearer ")
                ? authorization.slice(7)
                : null;

            isCreator = tokenMatches(
                token,
                challenge.creator_token_hash
            );

            isOpponent = tokenMatches(
                token,
                challenge.opponent_token_hash
            );

            // Permitir consulta pública únicamente de los datos
            // necesarios para identificar el desafío antes de ingresar.
            if (!isCreator && !isOpponent) {
                const {
                    creator_token_hash,
                    opponent_token_hash,
                    ...publicChallenge
                } = challenge;

                return NextResponse.json({
                    challenge: {
                        ...publicChallenge,
                    },
                    items: [],
                    wrestlers: [],
                    role: "guest",
                    requires_join: true,
                });
            }
        }

        const { data: items, error: itemsError } =
            await supabaseAdmin
                .from("custom_challenge_items")
                .select(`
                    id,
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

        let publicItems = allItems;
        let wrestlerIds = [];

        if (challenge.format === "blind_top_5") {
            if (isCreator) {
                // El creador puede ver sus cinco luchadores.
                publicItems = allItems;
            } else {
                // El adversario solo puede ver los que ya fueron revelados.
                publicItems = allItems.filter(item =>
                    item.extra_data?.revealed === true ||
                    item.extra_data?.revealed === "true"
                );
            }

            wrestlerIds = publicItems
                .map(item => item.wrestler_id)
                .filter(Boolean);
        } else {
            const visibleItems =
                challenge.format === "what_would_you_choose"
                    ? allItems.slice(-2)
                    : allItems;

            const revealSecret =
                challenge.format === "yes_no_questions" &&
                currentStatus === "finished";

            const loadWrestlers =
                challenge.format === "impostor" ||
                challenge.format === "what_would_you_choose" ||
                revealSecret;

            publicItems =
                challenge.format === "yes_no_questions" && !revealSecret
                    ? []
                    : allItems;

            if (loadWrestlers) {
                wrestlerIds = visibleItems
                    .map(item => item.wrestler_id)
                    .filter(Boolean);
            }
        }

        let wrestlers = [];

        if (wrestlerIds.length > 0) {
            const { data: wrestlerData, error: wrestlerError } =
                await supabaseAdmin
                    .from("wrestlers")
                    .select("id,name,local_image")
                    .in("id", wrestlerIds);

            if (wrestlerError) throw wrestlerError;

            wrestlers = wrestlerData || [];
        }

        // Nunca enviar los hashes de autenticación al frontend.
        const {
            creator_token_hash,
            opponent_token_hash,
            ...publicChallenge
        } = challenge;

        return NextResponse.json({
            challenge: {
                ...publicChallenge,
                status: currentStatus
            },
            items: publicItems,
            wrestlers,
            ...(challenge.format === "blind_top_5"
                ? {
                    role: isCreator ? "creator" : "opponent"
                }
                : {})
        });

    } catch (error) {
        console.error("Error al obtener desafío:", error);

        return NextResponse.json(
            { error: "Error al obtener el desafío." },
            { status: 500 }
        );
    }
}
