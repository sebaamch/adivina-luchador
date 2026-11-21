
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_FORMATS = [
    "secret_wrestler",
    "impostor",
    "yes_no_questions",
    "what_would_you_choose",
    "blind_top_5",
];

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function isValidItems(items, expectedCount) {
    if (!Array.isArray(items) || items.length !== expectedCount) {
        return false;
    }

    const ids = items.map(item => Number(item.wrestler_id));

    return (
        ids.every(id => Number.isSafeInteger(id) && id > 0) &&
        new Set(ids).size === ids.length
    );
}

export async function POST(request) {
    let challengeId = null;

    try {
        const body = await request.json();

        const creatorName = String(body.creator_name || "").trim();
        const format = String(body.format || "").trim();
        const title = String(body.title || "").trim();
        const instructions = String(body.instructions || "").trim();

        const settings =
            body.settings &&
            typeof body.settings === "object" &&
            !Array.isArray(body.settings)
                ? body.settings
                : {};

        const items = Array.isArray(body.items) ? body.items : [];
        const clues = Array.isArray(body.clues) ? body.clues : [];

        // Validaciones generales.
        if (!creatorName || creatorName.length > 40) {
            return NextResponse.json(
                { error: "Ingresa un nombre válido." },
                { status: 400 }
            );
        }

        if (!title || title.length > 100) {
            return NextResponse.json(
                { error: "Ingresa un título válido." },
                { status: 400 }
            );
        }

        if (!ALLOWED_FORMATS.includes(format)) {
            return NextResponse.json(
                { error: "Formato de desafío no válido." },
                { status: 400 }
            );
        }

        // Validaciones según el formato.
        if (
            format === "blind_top_5" &&
            !isValidItems(items, 5)
        ) {
            return NextResponse.json(
                { error: "Debes seleccionar exactamente cinco luchadores diferentes." },
                { status: 400 }
            );
        }

        if (
            format === "impostor" &&
            !isValidItems(items, 4)
        ) {
            return NextResponse.json(
                { error: "Debes seleccionar exactamente cuatro luchadores diferentes." },
                { status: 400 }
            );
        }

        if (
            (format === "secret_wrestler" ||
                format === "yes_no_questions") &&
            !isValidItems(items, 1)
        ) {
            return NextResponse.json(
                { error: "Debes seleccionar un luchador." },
                { status: 400 }
            );
        }

        if (
            format === "what_would_you_choose" &&
            items.length !== 0
        ) {
            return NextResponse.json(
                { error: "El formato ¿Qué prefieres? no debe incluir luchadores iniciales." },
                { status: 400 }
            );
        }

        // Validar pistas del formato Luchador secreto.
        const validClues = clues
            .map(clue => String(clue).trim())
            .filter(Boolean);

        if (format === "secret_wrestler") {
            if (validClues.length === 0) {
                return NextResponse.json(
                    { error: "Debes agregar al menos una pista." },
                    { status: 400 }
                );
            }

            if (validClues.length > 10) {
                return NextResponse.json(
                    { error: "No puedes agregar más de diez pistas." },
                    { status: 400 }
                );
            }
        }

        // Generar acceso privado del creador.
        const creatorToken = randomBytes(32).toString("hex");
        const creatorTokenHash = hashToken(creatorToken);

        // Crear un código único.
        let challenge = null;

        for (let attempt = 0; attempt < 5; attempt++) {
            const code = randomBytes(3)
                .toString("hex")
                .toUpperCase();

            const { data: existing, error: lookupError } =
                await supabaseAdmin
                    .from("custom_challenges")
                    .select("id")
                    .eq("code", code)
                    .maybeSingle();

            if (lookupError) throw lookupError;
            if (existing) continue;

            const { data, error } = await supabaseAdmin
                .from("custom_challenges")
                .insert({
                    code,
                    creator_name: creatorName,
                    format,
                    title,
                    instructions: instructions || null,
                    settings,
                    status: "waiting",
                    creator_token_hash: creatorTokenHash,
                    creator_ready: false,
                    opponent_ready: false,
                })
                .select("id,code,title,format,status")
                .single();

            if (!error) {
                challenge = data;
                break;
            }

            if (error.code !== "23505") {
                throw error;
            }
        }

        if (!challenge) {
            throw new Error("No se pudo generar un código único para el desafío.");
        }

        challengeId = challenge.id;

        // Guardar luchadores seleccionados.
        if (items.length > 0) {
            const itemsToInsert = items.map((item, index) => ({
                challenge_id: challenge.id,
                wrestler_id: Number(item.wrestler_id),
                position: Number(item.position ?? index + 1),
                custom_text: item.custom_text ?? null,
                custom_image: item.custom_image ?? null,
                extra_data: item.extra_data ?? null,
            }));

            const { error: itemsError } = await supabaseAdmin
                .from("custom_challenge_items")
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;
        }

        // Guardar pistas.
        if (format === "secret_wrestler" && validClues.length > 0) {
            const cluesToInsert = validClues.map((clue, index) => ({
                challenge_id: challenge.id,
                clue_text: clue,
                position: index + 1,
            }));

            const { error: cluesError } = await supabaseAdmin
                .from("custom_challenge_clues")
                .insert(cluesToInsert);

            if (cluesError) throw cluesError;
        }

        return NextResponse.json(
            {
                success: true,
                challenge,
                creator_token: creatorToken,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error("Error al crear desafío:", error);

        // Intentar limpiar los registros si falló
        // la inserción de luchadores o pistas.
        if (challengeId !== null) {
            await supabaseAdmin
                .from("custom_challenge_clues")
                .delete()
                .eq("challenge_id", challengeId);

            await supabaseAdmin
                .from("custom_challenge_items")
                .delete()
                .eq("challenge_id", challengeId);

            const { error: deleteError } = await supabaseAdmin
                .from("custom_challenges")
                .delete()
                .eq("id", challengeId);

            if (deleteError) {
                console.error("Error limpiando desafío incompleto:", deleteError);
            }
        }

        return NextResponse.json(
            { error: "No se pudo crear el desafío. Revisa los registros del servidor." },
            { status: 500 }
        );
    }
}
