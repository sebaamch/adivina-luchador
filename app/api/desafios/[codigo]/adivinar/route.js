
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function compararTokens(token, hashGuardado) {
    if (!token || !hashGuardado) return false;

    const recibido = Buffer.from(hashToken(token));
    const guardado = Buffer.from(hashGuardado);

    if (recibido.length !== guardado.length) return false;

    return timingSafeEqual(recibido, guardado);
}

export async function POST(request, { params }) {
    try {
        const { codigo } = await params;

        const authorization = request.headers.get("authorization");
        const token = authorization?.startsWith("Bearer ")
            ? authorization.slice(7)
            : null;

        if (!token) {
            return NextResponse.json(
                { error: "Token de autenticación requerido." },
                { status: 401 }
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
                    ends_at,
                    opponent_name,
                    opponent_token_hash
                `)
                .eq("code", codigo)
                .single();

        if (challengeError || !challenge) {
            return NextResponse.json(
                { error: "Desafío no encontrado." },
                { status: 404 }
            );
        }

        if (challenge.format !== "yes_no_questions") {
            return NextResponse.json(
                { error: "Este formato no admite esta acción." },
                { status: 400 }
            );
        }

        if (!compararTokens(token, challenge.opponent_token_hash)) {
            return NextResponse.json(
                { error: "No tienes autorización para adivinar." },
                { status: 403 }
            );
        }

        if (challenge.status !== "playing") {
            return NextResponse.json(
                { error: "La partida no está en curso." },
                { status: 400 }
            );
        }

        if (!challenge.ends_at || new Date(challenge.ends_at) <= new Date()) {
            return NextResponse.json(
                { error: "El tiempo de la partida ha terminado." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const wrestlerId = body.wrestler_id;

        if (!wrestlerId) {
            return NextResponse.json(
                { error: "Debes seleccionar un luchador." },
                { status: 400 }
            );
        }

        // Obtener el luchador secreto del desafío.
        const { data: secretItem, error: secretError } =
            await supabaseAdmin
                .from("custom_challenge_items")
                .select("wrestler_id")
                .eq("challenge_id", challenge.id)
                .single();

        if (secretError || !secretItem) {
            return NextResponse.json(
                { error: "No se encontró el luchador secreto." },
                { status: 500 }
            );
        }

        const correct =
            String(wrestlerId) === String(secretItem.wrestler_id);

        // Si falla, la partida continúa.
        if (!correct) {
            return NextResponse.json({
                success: true,
                correct: false,
                message: "No es el luchador correcto. ¡Sigue intentando!"
            });
        }

        // Obtener los datos del luchador para revelarlo.
        const { data: wrestler, error: wrestlerError } =
            await supabaseAdmin
                .from("wrestlers")
                .select("id,name,local_image")
                .eq("id", secretItem.wrestler_id)
                .single();

        if (wrestlerError || !wrestler) {
            throw wrestlerError || new Error("No se encontró el luchador.");
        }

        // Finalizar la partida.
        const { data: finishedChallenge, error: finishError } =
            await supabaseAdmin
                .from("custom_challenges")
                .update({
                    status: "finished",
                    winner: challenge.opponent_name || "Adversario"
                })
                .eq("id", challenge.id)
                .eq("status", "playing")
                .select("status,winner")
                .maybeSingle();

        if (finishError) {
            throw finishError;
        }

        if (!finishedChallenge) {
            return NextResponse.json(
                { error: "La partida ya fue finalizada." },
                { status: 409 }
            );
        }

        return NextResponse.json({
            success: true,
            correct: true,
            finished: true,
            winner: finishedChallenge.winner,
            wrestler: {
                id: wrestler.id,
                name: wrestler.name,
                local_image: wrestler.local_image
            },
            message: "¡Correcto! Descubriste al luchador secreto."
        });

    } catch (error) {
        console.error("Error al adivinar luchador:", error);

        return NextResponse.json(
            { error: "Error interno al procesar la respuesta." },
            { status: 500 }
        );
    }
}
