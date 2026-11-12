
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function validarToken(token, hashGuardado) {
  if (!token || !hashGuardado) return false;

  const hashRecibido = createHash("sha256").update(token).digest("hex");

  const recibido = Buffer.from(hashRecibido);
  const guardado = Buffer.from(hashGuardado);

  return (
    recibido.length === guardado.length &&
    timingSafeEqual(recibido, guardado)
  );
}

export async function POST(request, { params }) {
  try {
    const { codigo } = await params;

    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) {
      return Response.json(
        { error: "No tienes autorización para enviar preguntas." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const pregunta = body.question_text?.trim();

    if (!pregunta || pregunta.length > 200) {
      return Response.json(
        { error: "La pregunta debe tener entre 1 y 200 caracteres." },
        { status: 400 }
      );
    }

    const { data: challenge, error: challengeError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select(
          "id, format, status, opponent_name, opponent_token_hash, ends_at"
        )
        .eq("code", codigo)
        .single();

    if (challengeError || !challenge) {
      return Response.json(
        { error: "No se encontró el desafío." },
        { status: 404 }
      );
    }

    if (challenge.format !== "yes_no_questions") {
      return Response.json(
        { error: "Este desafío no utiliza preguntas Sí / No." },
        { status: 400 }
      );
    }

    if (!validarToken(token, challenge.opponent_token_hash)) {
      return Response.json(
        { error: "No tienes autorización como participante." },
        { status: 403 }
      );
    }

    if (challenge.status !== "playing") {
      return Response.json(
        { error: "La partida no está en curso." },
        { status: 400 }
      );
    }

    if (!challenge.ends_at || new Date(challenge.ends_at) <= new Date()) {
      return Response.json(
        { error: "El tiempo de la partida ha terminado." },
        { status: 400 }
      );
    }

    const { data: pendingQuestion, error: pendingError } =
      await supabaseAdmin
        .from("custom_challenge_questions")
        .select("id")
        .eq("challenge_id", challenge.id)
        .eq("status", "pending")
        .limit(1);

    if (pendingError) {
      throw pendingError;
    }

    if (pendingQuestion?.length > 0) {
      return Response.json(
        { error: "Debes esperar a que respondan tu pregunta actual." },
        { status: 409 }
      );
    }

    const { data: newQuestion, error: insertError } =
      await supabaseAdmin
        .from("custom_challenge_questions")
        .insert({
          challenge_id: challenge.id,
          player_name: challenge.opponent_name,
          question_text: pregunta,
          status: "pending",
        })
        .select("id, player_name, question_text, answer, status, created_at")
        .single();

    if (insertError) {
      throw insertError;
    }

    return Response.json({
      success: true,
      question: newQuestion,
    });
  } catch (error) {
    console.error("Error enviando pregunta:", error);

    return Response.json(
      { error: "No se pudo enviar la pregunta." },
      { status: 500 }
    );
  }
}

export async function GET(request, { params }) {
  try {
    const { codigo } = await params;

    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) {
      return Response.json(
        { error: "No tienes autorización para consultar las preguntas." },
        { status: 401 }
      );
    }

    const { data: challenge, error: challengeError } =
      await supabaseAdmin
        .from("custom_challenges")
        .select(
          "id, format, status, creator_token_hash, opponent_token_hash, ends_at"
        )
        .eq("code", codigo)
        .single();

    if (challengeError || !challenge) {
      return Response.json(
        { error: "No se encontró el desafío." },
        { status: 404 }
      );
    }

    if (challenge.format !== "yes_no_questions") {
      return Response.json(
        { error: "Este desafío no utiliza preguntas Sí / No." },
        { status: 400 }
      );
    }

    const isCreator = validarToken(
      token,
      challenge.creator_token_hash
    );

    const isOpponent = validarToken(
      token,
      challenge.opponent_token_hash
    );

    if (!isCreator && !isOpponent) {
      return Response.json(
        { error: "No tienes autorización para consultar esta partida." },
        { status: 403 }
      );
    }

    const { data: questions, error: questionsError } =
      await supabaseAdmin
        .from("custom_challenge_questions")
        .select(
          "id, player_name, question_text, answer, status, created_at, answered_at"
        )
        .eq("challenge_id", challenge.id)
        .order("created_at", { ascending: true });

    if (questionsError) {
      throw questionsError;
    }

    return Response.json({
      success: true,
      questions: questions ?? [],
      status: challenge.status,
      ends_at: challenge.ends_at,
    });
  } catch (error) {
    console.error("Error consultando preguntas:", error);

    return Response.json(
      { error: "No se pudieron consultar las preguntas." },
      { status: 500 }
    );
  }
}

