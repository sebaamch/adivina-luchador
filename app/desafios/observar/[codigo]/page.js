"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ObservarDesafioPage() {
    const params = useParams();
    const router = useRouter();
    const codigo = String(params.codigo || "").toUpperCase();

    const [token, setToken] = useState("");
    const [challenge, setChallenge] = useState(null);
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const cargarPartida = useCallback(async () => {
        if (!codigo || !token) return;

        try {
            // Obtener los datos públicos del desafío y sus luchadores.
            const challengeResponse = await fetch(
                `/api/desafios/${codigo}`,
                { cache: "no-store" }
            );

            const challengeData = await challengeResponse.json();

            if (!challengeResponse.ok) {
                throw new Error(
                    challengeData.error || "No se pudo cargar el desafío."
                );
            }

            // Obtener la actividad privada del creador.
            const eventsResponse = await fetch(
                `/api/desafios/${codigo}/eventos`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    cache: "no-store",
                }
            );

            const eventsData = await eventsResponse.json();

            if (!eventsResponse.ok) {
                throw new Error(
                    eventsData.error || "No se pudo consultar la partida."
                );
            }

            setChallenge(challengeData.challenge);
            setEventos(eventsData.eventos || []);
            setError("");
        } catch (err) {
            setError(err.message || "Error al cargar la partida.");
        } finally {
            setLoading(false);
        }
    }, [codigo, token]);

    useEffect(() => {
        const savedToken = sessionStorage.getItem(
            `desafio-creador-${codigo}`
        );

        if (!savedToken) {
            setError("No se encontró la sesión del creador.");
            setLoading(false);
            return;
        }

        setToken(savedToken);
    }, [codigo]);

    useEffect(() => {
        if (!token) return;

        cargarPartida();

        const interval = setInterval(cargarPartida, 2000);

        return () => clearInterval(interval);
    }, [token, cargarPartida]);

    if (loading) {
        return (
            <main className="page">
                <p>Cargando partida...</p>
            </main>
        );
    }

    if (error && !challenge) {
        return (
            <main className="page">
                <section className="hero">
                    <h1>No se pudo cargar la partida</h1>
                    <p>{error}</p>
                    <button
                        className="primary"
                        onClick={() => router.push("/desafios")}
                    >
                        VOLVER A DESAFÍOS
                    </button>
                </section>
            </main>
        );
    }

    if (!challenge) return null;

    const isImpostor = challenge.format === "impostor";

    // Última selección realizada por el participante.
    const selections = eventos.filter(
        (event) => event.event_type === "selected"
    );

    const lastSelection = selections.length
        ? selections[selections.length - 1]
        : null;

    // Última respuesta registrada.
    const answers = eventos.filter(
        (event) => event.event_type === "answered"
    );

    const lastAnswer = answers.length
        ? answers[answers.length - 1]
        : null;

    const hasJoined = eventos.some(
        (event) => event.event_type === "joined"
    ) || eventos.length > 0;

    const finished = Boolean(lastAnswer?.is_correct);

    // En el formato impostor, una selección incorrecta permite continuar.
    const currentSelection = lastSelection?.wrestler_id ?? null;

    // La respuesta correcta solo se revela cuando el participante acierta.
    const revealedWrestlerId = finished
        ? lastAnswer.wrestler_id
        : null;

    const playerName =
        lastSelection?.player_name ||
        lastAnswer?.player_name ||
        eventos[0]?.player_name ||
        "Participante";

    const image = (wrestler) =>
        wrestler?.local_image ||
        wrestler?.image_url ||
        "/wrestlers/default.svg";

    function SafeImage({ wrestler, className = "wrestler-image" }) {
        const [src, setSrc] = useState(image(wrestler));

        useEffect(() => {
            setSrc(image(wrestler));
        }, [wrestler]);

        return (
            <img
                src={src}
                alt={wrestler?.name || "Luchador"}
                className={className}
                onError={() => setSrc("/wrestlers/default.svg")}
            />
        );
    }

    return (
        <main className="page">
            <section className="hero compact">
                <div className="eyebrow">
                    ESTO ES LUCHA · PANEL DEL CREADOR
                </div>

                <h1>{challenge.title}</h1>

                <p>
                    {hasJoined
                        ? `${playerName} está participando en tu desafío.`
                        : "Esperando que alguien ingrese al desafío."}
                </p>

                <div style={{ marginTop: 12 }}>
                    <span
                        style={{
                            display: "inline-block",
                            padding: "7px 14px",
                            borderRadius: 30,
                            background: finished
                                ? "rgba(22,163,74,.15)"
                                : "rgba(34,197,94,.15)",
                            color: "#22c55e",
                            fontWeight: 700,
                            fontSize: 13,
                        }}
                    >
                        ● {finished ? "DESAFÍO COMPLETADO" : "OBSERVANDO EN VIVO"}
                    </span>
                </div>
            </section>

            <section className="game-card selection-card">
                <button
                    type="button"
                    className="secondary"
                    onClick={() => router.push("/desafios")}
                    style={{ marginBottom: 24 }}
                >
                    ← VOLVER A DESAFÍOS
                </button>

                <div className="game-mode-tag">
                    {isImpostor ? "EL IMPOSTOR" : "LUCHADOR SECRETO"}
                </div>

                {isImpostor ? (
                    <>
                        <h2>¿QUIÉN ES EL IMPOSTOR?</h2>

                        <p>
                            Aquí puedes seguir las elecciones del participante
                            mientras juega.
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
                            {(challenge.wrestlers || []).map((wrestler) => {
                                const isSelected =
                                    currentSelection === wrestler.id;

                                const isRevealed =
                                    revealedWrestlerId === wrestler.id;

                                const isWrong =
                                    finished === false &&
                                    lastAnswer?.is_correct === false &&
                                    isSelected;

                                return (
                                    <div
                                        key={wrestler.id}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: 16,
                                            borderRadius: 12,
                                            border: isRevealed
                                                ? "2px solid #16a34a"
                                                : isWrong
                                                    ? "2px solid #dc2626"
                                                    : isSelected
                                                        ? "2px solid #e6a23c"
                                                        : "1px solid var(--border-color, #444)",
                                            background: isRevealed
                                                ? "rgba(22,163,74,.12)"
                                                : isWrong
                                                    ? "rgba(220,38,38,.10)"
                                                    : isSelected
                                                        ? "rgba(230,162,60,.10)"
                                                        : "transparent",
                                            textAlign: "center",
                                            opacity:
                                                finished &&
                                                !isRevealed &&
                                                !isSelected
                                                    ? 0.65
                                                    : 1,
                                        }}
                                    >
                                        <SafeImage wrestler={wrestler} />

                                        <strong>{wrestler.name}</strong>

                                        {isRevealed && (
                                            <span style={{ color: "#16a34a" }}>
                                                ¡ERA EL IMPOSTOR!
                                            </span>
                                        )}

                                        {isWrong && (
                                            <span style={{ color: "#dc2626" }}>
                                                ELECCIÓN INCORRECTA
                                            </span>
                                        )}

                                        {isSelected && !finished && !isWrong && (
                                            <span style={{ color: "#e6a23c" }}>
                                                SELECCIÓN DEL PARTICIPANTE
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {finished && (
                            <div className="message success" style={{ marginTop: 24 }}>
                                <h3>¡EL PARTICIPANTE ENCONTRÓ AL IMPOSTOR!</h3>

                                <p>
                                    La respuesta correcta fue:
                                    {" "}
                                    <strong>
                                        {challenge.wrestlers?.find(
                                            (w) => w.id === revealedWrestlerId
                                        )?.name || "Luchador revelado"}
                                    </strong>
                                </p>

                                {/*
                                  La explicación se obtiene desde el endpoint
                                  privado del creador. Ver el paso 2.
                                */}
                                {challenge.creator_reason && (
                                    <>
                                        <h3 style={{ marginTop: 16 }}>
                                            ¿POR QUÉ ERA EL IMPOSTOR?
                                        </h3>
                                        <p>{challenge.creator_reason}</p>
                                    </>
                                )}
                            </div>
                        )}

                        {lastAnswer?.is_correct === false && !finished && (
                            <div className="message error" style={{ marginTop: 24 }}>
                                <h3>¡ESA NO ERA LA RESPUESTA!</h3>
                                <p>El participante puede seguir intentando.</p>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <h2>LUCHADOR SECRETO</h2>

                        <p>
                            Observa las pistas y la respuesta que está
                            seleccionando el participante.
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
                                <p>No hay pistas configuradas.</p>
                            )}
                        </div>

                        <h3>SELECCIÓN DEL PARTICIPANTE</h3>

                        {lastSelection?.wrestler ? (
                            <div
                                className="selected-preview"
                                style={{
                                    border: finished
                                        ? "2px solid #16a34a"
                                        : "2px solid #e6a23c",
                                    borderRadius: 12,
                                    padding: 16,
                                }}
                            >
                                <SafeImage wrestler={lastSelection.wrestler} />

                                <div>
                                    <strong>
                                        {lastSelection.wrestler.name}
                                    </strong>

                                    <small>
                                        {finished
                                            ? "¡Respuesta correcta!"
                                            : "Respuesta seleccionada"}
                                    </small>
                                </div>
                            </div>
                        ) : (
                            <p>
                                Esperando que el participante seleccione
                                un luchador...
                            </p>
                        )}

                        {finished && (
                            <div className="message success" style={{ marginTop: 24 }}>
                                <h3>¡RESPUESTA CORRECTA!</h3>
                                <p>
                                    El luchador secreto era{" "}
                                    <strong>
                                        {lastAnswer?.wrestler?.name ||
                                            lastSelection?.wrestler?.name}
                                    </strong>.
                                </p>
                            </div>
                        )}
                    </>
                )}

                {error && (
                    <div className="message error" role="alert">
                        {error}
                    </div>
                )}

                <p
                    style={{
                        marginTop: 24,
                        textAlign: "center",
                        fontSize: 12,
                        opacity: 0.6,
                    }}
                >
                    La partida se actualiza automáticamente cada 2 segundos.
                </p>
            </section>

            <footer>
                Fan-made. No afiliado a WWE, AEW ni otras promociones.
            </footer>
        </main>
    );
}
