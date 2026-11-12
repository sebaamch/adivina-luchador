
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function compararTokens(token, hashGuardado) {
    if (!token || !hashGuardado) return false;

    const hashRecibido = hashToken(token);

    const bufferRecibido = Buffer.from(hashRecibido);
    const bufferGuardado = Buffer.from(hashGuardado);

    if (bufferRecibido.length !== bufferGuardado.length) {
        return false;
    }

    return timingSafeEqual(bufferRecibido, bufferGuardado);
}

export async function POST(request, { params }) {
    try {
        const { codigo, id } = await params;

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
                    creator_token_hash
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
                { error: "Este formato no admite preguntas Sí / No." },
                { status: 400 }
            );
        }

        if (!compararTokens(token, challenge.creator_token_hash)) {
            return NextResponse.json(
                { error: "No tienes autorización para responder preguntas." },
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

        if (typeof body.answer !== "boolean") {
            return NextResponse.json(
                { error: "La respuesta debe ser Sí o No." },
                { status: 400 }
            );
        }

        const { data: question, error: questionError } =
            await supabaseAdmin
                .from("custom_challenge_questions")
                .select("id,challenge_id,player_name,question_text,status")
                .eq("id", id)
                .eq("challenge_id", challenge.id)
                .single();

        if (questionError || !question) {
            return NextResponse.json(
                { error: "Pregunta no encontrada." },
                { status: 404 }
            );
        }

        if (question.status !== "pending") {
            return NextResponse.json(
                { error: "Esta pregunta ya fue respondida." },
                { status: 400 }
            );
        }

        const { data: updatedQuestion, error: updateError } =
            await supabaseAdmin
                .from("custom_challenge_questions")
                .update({
                    answer: body.answer,
                    status: "answered",
                    answered_at: new Date().toISOString()
                })
                .eq("id", id)
                .eq("challenge_id", challenge.id)
                .eq("status", "pending")
                .select(`
                    id,
                    player_name,
                    question_text,
                    answer,
                    status,
                    created_at,
                    answered_at
                `)
                .maybeSingle();

        if (updateError) {
            throw updateError;
        }

        if (!updatedQuestion) {
            return NextResponse.json(
                { error: "La pregunta ya fue respondida." },
                { status: 409 }
            );
        }

        return NextResponse.json({
            success: true,
            question: updatedQuestion
        });

    } catch (error) {
        console.error("Error al responder pregunta:", error);

        return NextResponse.json(
            { error: "Error interno al responder la pregunta." },
            { status: 500 }
        );
    }
}
