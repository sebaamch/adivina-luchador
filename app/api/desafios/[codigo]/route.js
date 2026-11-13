
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// INGRESAR COMO ADVERSARIO
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
                    winner
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

            if (finishError) {
                throw finishError;
            }

            if (finished) {
                currentStatus = finished.status;
                challenge.winner = finished.winner;
            } else {
                // Otra petición pudo finalizar la partida simultáneamente.
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

        const { data: items, error: itemsError } =
            await supabaseAdmin
                .from("custom_challenge_items")
                .select(`
                    wrestler_id,
                    position,
                    custom_text,
                    custom_image
                `)
                .eq("challenge_id", challenge.id)
                .order("position", { ascending: true });

        if (itemsError) {
            throw itemsError;
        }

        let wrestlers = [];

        // El secreto solo se revela al terminar la partida.
        const revealSecret =
            challenge.format === "yes_no_questions" &&
            currentStatus === "finished";

        // Impostor conserva su comportamiento anterior.
        const loadWrestlers =
        challenge.format === "impostor" ||
        challenge.format === "what_would_you_choose" ||
        revealSecret;

        if (loadWrestlers && items?.length) {
            const wrestlerIds = items
                .map(item => item.wrestler_id)
                .filter(Boolean);

            if (wrestlerIds.length > 0) {
                const { data: wrestlerData, error: wrestlerError } =
                    await supabaseAdmin
                        .from("wrestlers")
                        .select("id,name,local_image")
                        .in("id", wrestlerIds);

                if (wrestlerError) {
                    throw wrestlerError;
                }

                wrestlers = wrestlerData || [];
            }
        }

        // No enviar los IDs de los luchadores secretos
        // mientras la partida de preguntas siga activa.
        const publicItems =
            challenge.format === "yes_no_questions" && !revealSecret
                ? []
                : (items || []);

        return NextResponse.json({
            challenge: {
                ...challenge,
                status: currentStatus
            },
            items: publicItems,
            wrestlers
        });

    } catch (error) {
        console.error("Error al obtener desafío:", error);

        return NextResponse.json(
            { error: "Error al obtener el desafío." },
            { status: 500 }
        );
    }
}
