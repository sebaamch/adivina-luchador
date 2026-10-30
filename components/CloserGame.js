
"use client";

import { useCallback, useEffect, useState } from "react";

const SESSION_KEY = "esto-es-lucha-closer-session";

async function api(action, payload = {}) {
    const response = await fetch("/api/closer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "No se pudo completar la operación.");
    }

    return data;
}

function WrestlerCard({ wrestler, label }) {
    if (!wrestler) return null;

    return (
        <article className="closer-wrestler-card">
            <div className="closer-wrestler-image">
                <img
                    src={wrestler.local_image || `/wrestlers/${wrestler.id}.svg`}
                    alt={wrestler.name}
                    onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/wrestlers/default.svg";
                    }}
                />
            </div>
            {label && <span className="closer-card-label">{label}</span>}
            <h3>{wrestler.name}</h3>
        </article>
    );
}

function formatStat(wrestler, field) {
    if (!wrestler) return "Sin datos";

    switch (field) {
        case "birth_date":
            return wrestler.age == null
                ? "Sin datos"
                : `${wrestler.age} años`;
        case "debut_year":
            return wrestler.debut_year
                ? String(wrestler.debut_year)
                : "Sin datos";
        case "height_cm":
            return wrestler.height_cm != null
                ? `${wrestler.height_cm} cm`
                : "Sin datos";
        case "weight_kg":
            return wrestler.weight_kg != null
                ? `${wrestler.weight_kg} kg`
                : "Sin datos";
        default:
            return "Sin datos";
    }
}

function formatDistance(distance, field, unit) {
    if (distance == null) return "Sin datos";

    // Para la edad, la diferencia recibida está expresada en milisegundos.
    if (field === "birth_date") {
        const days = distance / (1000 * 60 * 60 * 24);
        const years = days / 365.2425;

        return `${Number(years.toFixed(2))} años`;
    }

    return `${distance} ${unit}`;
}

function getConditionMessage(result, challenge) {
    if (!result) return "Sin datos";

    if (result.satisfiesCondition) return null;

    const fieldLabels = {
        birth_date: "años",
        debut_year: "año de debut",
        height_cm: "cm de estatura",
        weight_kg: "kg de peso"
    };

    const fieldLabel = fieldLabels[challenge?.field] || "valor";
    const operator = challenge?.operator;
    const target = challenge?.target;

    if (operator && target != null) {
        const conditions = {
            greater_than: `mayor que ${target}`,
            greaterThan: `mayor que ${target}`,
            ">": `mayor que ${target}`,
            ">=": `mayor o igual a ${target}`,
            less_than: `menor que ${target}`,
            lessThan: `menor que ${target}`,
            "<": `menor que ${target}`,
            "<=": `menor o igual a ${target}`,
            equals: `igual a ${target}`,
            "===": `igual a ${target}`
        };

        const condition = conditions[operator];

        if (condition) {
            return `No cumple la condición: se requiere un valor ${condition} ${fieldLabel}.`;
        }
    }

    return "No cumple la condición establecida para este desafío.";
}



export default function CloserGame() {
    const [session, setSession] = useState(null);
    const [room, setRoom] = useState(null);
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    // Estados del modal de resultados.
    const [resultModalOpen, setResultModalOpen] = useState(false);
    const [resultModalRound, setResultModalRound] = useState(null);

    // Mostrar el modal una sola vez cuando se revelan ambas respuestas.
    useEffect(() => {
        if (
            room?.revealed &&
            room?.roundNumber != null &&
            room.roundNumber !== resultModalRound
        ) {
            setResultModalRound(room.roundNumber);
            setResultModalOpen(true);
        }
    }, [room?.revealed, room?.roundNumber, resultModalRound]);

    const applyRoom = useCallback((nextRoom) => {
        setRoom(nextRoom);
    }, []);

    const saveSession = useCallback((nextSession, nextRoom) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        setSession(nextSession);
        setRoom(nextRoom);
        setError("");
        setNotice("");
    }, []);

    // Recuperar una sala que ya estaba abierta en este navegador.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(SESSION_KEY);
            if (!stored) return;

            const parsed = JSON.parse(stored);

            if (parsed?.code && parsed?.token) {
                setSession(parsed);
            }
        } catch {
            localStorage.removeItem(SESSION_KEY);
        }
    }, []);

    // Consultar periódicamente el estado de la sala para sincronizar a ambos.
    useEffect(() => {
        if (!session) return;

        let active = true;

        const refresh = async () => {
            try {
                const data = await api("state", session);

                if (active) {
                    applyRoom(data.room);
                    setError("");
                }
            } catch (err) {
                if (active) setError(err.message);
            }
        };

        refresh();

        const timer = setInterval(refresh, 2500);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [session, applyRoom]);

    // Buscar candidatos usando la API de luchadores del proyecto.
    useEffect(() => {
        if (
            !room ||
            room.status !== "playing" ||
            room.myAnswered ||
            selected
        ) {
            setSuggestions([]);
            setSearching(false);
            return;
        }

        if (query.trim().length < 2) {
            setSuggestions([]);
            return;
        }

        let active = true;
        const controller = new AbortController();

        const search = async () => {
            setSearching(true);

            try {
                const response = await fetch(
                    `/api/wrestlers?q=${encodeURIComponent(query.trim())}`,
                    { signal: controller.signal }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Error al buscar luchadores.");
                }

                if (active) {
                    const list = Array.isArray(data)
                        ? data
                        : data.wrestlers || [];

                    const field = room.challenge?.field;

                    setSuggestions(
                        list.filter((w) => {
                            if (String(w.id) === String(room.reference?.id)) {
                                return false;
                            }

                            const value = w[field];

                            if (value === null || value === undefined || value === "") {
                                return false;
                            }

                            if (field === "birth_date") {
                                return Number.isFinite(Date.parse(value));
                            }

                            return Number.isFinite(Number(value));
                        })
                    );
                }
            } catch (err) {
                if (active && err.name !== "AbortError") {
                    setError(err.message);
                }
            } finally {
                if (active) setSearching(false);
            }
        };

        search();

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        query,
        room?.status,
        room?.myAnswered,
        room?.reference?.id,
        room?.challenge?.field,
        selected
    ]);

    async function handleCreate(event) {
        event.preventDefault();
        setLoading(true);
        setError("");

        try {
            const data = await api("create", { name });

            const nextSession = {
                code: data.room.code,
                token: data.token
            };

            saveSession(nextSession, data.room);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleJoin(event) {
        event.preventDefault();
        setLoading(true);
        setError("");

        try {
            const data = await api("join", { name, code });

            const nextSession = {
                code: data.room.code,
                token: data.token
            };

            saveSession(nextSession, data.room);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleAnswer(event) {
        event.preventDefault();

        if (!selected) {
            setError("Selecciona un luchador antes de responder.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const data = await api("answer", {
                ...session,
                wrestlerId: selected.id
            });

            applyRoom(data.room);
            setSelected(null);
            setQuery("");
            setSuggestions([]);
            setNotice(
                data.room.revealed
                    ? "¡Ambas respuestas están listas!"
                    : "Respuesta guardada. Esperando al rival..."
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleNextRound() {
        setLoading(true);
        setError("");

        try {
            const data = await api("next", session);
            applyRoom(data.room);
            setSelected(null);
            setQuery("");
            setSuggestions([]);
            setNotice("");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function leaveRoom() {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setRoom(null);
        setSelected(null);
        setSuggestions([]);
        setQuery("");
        setError("");
        setNotice("");
    }

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(room.code);
            setNotice("Código copiado.");
        } catch {
            setNotice(`Código de la sala: ${room.code}`);
        }
    }

    if (!session || !room) {
        return (
            <main className="page closer-page">
                <section className="hero closer-hero">
                    <div className="eyebrow">ESTO ES LUCHA</div>
                    <h1>¿Quién está más cerca?</h1>
                    <p>Dos jugadores. Diez rondas. Una sola respuesta más cercana.</p>
                </section>

                <section className="closer-lobby">
                    <form className="closer-panel" onSubmit={handleCreate}>
                        <h2>Crear una sala</h2>
                        <label htmlFor="closer-name-create">Tu nombre</label>
                        <input
                            id="closer-name-create"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={30}
                            required
                            placeholder="Escribe tu nombre"
                        />
                        <button
                            className="primary big"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? "Creando..." : "Crear partida"}
                        </button>
                    </form>

                    <form className="closer-panel" onSubmit={handleJoin}>
                        <h2>Unirse a una sala</h2>
                        <label htmlFor="closer-name-join">Tu nombre</label>
                        <input
                            id="closer-name-join"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={30}
                            required
                            placeholder="Escribe tu nombre"
                        />

                        <label htmlFor="closer-code">Código de la sala</label>
                        <input
                            id="closer-code"
                            value={code}
                            onChange={(event) => setCode(event.target.value.toUpperCase())}
                            maxLength={8}
                            required
                            placeholder="Ej. A3F9B21C"
                        />

                        <button
                            className="primary big"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? "Ingresando..." : "Unirme a la partida"}
                        </button>
                    </form>
                </section>

                {error && <p className="closer-error">{error}</p>}´
                <button
            className="secondary"
            onClick={() => {
              localStorage.removeItem(
                "adivina-versus-session"
              );

              setSession(null);
              setRoom(null);
              setError("");
              setQuery("");
              setSelected(null);
              window.location.href = "/";
            }}
          >
            VOLVER AL MENÚ DE JUEGOS
          </button>
            </main>
        );
    }

    if (room.status === "waiting") {
        return (
            <main className="page closer-page">
                <section className="hero closer-hero">
                    <div className="eyebrow">SALA CREADA</div>
                    <h1>Esperando al rival</h1>
                    <p>Comparte este código con el otro jugador.</p>
                    <button
                        type="button"
                        onClick={copyCode}
                        className="closer-code"
                    >
                        {room.code} <span>Copiar código</span>
                    </button>
                </section>

                <div className="closer-panel closer-waiting">
                    <p>
                        Tu nombre: <strong>{room.player1Name}</strong>
                    </p>
                    <p>La partida comenzará cuando se una el segundo jugador.</p>
                    <p className="closer-muted">
                        Esta pantalla se actualizará automáticamente.
                    </p>
                    <button
                        type="button"
                        className="closer-secondary"
                        onClick={leaveRoom}
                    >
                        Salir de la sala
                    </button>
                </div>

                {error && <p className="closer-error">{error}</p>}
            </main>
        );
    }

    const isHost = room.player === "player1";
    const myName = isHost ? room.player1Name : room.player2Name;
    const opponentName = isHost ? room.player2Name : room.player1Name;

    const myScore = isHost ? room.player1Score : room.player2Score;
    const opponentScore = isHost ? room.player2Score : room.player1Score;

    const result = room.result;
    const myRoundResult = result
        ? result[room.player]
        : null;
    const opponentRoundResult = result
        ? result[room.player === "player1" ? "player2" : "player1"]
        : null;

    if (room.status === "finished") {
        let finalMessage = "La partida terminó en empate.";

        if (room.player1Score > room.player2Score) {
            finalMessage = isHost
                ? "¡Ganaste la partida!"
                : `${room.player1Name} ganó la partida.`;
        } else if (room.player2Score > room.player1Score) {
            finalMessage = isHost
                ? `${room.player2Name} ganó la partida.`
                : "¡Ganaste la partida!";
        }

        return (
            <main className="page closer-page">
                <section className="hero closer-hero">
                    <div className="eyebrow">RESULTADO FINAL</div>
                    <h1>{finalMessage}</h1>
                    <p>La partida ha terminado después de diez rondas.</p>
                </section>

                <section className="closer-scoreboard">
                    <div className="closer-score">
                        <span>{room.player1Name}</span>
                        <strong>{room.player1Score}</strong>
                        <small>puntos</small>
                    </div>
                    <div className="closer-score">
                        <span>{room.player2Name}</span>
                        <strong>{room.player2Score}</strong>
                        <small>puntos</small>
                    </div>
                </section>

                <section className="closer-panel">
                    <h2>Historial de rondas</h2>
                    {room.history.map((item) => (
                        <div className="closer-history-row" key={item.roundNumber}>
                            <strong>Ronda {item.roundNumber}</strong>
                            <span>{item.challenge}</span>
                            <span>
                                {item.result.winner === "tie"
                                    ? "Empate"
                                    : `Punto para ${item.result.winner === "player1"
                                        ? room.player1Name
                                        : room.player2Name
                                    }`}
                            </span>
                        </div>
                    ))}
                    <button type="button" className="hot-back-link" onClick={leaveRoom}>
                        Volver al menú
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="page closer-page">
            <section className="hero closer-hero">
                <div className="eyebrow">ESTO ES LUCHA · MULTIJUGADOR</div>
                <h1>¿Quién está más cerca?</h1>
                <p>
                    Ronda {room.roundNumber} de {room.totalRounds}
                </p>
                <button
                    type="button"
                    className="closer-code"
                    onClick={copyCode}
                >
                    Sala {room.code} <span>Copiar código</span>
                </button>
            </section>

            <section className="closer-scoreboard">
                <div className="closer-score">
                    <span>{room.player1Name}</span>
                    <strong>{room.player1Score}</strong>
                    <small>puntos</small>
                </div>
                <div className="closer-score">
                    <span>{room.player2Name || "Esperando rival"}</span>
                    <strong>{room.player2Score}</strong>
                    <small>puntos</small>
                </div>
            </section>

            <section className="closer-challenge">
                <h2>{room.challenge?.label}</h2>

                <div className="closer-reference">
                    <WrestlerCard wrestler={room.reference} />

                    {room.answers?.player1 && room.answers?.player2 && (
                        <div className="closer-reference-stats">
                            <p>
                                <span>Edad</span>
                                <strong>{formatStat(room.reference, "birth_date")}</strong>
                            </p>
                            <p>
                                <span>Debut</span>
                                <strong>{formatStat(room.reference, "debut_year")}</strong>
                            </p>
                            <p>
                                <span>Altura</span>
                                <strong>{formatStat(room.reference, "height_cm")}</strong>
                            </p>
                            <p>
                                <span>Peso</span>
                                <strong>{formatStat(room.reference, "weight_kg")}</strong>
                            </p>
                        </div>
                    )}
                </div>
            </section>

            {!room.myAnswered && (
                <form className="closer-panel" onSubmit={handleAnswer}>
                    <h2>Elige tu luchador</h2>
                    <p>Tu elección permanecerá oculta hasta que tu rival responda.</p>

                    <label htmlFor="closer-search">Buscar luchador</label>
                    <input
                        id="closer-search"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setSelected(null);
                        }}
                        placeholder="Escribe al menos dos letras"
                        autoComplete="off"
                    />

                    {searching && <p className="closer-muted">Buscando...</p>}

                    {suggestions.length > 0 && (
                        <div className="closer-suggestions">
                            {suggestions.map((wrestler) => (
                                <button
                                    type="button"
                                    key={wrestler.id}
                                    className={
                                        selected?.id === wrestler.id
                                            ? "closer-suggestion selected"
                                            : "closer-suggestion"
                                    }
                                    onClick={() => {
                                        setSelected(wrestler);
                                        setQuery(wrestler.name);
                                        setSuggestions([]);
                                        setError("");
                                    }}
                                >
                                    <img
                                        src={
                                            wrestler.local_image ||
                                            `/wrestlers/${wrestler.id}.svg`
                                        }
                                        alt=""
                                        onError={(event) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src = "/wrestlers/default.svg";
                                        }}
                                    />
                                    <span>{wrestler.name}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {selected && (
                        <div className="closer-selected">
                            <WrestlerCard wrestler={selected} label="TU ELECCIÓN" />
                            <button type="submit" className="secondary" disabled={loading}>
                                {loading ? "Guardando..." : "Confirmar respuesta"}
                            </button>
                        </div>
                    )}
                </form>
            )}

            {room.myAnswered && !room.revealed && (
                <section className="closer-panel closer-waiting">
                    <h2>Respuesta enviada</h2>
                    <p>Tu elección está oculta.</p>
                    <p>
                        {room.opponentAnswered
                            ? "Ambas respuestas están llegando al servidor..."
                            : `Esperando la respuesta de ${opponentName}...`}
                    </p>
                    <div className="closer-waiting-indicator" />
                </section>
            )}

            {room.revealed && (
                <section className="closer-panel closer-results">
                    <h2>¡Respuestas reveladas!</h2>

                    <div className="closer-answer-grid">
                        <div>
                            <WrestlerCard
                                wrestler={room.answers.player1}
                                label={room.player1Name}
                            />
                            <p>
                                {formatStat(room.answers.player1, room.challenge.field)}
                            </p>
                            <p>
                                {result.player1.satisfiesCondition
                                    ? "Cumple la condición"
                                    : "No cumple la condición"}
                            </p>
                            <p>
                                {result.winner === "player1"
                                    ? "Ganó esta ronda"
                                    : result.winner === "tie"
                                        ? "Empate"
                                        : "Sin punto"}
                            </p>
                        </div>

                        <div>
                            <WrestlerCard
                                wrestler={room.answers.player2}
                                label={room.player2Name}
                            />
                            <p>
                                {formatStat(room.answers.player2, room.challenge.field)}
                            </p>
                            <p>
                                {result.player2.satisfiesCondition
                                    ? "Cumple la condición"
                                    : "No cumple la condición"}
                            </p>
                            <p>
                                {result.winner === "player2"
                                    ? "Ganó esta ronda"
                                    : result.winner === "tie"
                                        ? "Empate"
                                        : "Sin punto"}
                            </p>
                        </div>
                    </div>

                    <div className="closer-round-outcome">
                        {result.winner === "tie"
                            ? "La ronda termina en empate. No se suman puntos."
                            : `Punto para ${result.winner === "player1"
                                ? room.player1Name
                                : room.player2Name
                            }.`}
                    </div>


                    <p className="closer-muted">
                        Diferencia con la referencia:{" "}
                        <strong
                            style={{
                                display: "block",
                                fontSize: "1.2rem",
                                overflowWrap: "anywhere"
                            }}
                        >
                            {myRoundResult?.satisfiesCondition
                                ? formatDistance(
                                    myRoundResult?.distance,
                                    room.challenge.field,
                                    room.challenge.unit
                                )
                                : getConditionMessage(myRoundResult, room.challenge)}
                        </strong>

                        para ti;{" "}

                        <strong
                            style={{
                                display: "block",
                                fontSize: "1.2rem",
                                overflowWrap: "anywhere"
                            }}
                        >
                            {opponentRoundResult?.satisfiesCondition
                                ? formatDistance(
                                    opponentRoundResult?.distance,
                                    room.challenge.field,
                                    room.challenge.unit
                                )
                                : getConditionMessage(opponentRoundResult, room.challenge)}
                        </strong>

                        para tu rival.
                    </p>


                    {isHost ? (
                        <button
                            type="button"
                            onClick={handleNextRound}
                            disabled={loading}
                            className="primary big"
                        >
                            {loading
                                ? "Cargando..."
                                : room.roundNumber >= room.totalRounds
                                    ? "Ver resultado final"
                                    : "Siguiente ronda"}
                        </button>
                    ) : (
                        <p className="closer-muted">
                            Esperando a que el anfitrión avance a la siguiente ronda.
                        </p>
                    )}
                </section>
            )}

            {resultModalOpen && room.revealed && result && (
                <div
                    role="presentation"
                    onClick={() => setResultModalOpen(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 1000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                        background: "rgba(0, 0, 0, 0.78)",
                        backdropFilter: "blur(5px)"
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="closer-result-modal-title"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: "min(100%, 520px)",
                            maxHeight: "90vh",
                            overflowY: "auto",
                            padding: "28px",
                            borderRadius: "20px",
                            border: "1px solid rgba(255,255,255,.16)",
                            background: "#171717",
                            color: "#fff",
                            boxShadow: "0 24px 80px rgba(0,0,0,.5)"
                        }}
                    >
                        <p
                            style={{
                                margin: "0 0 8px",
                                color: "#f1f1f1",
                                fontWeight: 800,
                                letterSpacing: ".12em",
                                fontSize: ".75rem"
                            }}
                        >
                            RESULTADO DE LA RONDA {room.roundNumber}
                        </p>

                        <h2
                            id="closer-result-modal-title"
                            style={{
                                margin: "0 0 8px",
                                fontSize: "1.7rem",
                                lineHeight: 1.2
                            }}
                        >
                            {result.winner === "tie"
                                ? "¡Empate!"
                                : `¡Punto para ${result.winner === "player1"
                                    ? room.player1Name
                                    : room.player2Name
                                }!`}
                        </h2>

                        <p style={{ margin: "0 0 22px", color: "#c4c4c4" }}>
                            Diferencia 
                        </p>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: "12px"
                            }}
                        >
                            {/* Tu resultado */}
                            <div
                                style={{
                                    padding: "16px",
                                    borderRadius: "14px",
                                    background: "#262626",
                                    border:
                                        result.winner === room.player
                                            ? "1px solid #f87171"
                                            : "1px solid #404040"
                                }}
                            >
                                <p
                                    style={{
                                        margin: "0 0 8px",
                                        color: "#d4d4d4",
                                        fontSize: ".9rem"
                                    }}
                                >
                                    Tú · {myName}
                                </p>


                                <strong
                                    style={{
                                        display: "block",
                                        fontSize: "1.2rem",
                                        overflowWrap: "anywhere"
                                    }}
                                >
                                    {myRoundResult?.satisfiesCondition
                                        ? formatDistance(
                                            myRoundResult?.distance,
                                            room.challenge.field,
                                            room.challenge.unit
                                        )
                                        : getConditionMessage(myRoundResult, room.challenge)}
                                </strong>


                                <small style={{ color: "#a3a3a3" }}>
                                    de diferencia
                                </small>
                            </div>

                            {/* Resultado del rival */}
                            <div
                                style={{
                                    padding: "16px",
                                    borderRadius: "14px",
                                    background: "#262626",
                                    border: "1px solid #404040"
                                }}
                            >
                                <p
                                    style={{
                                        margin: "0 0 8px",
                                        color: "#d4d4d4",
                                        fontSize: ".9rem"
                                    }}
                                >
                                    Rival · {opponentName}
                                </p>


                                <strong
                                    style={{
                                        display: "block",
                                        fontSize: "1.2rem",
                                        overflowWrap: "anywhere"
                                    }}
                                >
                                    {opponentRoundResult?.satisfiesCondition
                                        ? formatDistance(
                                            opponentRoundResult?.distance,
                                            room.challenge.field,
                                            room.challenge.unit
                                        )
                                        : getConditionMessage(opponentRoundResult, room.challenge)}
                                </strong>


                                <small style={{ color: "#a3a3a3" }}>
                                    de diferencia
                                </small>
                            </div>
                        </div>

                        <p
                            style={{
                                margin: "18px 0 22px",
                                color: "#d4d4d4",
                                lineHeight: 1.5
                            }}
                        >
                            {result.winner === "tie"
                                ? "Ningún jugador obtiene un punto en esta ronda."
                                : result.winner === room.player
                                    ? "¡Tu respuesta fue la que mejor cumplió el desafío!"
                                    : `${opponentName} consiguió el punto de esta ronda.`}
                        </p>

                        <button
                            type="button"
                            className="primary big"
                            onClick={() => setResultModalOpen(false)}
                            style={{ width: "100%" }}
                        >
                            Continuar
                        </button>
                    </section>
                </div>
            )}

            {notice && <p className="closer-notice">{notice}</p>}
            {error && <p className="closer-error">{error}</p>}

            <button
                type="button"
                className="closer-secondary"
                onClick={leaveRoom}
            >
                Salir de la partida
            </button>
        </main>
    );
}

