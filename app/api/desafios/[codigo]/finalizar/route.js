
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

        const { data: challenge, error: challengeError } =
            await supabaseAdmin
                .from("custom_challenges")
                .select(`
                    id,
                    format,
                    status,
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
                { error: "Este endpoint es exclusivo de ¿Qué prefieres?." },
                { status: 400 }
            );
        }

        if (!tokenMatches(token, challenge.creator_token_hash)) {
            return NextResponse.json(
                { error: "Solo el creador puede finalizar el desafío." },
                { status: 403 }
            );
        }

        if (challenge.status !== "playing") {
            return NextResponse.json(
                { error: "El desafío no está en curso." },
                { status: 409 }
            );
        }

        // Recuperar la última elección del adversario.
        const { data: lastSelection, error: selectionError } =
            await supabaseAdmin
                .from("custom_challenge_events")
                .select("wrestler_id, player_name, created_at")
                .eq("challenge_id", challenge.id)
                .eq("event_type", "selected")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

        if (selectionError) throw selectionError;

        let winner = null;
        let winnerName = null;

        // Si existe una elección, obtener el luchador ganador.
        if (lastSelection?.wrestler_id) {
            const { data: wrestler, error: wrestlerError } =
                await supabaseAdmin
                    .from("wrestlers")
                    .select("id, name, local_image")
                    .eq("id", lastSelection.wrestler_id)
                    .maybeSingle();

            if (wrestlerError) throw wrestlerError;

            if (!wrestler) {
                return NextResponse.json(
                    { error: "No se encontró el luchador de la última elección." },
                    { status: 409 }
                );
            }

            winner = wrestler;
            winnerName = wrestler.name;
        }

        // Finalizar el desafío.
        const { data: finished, error: finishError } =
            await supabaseAdmin
                .from("custom_challenges")
                .update({
                    status: "finished",
                    winner: winnerName,
                    ends_at: new Date().toISOString(),
                })
                .eq("id", challenge.id)
                .eq("status", "playing")
                .select("status, winner, ends_at")
                .maybeSingle();

        if (finishError) throw finishError;

        if (!finished) {
            return NextResponse.json(
                { error: "El desafío ya fue finalizado o modificado." },
                { status: 409 }
            );
        }

        return NextResponse.json({
            success: true,
            message: winner
                ? "Desafío finalizado correctamente."
                : "Desafío finalizado sin ganador.",
            challenge: finished,
            winner,
        });

    } catch (error) {
        console.error("Error finalizando desafío:", error);

        return NextResponse.json(
            { error: "No fue posible finalizar el desafío." },
            { status: 500 }
        );
    }
}
