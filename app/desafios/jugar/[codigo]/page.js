
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JugarDesafioPage() {
    const params = useParams();
    const router = useRouter();
    const codigo = String(params.codigo ?? "").toUpperCase();

    const [challenge, setChallenge] = useState(null);
    const [playerName, setPlayerName] = useState("");
    const [opponentToken, setOpponentToken] = useState("");

    // Estados de Luchador Secreto e Impostor.
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState(null);

    // Estados de Preguntas Sí/No.
    const [questions, setQuestions] = useState([]);
    const [questionText, setQuestionText] = useState("");
    const [sendingQuestion, setSendingQuestion] = useState(false);
    const [guessing, setGuessing] = useState(false);
    const [guessResult, setGuessResult] = useState(null);
    const [revealedWrestler, setRevealedWrestler] = useState(null);
    const [remainingSeconds, setRemainingSeconds] = useState(90);
    const [readyLoading, setReadyLoading] = useState(false);

    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState("");

   const challengeFormat = challenge?.format?.trim().toLowerCase() || "";

const isImpostor = challengeFormat === "impostor";
const isYesNoQuestions = challengeFormat === "yes_no_questions";
const isWhatPrefieres = challengeFormat === "what_would_you_choose";
 
    // Cargar sesión y desafío.
   useEffect(() => {
    if (!codigo) return;

    const savedSession = sessionStorage.getItem(`desafio-${codigo}`);
    const savedToken = sessionStorage.getItem(
        `desafio-adversario-${codigo}`
    );

        if (!savedSession) {
            router.replace("/desafios/unirse");
            return;
        }

        try {
            const session = JSON.parse(savedSession);

            if (!session.playerName) {
                router.replace("/desafios/unirse");
                return;
            }

            setPlayerName(session.playerName);
            setOpponentToken(savedToken || "");
        } catch {
            router.replace("/desafios/unirse");
            return;
        }

        async function loadChallenge() {
            try {
                const response = await fetch(`/api/desafios/${codigo}`, {
                    cache: "no-store",
                });

                const data = await response.json();
                console.log("CÓDIGO DEL DESAFÍO:", codigo);
console.log("RESPUESTA INICIAL DE LA API:", data);
console.log("FORMATO RECIBIDO:", data.challenge?.format);

                if (!response.ok) {
                    throw new Error(
                        data.error || "No fue posible cargar el desafío."
                    );
                }

                if (
                    ![
                        "secret_wrestler",
                        "impostor",
                        "yes_no_questions",
                        "what_would_you_choose",
                    ].includes(data.challenge.format)
                ) {
                    throw new Error(
                        "Este formato todavía no está disponible."
                    );
                }

                if (
    data.challenge.format === "impostor" &&
    data.wrestlers?.length !== 4
) {
    const formatoRecibido = String(
    data.challenge?.format ?? ""
).trim().toLowerCase();

console.log("DIAGNÓSTICO IMPOSTOR:", {
    formato: formatoRecibido,
    esArray: Array.isArray(data.wrestlers),
    cantidad: data.wrestlers?.length,
    luchadores: data.wrestlers,
});

if (
    formatoRecibido === "impostor" &&
    (!Array.isArray(data.wrestlers) || data.wrestlers.length !== 4)
) {
    console.error("ERROR: cantidad incorrecta de luchadores", data);

    throw new Error(
        "Este desafío no tiene los cuatro luchadores."
    );
}
}
                setChallenge({
    ...data.challenge,
    items: data.items || [],
    wrestlers: data.wrestlers || [],
});
                if (
                    data.challenge.format === "yes_no_questions" &&
                    data.challenge.status === "finished"
                ) {
                    setRevealedWrestler(data.wrestlers?.[0] || null);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        if (codigo) {
            loadChallenge();
        }
    }, [codigo, router]);

    // Actualizar preguntas y estado de la partida en tiempo real.
    useEffect(() => {
        if (!isYesNoQuestions || !opponentToken) return;

        let active = true;

        async function cargarPartida() {
            try {
                const challengeResponse = await fetch(
                    `/api/desafios/${codigo}`,
                    { cache: "no-store" }
                );

                const challengeData = await challengeResponse.json();

                if (!challengeResponse.ok) {
                    throw new Error(
                        challengeData.error ||
                        "No se pudo actualizar el desafío."
                    );
                }

                if (!active) return;

                setChallenge(challengeData.challenge);

                if (challengeData.challenge.status === "finished") {
                    setRevealedWrestler(
                        challengeData.wrestlers?.[0] || null
                    );
                }

                const questionsResponse = await fetch(
                    `/api/desafios/${codigo}/preguntas`,
                    {
                        headers: {
                            Authorization: `Bearer ${opponentToken}`,
                        },
                        cache: "no-store",
                    }
                );

                const questionsData = await questionsResponse.json();

                if (!questionsResponse.ok) {
                    throw new Error(
                        questionsData.error ||
                        "No se pudieron cargar las preguntas."
                    );
                }

                if (!active) return;

                setQuestions(questionsData.questions || []);
            } catch (err) {
                if (active) {
                    console.error("Error actualizando partida:", err);
                }
            }
        }

        cargarPartida();

        const interval = setInterval(cargarPartida, 2000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [codigo, isYesNoQuestions, opponentToken]);

    // Buscador utilizado por Luchador Secreto.
    useEffect(() => {
      if (
    isImpostor ||
    query.trim().length < 2 ||
    selected ||
    result?.correct
) {
    setOptions([]);
    return;
}
        const controller = new AbortController();

        const timer = setTimeout(async () => {
            try {
                setSearching(true);

                const response = await fetch(
                    `/api/wrestlers?q=${encodeURIComponent(query.trim())}`,
                    { signal: controller.signal }
                );

                const data = await response.json();

                if (response.ok) {
                    setOptions(data.wrestlers || []);
                }
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error("Error buscando luchadores:", err);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSearching(false);
                }
            }
        }, 180);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, selected, result, isImpostor]);

    // Temporizador de la partida.
    useEffect(() => {
        if (
            !isYesNoQuestions ||
            challenge?.status !== "playing" ||
            !challenge?.ends_at
        ) {
            return;
        }

        function actualizarTiempo() {
            const remaining = Math.max(
                0,
                Math.ceil(
                    (new Date(challenge.ends_at).getTime() - Date.now()) / 1000
                )
            );

            setRemainingSeconds(remaining);
        }

        actualizarTiempo();

        const interval = setInterval(actualizarTiempo, 1000);

        return () => clearInterval(interval);
    }, [
        isYesNoQuestions,
        challenge?.status,
        challenge?.ends_at,
    ]);

    const img = (w) =>
        w?.image_url ||
        w?.local_image ||
        "/wrestlers/default.svg";

    function choose(wrestler) {
        setSelected(wrestler);
        setQuery(wrestler.name);
        setOptions([]);
        setResult(null);
        setError("");
    }

    // Comprobar respuesta para Luchador Secreto e Impostor.
    async function checkAnswer(wrestler) {
        const answer = wrestler || selected;

        if (!answer) {
            setError("Selecciona un luchador antes de comprobar.");
            return;
        }

        if (result?.correct || checking) return;

        setChecking(true);
        setError("");

        try {
            const response = await fetch(
                `/api/desafios/${codigo}/responder`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        wrestler_id: answer.id,
                        player_name: playerName,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No fue posible comprobar la respuesta."
                );
            }

            setSelected(answer);
            setResult(data);
            setOptions([]);
        } catch (err) {
            setError(err.message);
        } finally {
            setChecking(false);
        }
    }

    function handleQueryChange(value) {
        setQuery(value);
        setSelected(null);
        setOptions([]);
        setResult(null);
        setError("");
    }

    // Marcar al adversario como listo.
    async function marcarListo() {
        if (readyLoading || !opponentToken) return;

        setReadyLoading(true);
        setError("");

        try {
            const response = await fetch(
                `/api/desafios/${codigo}/listo`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${opponentToken}`,
                    },
                    body: JSON.stringify({
                        role: "opponent",
                    }),
                }
            );

          const data = await response.json();


            if (!response.ok) {
                throw new Error(
                    data.error || "No fue posible marcarte como listo."
                );
            }

       if (data.challenge || data.room) {
    const updatedData = data.challenge || data.room;

    setChallenge((current) => ({
        ...current,
        ...updatedData,
    }));
}
        } catch (err) {
            setError(err.message);
        } finally {
            setReadyLoading(false);
        }
    }

    // Enviar una pregunta Sí/No.
    async function enviarPregunta(event) {
        event.preventDefault();

        const text = questionText.trim();

        if (!text) {
            setError("Escribe una pregunta.");
            return;
        }

        if (sendingQuestion) return;

        setSendingQuestion(true);
        setError("");

        try {
            const response = await fetch(
                `/api/desafios/${codigo}/preguntas`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${opponentToken}`,
                    },
                    body: JSON.stringify({
                        question_text: text,
                        player_name: playerName,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No fue posible enviar la pregunta."
                );
            }

            if (data.question) {
                setQuestions((current) => [...current, data.question]);
            }

            setQuestionText("");
        } catch (err) {
            setError(err.message);
        } finally {
            setSendingQuestion(false);
        }
    }

    // Intentar adivinar al luchador secreto.
    async function adivinarLuchador(wrestler) {
        if (!wrestler || guessing) return;

        setGuessing(true);
        setGuessResult(null);
        setError("");

        try {
            const response = await fetch(
                `/api/desafios/${codigo}/adivinar`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${opponentToken}`,
                    },
                    body: JSON.stringify({
                        wrestler_id: wrestler.id,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No fue posible comprobar tu respuesta."
                );
            }

            setGuessResult(data);

            if (data.correct) {
                setRevealedWrestler(data.wrestler || null);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setGuessing(false);
        }
    }

    if (loading) {
        return (
            <main className="page">
                <p>Cargando desafío...</p>
            </main>
        );
    }

    if (error && !challenge) {
        return (
            <main className="page">
                <section className="hero">
                    <h1>No se pudo cargar el desafío</h1>
                    <p>{error}</p>

                    <button
                        className="primary"
                        onClick={() => router.push("/desafios/unirse")}
                    >
                        VOLVER
                    </button>
                </section>
            </main>
        );
    }

    if (!challenge) return null;

    return (
        <main className="page">
            <section className="hero compact">
                <div className="eyebrow">DESAFÍO {codigo}</div>

                <h1>{challenge.title}</h1>

                <p>Jugador: {playerName}</p>

                {challenge.instructions && (
                    <p>{challenge.instructions}</p>
                )}
            </section>

            <section className="game-card selection-card">
                <button
                    type="button"
                    className="secondary"
                    onClick={() => router.push("/desafios")}
                    style={{
                        marginBottom: 24,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    ← VOLVER A DESAFÍOS
                </button>

                {/* FORMATO: PREGUNTAS SÍ/NO */}
                {isYesNoQuestions ? (
                    <>
                        <div className="game-mode-tag">
                            PREGUNTAS SÍ / NO
                        </div>

                        <h2>DESCUBRE AL LUCHADOR</h2>

                        {challenge.status === "waiting" && (
                            <div className="message">
                                <h3>Esperando el inicio de la partida</h3>

                                <p>
                                    El creador debe marcarse como listo para
                                    comenzar. Cuando ambos estén listos,
                                    tendrás 90 segundos para descubrir al
                                    luchador secreto.
                                </p>

                                <p>
                                    Estado del creador:{" "}
                                    <strong>
                                        {challenge.creator_ready
                                            ? "LISTO"
                                            : "ESPERANDO"}
                                    </strong>
                                </p>

                                <p>
                                    Tu estado:{" "}
                                    <strong>
                                        {challenge.opponent_ready
                                            ? "LISTO"
                                            : "NO ESTÁS LISTO"}
                                    </strong>
                                </p>

                                {!challenge.opponent_ready && (
                                    <button
                                        type="button"
                                        className="primary"
                                        onClick={marcarListo}
                                        disabled={readyLoading}
                                    >
                                        {readyLoading
                                            ? "ESPERA..."
                                            : "ESTOY LISTO"}
                                    </button>
                                )}

                                {challenge.opponent_ready && (
                                    <p>
                                        Ya estás listo. Esperando que el
                                        creador también lo esté...
                                    </p>
                                )}
                            </div>
                        )}

                        {challenge.status === "playing" && (
                            <>
                                <div
                                    className="message"
                                    style={{ marginBottom: 24 }}
                                >
                                    <h3>TIEMPO RESTANTE</h3>

                                    <div
                                        style={{
                                            fontSize: 42,
                                            fontWeight: 800,
                                            textAlign: "center",
                                        }}
                                    >
                                        {Math.floor(remainingSeconds / 60)
                                            .toString()
                                            .padStart(2, "0")}
                                        :
                                        {(remainingSeconds % 60)
                                            .toString()
                                            .padStart(2, "0")}
                                    </div>

                                    <p>
                                        Haz preguntas que el creador pueda
                                        responder solamente con Sí o No.
                                    </p>
                                </div>

                                <div className="challenge-clues">
                                    <h3>TUS PREGUNTAS</h3>

                                    {questions.length === 0 ? (
                                        <p>
                                            Todavía no has enviado preguntas.
                                        </p>
                                    ) : (
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 12,
                                            }}
                                        >
                                            {questions.map((question) => (
                                                <div
                                                    key={question.id}
                                                    style={{
                                                        padding: 14,
                                                        borderRadius: 10,
                                                        border: "1px solid var(--border-color, #444)",
                                                    }}
                                                >
                                                    <strong>
                                                        {question.question_text}
                                                    </strong>

                                                    <p
                                                        style={{
                                                            marginBottom: 0,
                                                            marginTop: 8,
                                                        }}
                                                    >
                                                        {question.status ===
                                                        "answered" ? (
                                                            <span
                                                                style={{
                                                                    color: question.answer
                                                                        ? "#16a34a"
                                                                        : "#dc2626",
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                RESPUESTA:{" "}
                                                                {question.answer
                                                                    ? "SÍ"
                                                                    : "NO"}
                                                            </span>
                                                        ) : (
                                                            <span>
                                                                Esperando
                                                                respuesta del
                                                                creador...
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <form
                                    onSubmit={enviarPregunta}
                                    style={{ marginTop: 24 }}
                                >
                                    <h3>HACER UNA PREGUNTA</h3>

                                    <input
                                        type="text"
                                        value={questionText}
                                        onChange={(event) =>
                                            setQuestionText(event.target.value)
                                        }
                                        placeholder="Ejemplo: ¿Ha sido campeón mundial?"
                                        maxLength={250}
                                        disabled={
                                            sendingQuestion ||
                                            questions.some(
                                                (question) =>
                                                    question.status ===
                                                    "pending"
                                            ) ||
                                            remainingSeconds <= 0
                                        }
                                    />

                                    <button
                                        type="submit"
                                        className="primary"
                                        disabled={
                                            sendingQuestion ||
                                            !questionText.trim() ||
                                            questions.some(
                                                (question) =>
                                                    question.status ===
                                                    "pending"
                                            ) ||
                                            remainingSeconds <= 0
                                        }
                                        style={{ marginTop: 12 }}
                                    >
                                        {sendingQuestion
                                            ? "ENVIANDO..."
                                            : "ENVIAR PREGUNTA"}
                                    </button>

                                    {questions.some(
                                        (question) =>
                                            question.status === "pending"
                                    ) && (
                                        <p>
                                            Debes esperar la respuesta del
                                            creador antes de enviar otra
                                            pregunta.
                                        </p>
                                    )}
                                </form>

                                <div
                                    className="challenge-clues"
                                    style={{ marginTop: 28 }}
                                >
                                    <h3>¿YA SABES QUIÉN ES?</h3>

                                    <p>
                                        Puedes intentar adivinar al luchador
                                        secreto en cualquier momento.
                                    </p>

                                    <GuessSearch
                                        query={query}
                                        setQuery={handleQueryChange}
                                        options={options}
                                        choose={choose}
                                        disabled={guessing}
                                        selected={selected}
                                        setSelected={setSelected}
                                        img={img}
                                        searching={searching}
                                    />

                                    <button
                                        type="button"
                                        className="primary guess-submit"
                                        disabled={!selected || guessing}
                                        onClick={() =>
                                            adivinarLuchador(selected)
                                        }
                                    >
                                        {guessing
                                            ? "COMPROBANDO..."
                                            : "ADIVINAR LUChADOR"}
                                    </button>

                                    {guessResult && (
                                        <div
                                            className={
                                                guessResult.correct
                                                    ? "message success"
                                                    : "message error"
                                            }
                                            style={{ marginTop: 20 }}
                                        >
                                            <h3>
                                                {guessResult.message ||
                                                    (guessResult.correct
                                                        ? "¡CORRECTO!"
                                                        : "NO ES EL LUCHADOR CORRECTO")}
                                            </h3>

                                            {!guessResult.correct && (
                                                <p>
                                                    Puedes seguir preguntando
                                                    e intentarlo nuevamente.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {challenge.status === "finished" && (
                            <div
                                className="message success"
                                style={{ marginTop: 24 }}
                            >
                                <h2>PARTIDA FINALIZADA</h2>

                                <p>
                                    Ganador:{" "}
                                    <strong>
                                        {challenge.winner || "Sin ganador"}
                                    </strong>
                                </p>

                                {revealedWrestler && (
                                    <div className="selected-preview">
                                        <SafeImage
                                            src={img(revealedWrestler)}
                                            fallback="/wrestlers/default.svg"
                                            alt={revealedWrestler.name}
                                            className="wrestler-image"
                                        />

                                        <div>
                                            <strong>
                                                {revealedWrestler.name}
                                            </strong>
                                            <small>
                                                Luchador secreto
                                            </small>
                                        </div>
                                    </div>
                                )}

                                {!revealedWrestler && (
                                    <p>
                                        El desafío terminó. Actualizando el
                                        resultado...
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                ) : isWhatPrefieres ? (
    // =====================================
    // MODO ¿QUÉ PREFIERES?
    // =====================================
    <div className="challenge-game">
        <h1>¿QUÉ PREFIERES?</h1>

        <p>
            Elige al luchador que quieres que avance a la siguiente ronda.
        </p>

        <div className="wrestler-options">
            {challenge?.wrestlers?.slice(0, 2).map((wrestler) => (
                <div
                    key={wrestler.id}
                    className="wrestler-option"
                >
                    <SafeImage
                        src={wrestler.image_url}
                        alt={wrestler.name}
                    />

                    <h2>{wrestler.name}</h2>

                    <button
                        type="button"
                        onClick={() => {
                            // Aquí conectaremos la selección del luchador
                        }}
                    >
                        ELEGIR
                    </button>
                </div>
            ))}
        </div>
    </div>

) : isImpostor ? (
                    /* FORMATO: IMPOSTOR */
                    <>
                        <div className="game-mode-tag">EL IMPOSTOR</div>

                        <h2>¿QUIÉN ES EL IMPOSTOR?</h2>

                        <p>
                            Observa los cuatro luchadores y selecciona al que
                            crees que es el impostor.
                        </p>

                        <div
                            className="impostor-grid"
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(2, minmax(0, 1fr))",
                                gap: 16,
                                marginTop: 24,
                            }}
                        >
                            {challenge.wrestlers.map((wrestler) => {
                                const isSelected =
                                    selected?.id === wrestler.id;

                                const isRevealed =
                                    result?.impostor &&
                                    result.impostor.name === wrestler.name;

                                return (
                                    <button
                                        key={wrestler.id}
                                        type="button"
                                        disabled={checking || Boolean(result)}
                                        onClick={() =>
                                            checkAnswer(wrestler)
                                        }
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: 16,
                                            borderRadius: 12,
                                            border: isRevealed
                                                ? "2px solid #16a34a"
                                                : isSelected
                                                ? "2px solid #e6a23c"
                                                : "1px solid var(--border-color, #444)",
                                            background: isRevealed
                                                ? "rgba(22, 163, 74, 0.12)"
                                                : "transparent",
                                            color: "inherit",
                                            cursor: result
                                                ? "default"
                                                : "pointer",
                                            opacity:
                                                result &&
                                                !isRevealed &&
                                                !isSelected
                                                    ? 0.65
                                                    : 1,
                                        }}
                                    >
                                        <SafeImage
                                            src={wrestler.local_image}
                                            fallback="/wrestlers/default.svg"
                                            alt={wrestler.name}
                                            className="wrestler-image"
                                        />

                                        <strong>{wrestler.name}</strong>

                                        {isRevealed && (
                                            <span
                                                style={{ color: "#16a34a" }}
                                            >
                                                IMPOSTOR
                                            </span>
                                        )}

                                        {result &&
                                            isSelected &&
                                            !result.correct && (
                                                <span
                                                    style={{
                                                        color: "#dc2626",
                                                    }}
                                                >
                                                    TU ELECCIÓN
                                                </span>
                                            )}

                                        {!result && (
                                            <span>
                                                {checking
                                                    ? "COMPROBANDO..."
                                                    : "SELECCIONAR"}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {result && (
                            <div
                                className={
                                    result.correct
                                        ? "message success"
                                        : "message error"
                                }
                                style={{ marginTop: 24 }}
                            >
                                <h3>{result.message}</h3>

                                {result.impostor && (
                                    <div style={{ marginTop: 16 }}>
                                        <h3>EL IMPOSTOR ERA:</h3>

                                        <div className="selected-preview">
                                            <SafeImage
                                                src={result.impostor.local_image}
                                                fallback="/wrestlers/default.svg"
                                                alt={result.impostor.name}
                                                className="wrestler-image"
                                            />

                                            <strong>
                                                {result.impostor.name}
                                            </strong>
                                        </div>

                                        <h3>¿POR QUÉ ERA EL IMPOSTOR?</h3>
                                        <p>{result.reason}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    /* FORMATO: LUCHADOR SECRETO */
                    <>
                        <h2>LUCHADOR SECRETO</h2>

                        <p>
                            Lee las pistas e intenta descubrir de quién se
                            trata.
                        </p>

                        <div className="challenge-clues">
                            <h3>PISTAS</h3>

                            {challenge.clues?.length > 0 ? (
                                <ol>
                                    {challenge.clues.map((clue, index) => (
                                        <li key={index}>{clue}</li>
                                    ))}
                                </ol>
                            ) : (
                                <p>
                                    Este desafío no tiene pistas configuradas.
                                </p>
                            )}
                        </div>

                        <h3>¿QUIÉN ES EL LUCHADOR?</h3>

                        <GuessSearch
                            query={query}
                            setQuery={handleQueryChange}
                            options={options}
                            choose={choose}
                            disabled={checking || result?.correct}
                            selected={selected}
                            setSelected={setSelected}
                            img={img}
                            searching={searching}
                        />

                        <button
                            className="primary guess-submit"
                            disabled={
                                !selected ||
                                checking ||
                                result?.correct
                            }
                            onClick={() => checkAnswer()}
                        >
                            {checking
                                ? "COMPROBANDO..."
                                : "COMPROBAR RESPUESTA"}
                        </button>

                        {selected && (
                            <div
                                className="selected-preview"
                                style={{ position: "relative" }}
                            >
                                <button
                                    type="button"
                                    aria-label="Quitar luchador seleccionado"
                                    disabled={
                                        checking || result?.correct
                                    }
                                    onClick={() => {
                                        setSelected(null);
                                        setQuery("");
                                        setOptions([]);
                                        setResult(null);
                                    }}
                                    style={{
                                        position: "absolute",
                                        top: 8,
                                        right: 8,
                                        width: 30,
                                        height: 30,
                                        border: "none",
                                        borderRadius: "50%",
                                        background: "#dc2626",
                                        color: "#fff",
                                        fontSize: 20,
                                        cursor: "pointer",
                                    }}
                                >
                                    ×
                                </button>

                                <SafeImage
                                    src={img(selected)}
                                    fallback="/wrestlers/default.svg"
                                    alt={selected.name}
                                    className="wrestler-image"
                                />

                                <div>
                                    <strong>{selected.name}</strong>
                                    <small>Luchador seleccionado</small>
                                </div>
                            </div>
                        )}

                        {result && (
                            <div
                                className={
                                    result.correct
                                        ? "message success"
                                        : "message error"
                                }
                            >
                                <h3>{result.message}</h3>

                                {result.correct && result.wrestler && (
                                    <div className="selected-preview">
                                        <SafeImage
                                            src={result.wrestler.local_image}
                                            fallback="/wrestlers/default.svg"
                                            alt={result.wrestler.name}
                                            className="wrestler-image"
                                        />

                                        <strong>
                                            {result.wrestler.name}
                                        </strong>
                                    </div>
                                )}

                                {!result.correct && (
                                    <p>
                                        Puedes intentarlo nuevamente.
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                )}

                {error && (
                    <div className="message error" role="alert">
                        {error}
                    </div>
                )}
            </section>

            <footer>
                Fan-made. No afiliado a WWE, AEW ni otras promociones.
            </footer>
        </main>
    );
}

function GuessSearch({
    query,
    setQuery,
    options,
    choose,
    disabled,
    selected,
    setSelected,
    img,
    searching,
}) {
    return (
        <div className="search-box">
            <div className="input-wrap">
                <input
                    value={selected ? selected.name : query}
                    onChange={(event) => {
                        setSelected(null);
                        setQuery(event.target.value);
                    }}
                    placeholder="Escribe el nombre de un luchador..."
                    autoComplete="off"
                    disabled={disabled}
                />

                {!selected && options.length > 0 && (
                    <div className="suggestions">
                        {options.map((wrestler) => (
                            <button
                                type="button"
                                key={wrestler.id}
                                onClick={() => choose(wrestler)}
                            >
                                <SafeImage
                                    src={wrestler.image_url}
                                    fallback={img(wrestler)}
                                    className="wrestler-image"
                                    alt={wrestler.name}
                                />

                                <span>{wrestler.name}</span>

                                <small>
                                    {wrestler.primary_promotion ||
                                        "Wrestling"}
                                </small>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {searching && <small>Buscando luchadores...</small>}
        </div>
    );
}

function SafeImage({
    src,
    fallback,
    alt = "",
    className = "wrestler-image",
}) {
    const [url, setUrl] = useState(src || fallback);

    useEffect(() => {
        setUrl(src || fallback);
    }, [src, fallback]);

    return (
        <img
            className={className}
            src={url}
            alt={alt}
            onError={() => {
                if (url !== fallback) {
                    setUrl(fallback);
                }
            }}
        />
    );
}
