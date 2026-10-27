"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const SESSION_KEY = "adivina-hot-potato-session";

function readSavedSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  return `00:${String(safe).padStart(2, "0")}`;
}

function RulesTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rules-tooltip">
      <button
        type="button"
        className="rules-tooltip-trigger"
        aria-label="Ver reglas de Bomba de tiempo"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        ?
      </button>

      {open && (
        <div
          className="rules-tooltip-content"
          role="dialog"
          aria-label="Reglas de Bomba de tiempo"
        >
          <h3>¿Cómo se juega?</h3>

          <p>
            <strong>1. Forma nombres:</strong> usa las letras
            disponibles para escribir el nombre de un luchador
            de la base de datos.
          </p>

          <p>
            <strong>2. Responde en tu turno:</strong> ingresa
            el nombre y pulsa “Responder y pasar”.
          </p>

          <p>
            <strong>3. Gana puntos:</strong> cada luchador válido
            puede puntuar una sola vez durante la partida.
          </p>

          <p>
            <strong>4. Cambian las letras:</strong> después de
            cada respuesta, el turno pasa al otro jugador y
            las letras cambian.
          </p>

          <p>
            <strong>5. Controla el tiempo:</strong> consigue
            tantos puntos como puedas antes de que termine
            la partida.
          </p>

          <button
            type="button"
            className="rules-tooltip-close"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

export default function HotPotatoGame() {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState(null);
  const [savedSessionExists, setSavedSessionExists] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [resultsTab, setResultsTab] = useState("results");

  // Estado para revolver las letras una vez por turno.
  const [shuffledLetters, setShuffledLetters] = useState(null);
  const [shuffleUsed, setShuffleUsed] = useState(false);

  const refreshRoom = useCallback(async (currentSession = session) => {
    if (!currentSession) return;

    try {
      const response = await fetch(
        `/api/hot-potato/${encodeURIComponent(currentSession.code)}?token=${encodeURIComponent(currentSession.token)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la sala.");
      }

      setRoom(data);
    } catch (e) {
      setError(e.message || "No se pudo actualizar la sala.");
    }
  }, [session]);

  useEffect(() => {
    const saved = readSavedSession();

    setSavedSessionExists(Boolean(saved));

    if (saved) {
      setPlayerName(saved.playerName || "");
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!session || room?.status === "finished") return;

    refreshRoom(session);

    const pollId = setInterval(() => refreshRoom(session), 1000);

    return () => clearInterval(pollId);
  }, [session, refreshRoom, room?.status]);

  useEffect(() => {
    const clockId = setInterval(() => setNow(Date.now()), 200);

    return () => clearInterval(clockId);
  }, []);

  const remaining = useMemo(() => {
    if (!room?.endsAt) return 60;

    return Math.max(
      0,
      Math.ceil((new Date(room.endsAt).getTime() - now) / 1000)
    );
  }, [room?.endsAt, now]);

  const turnRemaining = useMemo(() => {
    if (!room?.turnEndsAt) return 0;

    return Math.max(
      0,
      Math.ceil(
        (new Date(room.turnEndsAt).getTime() - now) / 1000
      )
    );
  }, [room?.turnEndsAt, now]);

  const turnProgress = Math.min(
    100,
    Math.max(0, (turnRemaining / 15) * 100)
  );

  const isMyTurn =
    room?.status === "playing" &&
    room?.turnPlayer === session?.playerNo;

  // Detecta cuándo cambian las letras del turno.
  const currentLettersKey = (room?.currentLetters || []).join("|");

  useEffect(() => {
    setShuffledLetters(null);
    setShuffleUsed(false);
  }, [currentLettersKey]);

  // Permite revolver las letras una sola vez por turno.
  function shuffleLetters() {
    if (shuffleUsed || !isMyTurn || loading || remaining <= 0) {
      return;
    }

    const letters = [
      ...(shuffledLetters ?? room?.currentLetters ?? [])
    ];

    if (letters.length < 2) return;

    const original = [...letters];

    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }

    // Si el orden no cambia, mueve la primera letra al final.
    if (letters.every((letter, index) => letter === original[index])) {
      letters.push(letters.shift());
    }

    setShuffledLetters(letters);
    setShuffleUsed(true);
  }

  const me = room?.players?.find(
    (player) => player.playerNo === session?.playerNo
  );

  const opponent = room?.players?.find(
    (player) => player.playerNo !== session?.playerNo
  );

  const winnerText =
    room?.status !== "finished"
      ? ""
      : room.winner === "draw"
        ? "¡Empate!"
        : room.winner === session?.playerNo
          ? "¡Ganaste!"
          : "¡Tu rival ganó!";

  async function createRoom() {
    if (playerName.trim().length < 2) {
      setError("Ingresa un nombre de al menos 2 caracteres.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/hot-potato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la sala.");
      }

      const nextSession = {
        code: data.game.code,
        playerNo: data.player.playerNo,
        token: data.player.token,
        playerName: data.player.name
      };

      saveSession(nextSession);
      setSession(nextSession);
      setRoom(null);
      setSavedSessionExists(true);
    } catch (e) {
      setError(e.message || "No se pudo crear la sala.");
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (playerName.trim().length < 2) {
      setError("Ingresa tu nombre antes de unirte.");
      return;
    }

    if (joinCode.trim().length !== 6) {
      setError("Ingresa el código de 6 caracteres.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/hot-potato/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: joinCode.trim().toUpperCase(),
          playerName: playerName.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo unir a la sala.");
      }

      const nextSession = {
        code: data.game.code,
        playerNo: data.player.playerNo,
        token: data.player.token,
        playerName: data.player.name
      };

      saveSession(nextSession);
      setSession(nextSession);
      setRoom(null);
      setSavedSessionExists(true);
    } catch (e) {
      setError(e.message || "No se pudo unir a la sala.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(event) {
    event?.preventDefault();

    if (!session || !isMyTurn || !answer.trim() || loading) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/hot-potato/${encodeURIComponent(session.code)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: session.token,
            answer: answer.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo enviar la respuesta.");
      }

      setAnswer("");
      setMessage(data.message || (data.scored ? "¡Punto!" : "Turno enviado."));

      await refreshRoom(session);
    } catch (e) {
      setError(e.message || "No se pudo enviar la respuesta.");
      await refreshRoom(session);
    } finally {
      setLoading(false);
    }
  }

  function resumeSavedSession() {
    const saved = readSavedSession();

    if (!saved) return;

    setSession(saved);
    setPlayerName(saved.playerName || "");
    setError("");
    setMessage("");
  }

  async function rematch() {
    if (!session || loading) return;

    setLoading(true);
    setError("");
    setMessage("");
    setAnswer("");

    try {
      const response = await fetch(
        `/api/hot-potato/${encodeURIComponent(session.code)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            token: session.token,
            action: "rematch"
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo iniciar la revancha."
        );
      }

      setRoom(data.room);
      setResultsTab("results");
      setShuffledLetters(null);
      setShuffleUsed(false);

      await refreshRoom(session);
    } catch (e) {
      setError(e.message || "No se pudo iniciar la revancha.");
      await refreshRoom(session);
    } finally {
      setLoading(false);
    }
  }

  function leaveRoom() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setRoom(null);
    setAnswer("");
    setError("");
    setMessage("");
    setSavedSessionExists(false);
    setShuffledLetters(null);
    setShuffleUsed(false);
  }

  if (!hydrated || !session) {
    return (
      <main className="page hot-page">
        <section className="hero">
          <div className="eyebrow">NUEVO MODO VERSUS</div>
          <h1>Bomba de tiempo</h1>
          <RulesTooltip />
        </section>

        <section className="home-card hot-home-card">
          <label className="field-label" htmlFor="hot-player-name">
            TU NOMBRE
          </label>

          <input
            id="hot-player-name"
            className="name-input"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
            placeholder="Escoge tu nombre"
            maxLength={24}
          />

          <button
            className="primary big"
            onClick={createRoom}
            disabled={loading}
          >
            {loading ? "CREANDO..." : "CREAR SALA"}
          </button>

          <div className="or">O ÚNETE A UNA SALA</div>

          <div className="join-row">
            <input
              aria-label="Código de sala"
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
                )
              }
              maxLength={6}
              placeholder="CÓDIGO"
            />

            <button
              className="secondary"
              onClick={joinRoom}
              disabled={loading || joinCode.length !== 6}
            >
              UNIRSE
            </button>
          </div>

          {savedSessionExists && (
            <button
              className="resume-button"
              onClick={resumeSavedSession}
            >
              CONTINUAR PARTIDA ANTERIOR
            </button>
          )}

          {error && <div className="message error">{error}</div>}

          <a className="hot-back-link" href="/">
            Volver a Adivina el Luchador
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="page hot-page">
      <section className="hero compact">
        <div className="eyebrow">SALA {session.code}</div>
        <h1>Bomba de tiempo</h1>

        <p>
          {me?.name || session.playerName} ·{" "}
          {opponent ? `Rival: ${opponent.name}` : "Esperando al rival..."}
        </p>

        <div className="room-actions hot-actions">
          <button className="secondary" onClick={leaveRoom}>
            SALIR DE ESTA SALA
          </button>

          <a className="secondary hot-menu-link" href="/">
            OTRO MODO DE JUEGO
          </a>
        </div>
      </section>

      <section className="hot-scoreboard">
        {[1, 2].map((playerNo) => {
          const player = room?.players?.find(
            (item) => item.playerNo === playerNo
          );

          return (
            <div
              className={`hot-score-card ${room?.turnPlayer === playerNo && room?.status === "playing"
                  ? "hot-active-player"
                  : ""
                }`}
              key={playerNo}
            >
              <span>
                {player?.name ||
                  (playerNo === 1 ? "Jugador 1" : "Esperando jugador 2")}
              </span>

              <strong>
                {playerNo === 1
                  ? room?.player1Score || 0
                  : room?.player2Score || 0}
              </strong>

              <small>
                {room?.turnPlayer === playerNo && room?.status === "playing"
                  ? "TIENE EL TURNO"
                  : `JUGADOR ${playerNo}`}
              </small>
            </div>
          );
        })}
      </section>

      {room?.status === "waiting" && (
        <section className="game-card hot-waiting">
          <h2>Comparte el código con tu rival</h2>
          <div className="hot-room-code">{session.code}</div>
          <p>
            La partida de 90 segundos comienza cuando se una el segundo jugador.
          </p>

          <button
            className="secondary"
            onClick={() => navigator.clipboard?.writeText(session.code)}
          >
            COPIAR CÓDIGO
          </button>
        </section>
      )}

      {room?.status === "playing" && (
        <section className="game-card hot-round-card">
          <div className={`hot-timer ${remaining <= 10 ? "hot-timer-danger" : ""}`}>
            <span>TIEMPO RESTANTE</span>
            <strong>{formatTime(remaining)}</strong>
          </div>

          <p className="hot-turn-label">
            {isMyTurn
              ? "🔥 ES TU TURNO"
              : `⏳ TURNO DE ${opponent?.name || "TU RIVAL"}`}
          </p>

          <div className="hot-turn-timer">
            <div className="hot-turn-timer-header">
              <span>TIEMPO DE TU TURNO</span>
              <strong className={turnRemaining <= 3 ? "danger" : ""}>
                {turnRemaining}s
              </strong>
            </div>

            <div
              className="hot-turn-progress"
              role="progressbar"
              aria-label="Tiempo restante del turno"
              aria-valuemin={0}
              aria-valuemax={15}
              aria-valuenow={turnRemaining}
            >
              <div
                className={`hot-turn-progress-fill ${turnRemaining <= 3
                    ? "danger"
                    : turnRemaining <= 5
                      ? "warning"
                      : ""
                  }`}
                style={{ width: `${turnProgress}%` }}
              />
            </div>
          </div>

          <p className="hot-instructions">
            Escribe un luchador de la base de datos que puedas formar con estas
            letras. Cada nombre solo puntúa una vez. Cada respuesta pasa el
            turno y cambia las letras.
          </p>

          <div className="hot-letter-controls">
            <div className="hot-letters" aria-label="Letras disponibles">
              {(shuffledLetters ?? room.currentLetters ?? []).map(
                (letter, index) => (
                  <span
                    className="hot-letter"
                    key={`${letter}-${index}`}
                  >
                    {letter}
                  </span>
                )
              )}
            </div>

            <button
              type="button"
              className="hot-shuffle-button"
              onClick={shuffleLetters}
              disabled={
                shuffleUsed ||
                !isMyTurn ||
                loading ||
                remaining <= 0
              }
              title={
                shuffleUsed
                  ? "Ya revolviste las letras en este turno"
                  : "Puedes revolver las letras una vez por turno"
              }
            >
              <span aria-hidden="true">🔀</span>
              {shuffleUsed ? "Letras revueltas" : "Revolver letras"}
            </button>
          </div>

          <form className="hot-answer-form" onSubmit={submitAnswer}>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={isMyTurn ? "Nombre del luchador..." : "Espera tu turno"}
              disabled={!isMyTurn || loading || remaining <= 0}
              maxLength={80}
            />

            <button
              className="primary"
              type="submit"
              disabled={!isMyTurn || loading || !answer.trim() || remaining <= 0}
            >
              {loading ? "VALIDANDO..." : "RESPONDER Y PASAR"}
            </button>
          </form>

          {message && (
            <div className="message success" role="status">
              {message}
            </div>
          )}

          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
        </section>
      )}

      {room?.status === "finished" && (
        <section className="winner-card hot-winner-card">
          <div className="eyebrow">FIN DE LA PARTIDA</div>
          <h2>{winnerText}</h2>

          <p>
            Resultado final: {room.player1Score || 0} -{" "}
            {room.player2Score || 0}
          </p>

          <button
            className="primary"
            onClick={rematch}
            disabled={loading}
          >
            {loading ? "INICIANDO..." : "REVANCHA"}
          </button>

          <button
            className="secondary"
            onClick={leaveRoom}
            disabled={loading}
          >
            VOLVER AL MENÚ
          </button>

          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
        </section>
      )}

      {room?.status === "finished" && (
        <section className="game-card hot-history-card">
          <h2>Resumen de la partida</h2>

          <div
            className="hot-results-tabs"
            role="tablist"
            aria-label="Resumen de la partida"
          >
            <button
              type="button"
              role="tab"
              aria-selected={resultsTab === "results"}
              className={resultsTab === "results" ? "primary" : "secondary"}
              onClick={() => setResultsTab("results")}
            >
              Resultados
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={resultsTab === "possible"}
              className={resultsTab === "possible" ? "primary" : "secondary"}
              onClick={() => setResultsTab("possible")}
            >
              Nombres posibles
            </button>
          </div>

          {resultsTab === "results" && (
            <div className="hot-history-list" role="tabpanel">
              {room.history?.length ? (
                [...room.history].reverse().map((item, index) => {
                  const player = room.players?.find(
                    (p) => p.playerNo === item.playerNo
                  );

                  return (
                    <div
                      className={`hot-history-row ${item.scored ? "hot-history-correct" : ""
                        }`}
                      key={`${item.createdAt || index}-${index}`}
                    >
                      <span>
                        {player?.name || `Jugador ${item.playerNo}`}
                      </span>
                      <strong>{item.answer || "(sin respuesta)"}</strong>
                      <b>{item.scored ? "+1" : "0"}</b>
                    </div>
                  );
                })
              ) : (
                <p>La partida no registró respuestas.</p>
              )}
            </div>
          )}

          {resultsTab === "possible" && (
            <div className="hot-possible-list" role="tabpanel">
              {room.history?.length ? (
                room.history.map((item, index) => {
                  const player = room.players?.find(
                    (p) => p.playerNo === item.playerNo
                  );

                  const letters = Array.isArray(item.letters)
                    ? item.letters
                    : [];

                  const possibleNames = Array.isArray(item.possibleNames)
                    ? item.possibleNames
                    : [];

                  return (
                    <article
                      className="hot-possible-turn"
                      key={`${item.createdAt || index}-${index}`}
                    >
                      <div className="hot-possible-turn-header">
                        <strong>
                          Turno {index + 1}:{" "}
                          {player?.name || `Jugador ${item.playerNo}`}
                        </strong>

                        <span>
                          {item.event === "timeout"
                            ? "Tiempo agotado"
                            : item.event === "pass"
                              ? "Turno pasado"
                              : item.answer || "Respuesta"}
                        </span>
                      </div>

                      {letters.length > 0 ? (
                        <div
                          className="hot-letters hot-possible-letters"
                          aria-label={`Letras del turno ${index + 1}`}
                        >
                          {letters.map((letter, letterIndex) => (
                            <span
                              className="hot-letter"
                              key={`${letter}-${letterIndex}`}
                            >
                              {letter}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p>No hay letras registradas para este turno.</p>
                      )}

                      {letters.length > 0 &&
                        (possibleNames.length > 0 ? (
                          <>
                            <p className="hot-possible-count">
                              {possibleNames.length} nombre(s) posible(s)
                            </p>

                            <div className="hot-possible-names">
                              {possibleNames.map((name) => (
                                <span
                                  className="hot-possible-name"
                                  key={name}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p>
                            No se encontraron nombres que se puedan formar
                            con estas letras.
                          </p>
                        ))}
                    </article>
                  );
                })
              ) : (
                <p>No hay turnos registrados.</p>
              )}
            </div>
          )}
        </section>
      )}

      {!room && (
        <section className="waiting-box">
          Conectando con la sala...
        </section>
      )}

      {room?.status !== "playing" &&
        room?.status !== "waiting" &&
        error && (
          <div className="message error hot-global-error">
            {error}
          </div>
        )}
    </main>
  );
}