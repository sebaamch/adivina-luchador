
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function validarToken(token, tokenHash) {
    if (!token || !tokenHash) return false;

    const recibido = Buffer.from(hashToken(token), "hex");
    const almacenado = Buffer.from(tokenHash, "hex");

    return (
        recibido.length === almacenado.length &&
        timingSafeEqual(recibido, almacenado)
    );
}

async function obtenerParticipante(request, codigo) {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

    if (!token) {
        return { error: "No se proporcionó un token de acceso.", status: 401 };
    }

    const { data: challenge, error } = await supabaseAdmin
        .from("custom_challenges")
        .select(`
            id,
            code,
            format,
            status,
            ends_at,
            creator_token_hash,
            opponent_token_hash
        `)
        .eq("code", String(codigo).toUpperCase())
        .maybeSingle();

    if (error) throw error;

    if (!challenge) {
        return { error: "El desafío no existe.", status: 404 };
    }

    if (challenge.format !== "yes_no_questions") {
        return {
            error: "Este desafío no utiliza preguntas Sí / No.",
            status: 400,
        };
    }

    let role = null;

    if (validarToken(token, challenge.creator_token_hash)) {
        role = "creator";
    } else if (validarToken(token, challenge.opponent_token_hash)) {
        role = "opponent";
    }

    if (!role) {
        return { error: "No tienes autorización para acceder.", status: 403 };
    }

    return { challenge, role };
}

// Consultar preguntas y respuestas.
export async function GET(request, { params }) {
    try {
        const { codigo } = await params;
        const auth = await obtenerParticipante(request, codigo);

        if (auth.error) {
            return NextResponse.json(
                { error: auth.error },
                { status: auth.status }
            );
        }

        const { challenge } = auth;

        const { data: questions, error } = await supabaseAdmin
            .from("custom_challenge_questions")
            .select(`
                id,
                player_name,
                question_text,
                answer,
                status,
                created_at,
                answered_at
            `)
            .eq("challenge_id", challenge.id)
            .order("created_at", { ascending: true });

        if (error) throw error;

        return NextResponse.json({
            success: true,
            questions: questions || [],
            status: challenge.status,
            ends_at: challenge.ends_at,
        });
    } catch (error) {
        console.error("Error consultando preguntas:", error);

        return NextResponse.json(
            { error: "No fue posible consultar las preguntas." },
            { status: 500 }
        );
    }
}

// Enviar una pregunta. Solo puede hacerlo el adversario.
export async function POST(request, { params }) {
    try {
        const { codigo } = await params;
        const auth = await obtenerParticipante(request, codigo);

        if (auth.error) {
            return NextResponse.json(
                { error: auth.error },
                { status: auth.status }
            );
        }

        const { challenge, role } = auth;

        if (role !== "opponent") {
            return NextResponse.json(
                { error: "Solo el adversario puede enviar preguntas." },
                { status: 403 }
            );
        }

        if (challenge.status !== "playing") {
            return NextResponse.json(
                { error: "La partida no está en curso." },
                { status: 400 }
            );
        }

        if (
            !challenge.ends_at ||
            new Date(challenge.ends_at).getTime() <= Date.now()
        ) {
            return NextResponse.json(
                { error: "Se terminó el tiempo disponible." },
                { status: 400 }
            );
        }

        const body = await request.json();

        const questionText =
            typeof body.question_text === "string"
                ? body.question_text.trim().slice(0, 250)
                : "";

        if (!questionText) {
            return NextResponse.json(
                { error: "Debes escribir una pregunta." },
                { status: 400 }
            );
        }

        // Solo se permite una pregunta pendiente a la vez.
        const { data: pendingQuestion, error: pendingError } =
            await supabaseAdmin
                .from("custom_challenge_questions")
                .select("id")
                .eq("challenge_id", challenge.id)
                .eq("status", "pending")
                .limit(1)
                .maybeSingle();

        if (pendingError) throw pendingError;

        if (pendingQuestion) {
            return NextResponse.json(
                {
                    error: "Debes esperar a que el creador responda tu pregunta anterior.",
                },
                { status: 409 }
            );
        }

        const { data: question, error: insertError } =
            await supabaseAdmin
                .from("custom_challenge_questions")
                .insert({
                    challenge_id: challenge.id,
                    player_name: body.player_name || "Adversario",
                    question_text: questionText,
                    status: "pending",
                })
                .select(`
                    id,
                    player_name,
                    question_text,
                    answer,
                    status,
                    created_at,
                    answered_at
                `)
                .single();

        if (insertError) throw insertError;

        return NextResponse.json({
            success: true,
            question,
        });
    } catch (error) {
        console.error("Error enviando pregunta:", error);

        return NextResponse.json(
            { error: "No fue posible enviar la pregunta." },
            { status: 500 }
        );
    }
}
