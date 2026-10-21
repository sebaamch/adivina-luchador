
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
const columns = [
  ["promotion", "Promoción"],
  ["nationality", "País"],
  ["gender", "Género"],
  ["weight", "Peso"],
  ["height", "Tamaño"],
  ["worldChampion", "Campeonatos"],
  ["rumble", "Royal Rumble"],
  ["hof", "Hall of Fame"]
];

function StatusCell({ item, revealDelay = 0 }) {
  const revealStyle = {
    animationDelay: `${revealDelay}ms`
  };

  if (!item) {
    return (
      <div
        className="cell empty reveal-cell"
        style={revealStyle}
      >
        —
      </div>
    );
  }

  return (
    <div
      className={`cell ${item.status} reveal-cell`}
      style={revealStyle}
    >
      <span>{item.value}</span>

      <b>
        {item.status === "correct"
          ? "✓"
          : item.status === "near"
            ? "≈"
            : "×"}
      </b>
    </div>
  );
}

function saveSession(data) {
  localStorage.setItem(
    "adivina-versus-session",
    JSON.stringify(data)
  );
}

function readSession() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "adivina-versus-session"
      ) || "null"
    );
  } catch {
    return null;
  }
}

export default function Game() {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("home");
  const [joinCode, setJoinCode] = useState("");

  const [hydrated, setHydrated] = useState(false);
  const [hasSavedSession, setHasSavedSession] =
    useState(false);

  const [playerName, setPlayerName] =
    useState("");

  const [room, setRoom] = useState(null);

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);

  const [selected, setSelected] =
    useState(null);

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [screenLoading, setScreenLoading] = 
    useState(false);

  const [error, setError] =
    useState("");

  const myTurn =
    room?.turnPlayer ===
    session?.playerNo;

  const choosing =
    room?.status === "waiting";

  const finished =
    room?.status === "finished";

  const me =
    room?.players?.find(
      (p) =>
        p.playerNo ===
        session?.playerNo
    );

  const opponent =
    room?.players?.find(
      (p) =>
        p.playerNo !==
        session?.playerNo
    );


  const refreshRoom = useCallback(async () => {
    if (!session) return;

    try {
      const r = await fetch(
        `/api/rooms/${session.code}?token=${encodeURIComponent(
          session.token
        )}`,
        { cache: "no-store" }
      );

      const j = await r.json();

      if (!r.ok) {
        throw new Error(
          j.error || "No se pudo obtener la partida."
        );
      }

      setRoom((current) => {
        // No volver a renderizar toda la partida
        // si la respuesta no contiene cambios.
        if (JSON.stringify(current) === JSON.stringify(j)) {
          return current;
        }

        return j;
      });
      setScreenLoading(false);
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        setScreenLoading(false);

      }
    }
  }, [session]);


  useEffect(() => {
    const s = readSession();

    setHasSavedSession(Boolean(s));

    if (s) {
      setPlayerName(
        s.playerName || ""
      );
    }

    setHydrated(true);
  }, []);


  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let timeoutId;

    async function pollRoom() {
      if (cancelled) return;

      await refreshRoom();

      // Esperar a que termine la consulta antes
      // de programar la siguiente.
      if (!cancelled) {
        timeoutId = setTimeout(pollRoom, 2000);
      }
    }

    pollRoom();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [session, refreshRoom]);


  /*
   * BUSCADOR DE LUCHADORES
   */
  useEffect(() => {
    if (
      !session ||
      query.trim().length < 2 ||
      selected
    ) {
      setOptions([]);
      return;
    }

    const controller =
      new AbortController();

    const timer = setTimeout(
      async () => {
        try {
          const r = await fetch(
            `/api/wrestlers?q=${encodeURIComponent(
              query.trim()
            )}`,
            {
              signal:
                controller.signal
            }
          );

          const j =
            await r.json();

          setOptions(
            j.wrestlers || []
          );
        } catch {
          // Ignoramos errores de abort
          // o búsqueda cancelada.
        }
      },
      180
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    query,
    session,
    selected
  ]);

  /*
   * CREAR PARTIDA
   */
  async function createRoom() {
    if (
      playerName.trim().length < 2
    ) {
      setError(
        "Ingresa tu nombre antes de crear la partida."
      );

      return;
    }

    setLoading(true);
    setScreenLoading(true);
    setError("");
    setMessage("");

    try {
      const r =
        await fetch(
          "/api/rooms",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              playerName:
                playerName.trim()
            })
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
          "No se pudo crear la partida."
        );
      }

      const s = {
        code: j.game.code,
        playerNo:
          j.player.player_no,
        token: j.player.token,
        playerName:
          j.player.name
      };

      saveSession(s);

      setSession(s);
      setMode("room");

    } catch (e) {
      console.error(
        "Error creando partida:",
        e
      );

      setError(e.message);
      setScreenLoading(false);

    } finally {
      setLoading(false);
    }
  }

  /*
   * UNIRSE A PARTIDA
   */
  async function joinRoom() {
    if (
      playerName.trim().length < 2
    ) {
      setError(
        "Ingresa tu nombre antes de unirte."
      );

      return;
    }

    if (
      joinCode.trim().length !== 6
    ) {
      setError(
        "Ingresa un código de partida válido."
      );

      return;
    }

    setLoading(true);
    setScreenLoading(true);
    setError("");
    setMessage("");

    try {
      const r =
        await fetch(
          "/api/rooms/join",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              code: joinCode
                .trim()
                .toUpperCase(),

              playerName:
                playerName.trim()
            })
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
          "No se pudo unir a la partida."
        );
      }

      const s = {
        code: j.game.code,
        playerNo:
          j.player.player_no,
        token: j.player.token,
        playerName:
          j.player.name
      };

      saveSession(s);

      setSession(s);
      setMode("room");

    } catch (e) {
      console.error(
        "Error uniéndose a partida:",
        e
      );
      setScreenLoading(false);

      setError(e.message);

    } finally {
      setLoading(false);
    }
  }

  /*
   * ACCIONES DE PARTIDA
   *
   * select = seleccionar secreto
   * guess  = realizar intento
   */
  async function sendAction(
    action,
    wrestlerId
  ) {
    if (!session) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const r =
        await fetch(
          `/api/rooms/${session.code}`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              token: session.token,
              action,
              wrestlerId
            })
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
          "No se pudo ejecutar la acción."
        );
      }

      setSelected(null);
      setQuery("");
      setOptions([]);

      if (action === "guess") {
        setMessage(
          j.won
            ? `🎉 ¡${me?.name ||
            `Jugador ${session.playerNo}`
            } ganó!`
            : `Turno enviado. Ahora juega ${opponent?.name ||
            "el rival"
            }.`
        );
      }

      await refreshRoom();

    } catch (e) {
      setError(e.message);

    } finally {
      setLoading(false);
    }
  }

  /*
   * REVANCHA
   */
  async function rematch() {
    if (!session) return;

    setLoading(true);
    setScreenLoading(true);
    setError("");
    setMessage("");

    try {
      const r =
        await fetch(
          `/api/rooms/${session.code}`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              token: session.token,
              action: "rematch"
            })
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
          "No se pudo iniciar la revancha."
        );
      }

      setSelected(null);
      setQuery("");
      setOptions([]);
      setMessage("");

      await refreshRoom();

    } catch (e) {
      setError(e.message);
      setScreenLoading(false);

    } finally {
      setLoading(false);
    }
  }

  const guesses = useMemo(
    () => room?.guesses ?? [],
    [room]
  );

  const img = (w) =>
    w?.image_url ||
    w?.local_image ||
    "/wrestlers/default.svg";

  function choose(w) {
    setSelected(w);
    setQuery("");
    setOptions([]);
  }

  /*
   * PANTALLA INICIAL
   */
  if (
    !hydrated ||
    !session ||
    mode === "home"
  ) {
    return (
      <main className="page home-page">
      {screenLoading && <LoadingScreen />}

        <section className="hero">

          <div className="eyebrow">
              VERSUS
          </div>

          <h1>
            ADIVINA EL LUCHADOR
          </h1>
           
           <RulesTooltip />

        </section>

        <section className="home-card">

          <label className="field-label">
            TU NOMBRE
          </label>

          <input
            className="name-input"
            value={playerName}
            onChange={(e) =>
              setPlayerName(
                e.target.value.slice(
                  0,
                  24
                )
              )
            }
            placeholder="Agrega tu Nombre"
            maxLength={24}
          />

          <button
            className="primary big"
            onClick={createRoom}
            disabled={loading}
          >
            {loading
              ? "CREANDO..."
              : "CREAR PARTIDA"}
          </button>

          <div className="or">
            O
          </div>

          <div className="join-row">

            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value
                    .toUpperCase()
                )
              }
              maxLength={6}
              placeholder="CÓDIGO"
            />

            <button
              className="secondary"
              onClick={joinRoom}
              disabled={
                loading ||
                joinCode.length !== 6
              }
            >
              UNIRSE
            </button>

          </div>

          {hasSavedSession && (
            <button
              className="resume-button"
              onClick={() => {
                const s =
                  readSession();

                if (!s) return;

                setSession(s);
                setMode("room");
                setError("");
              }}
            >
              CONTINUAR PARTIDA ANTERIOR
            </button>
          )}

          {error && (
            <div className="message error">
              {error}
            </div>
          )}

          <a className="hot-back-link" href="/">Volver a seleccionar juego</a>

        </section>

      </main>
    );
  }

  /*
   * PANTALLA DE PARTIDA
   */
  return (
    <main className="page">
    {screenLoading && <LoadingScreen />}

      <section className="hero compact">

        <div className="eyebrow">
          SALA {session.code}
        </div>

        <h1>
          ADIVINA EL LUCHADOR
        </h1>

        <p>
          {me?.name ||
            session.playerName}

          {" · "}

          {opponent
            ? `Rival: ${opponent.name}`
            : "Esperando al rival..."}
        </p>

        <div className="room-actions">

          <button
            className="secondary"
            onClick={() => {
              localStorage.removeItem(
                "adivina-versus-session"
              );

              setSession(null);
              setRoom(null);
              setMode("home");
              setMessage("");
              setError("");
              setQuery("");
              setSelected(null);
              window.location.href = "/";
            }}
          >
            VOLVER AL MENÚ DE JUEGOS
          </button>

        </div>

      </section>

      <section className="scoreboard">

        <div className="score-player">

          <span>
            {
              room?.players?.find(
                (p) =>
                  p.playerNo === 1
              )?.name ||
              "Jugador 1"
            }
          </span>

          <strong>
            {room?.player1Wins || 0}
          </strong>

          <small>
            VICTORIAS
          </small>

        </div>

        <div className="score-center">

          <span>
            PARTIDA
          </span>

          <strong>
            #{room?.roundNumber || 1}
          </strong>

        </div>

        <div className="score-player">

          <span>
            {
              room?.players?.find(
                (p) =>
                  p.playerNo === 2
              )?.name ||
              "Jugador 2"
            }
          </span>

          <strong>
            {room?.player2Wins || 0}
          </strong>

          <small>
            VICTORIAS
          </small>

        </div>

      </section>

      <section className="versus-card">

        <PlayerBox
          player={me}
          secret={room?.mySecret}
          active={myTurn}
          own
        />

        <div className="versus">
          VS
        </div>

        <PlayerBox
          player={opponent}
          active={Boolean(
            opponent &&
            room?.turnPlayer !==
            session?.playerNo
          )}
        />

      </section>

      {choosing &&
        !room?.mySecret && (
          <section className="game-card selection-card">

            <h2>
              Escoge tu luchador secreto
            </h2>

            <p>
              Tu rival verá que estás
              listo, pero nunca verá
              tu selección.
            </p>

            <GuessSearch
              query={query}
              setQuery={setQuery}
              options={options}
              choose={choose}
              disabled={false}
              img={img}
              selected={selected}
            />

            <button
              className="primary"
              disabled={
                !selected ||
                loading
              }
              onClick={() =>
                sendAction(
                  "select",
                  selected.id
                )
              }
            >
              {loading
                ? "GUARDANDO..."
                : "ELEGIR LUCHADOR"}
            </button>

            {selected && (
              <div
                className="selected-preview"
                style={{ position: "relative" }}
              >
                <button
                  type="button"
                  aria-label="Quitar luchador seleccionado"
                  title="Quitar selección"
                  disabled={loading}
                  onClick={() => {
                    setSelected(null);
                    setQuery("");
                    setOptions([]);
                  }}
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    width: "30px",
                    height: "30px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    borderRadius: "50%",
                    background: "#dc2626",
                    color: "#ffffff",
                    fontSize: "20px",
                    fontWeight: "700",
                    lineHeight: 1,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.5 : 1,
                    zIndex: 1,
                  }}
                >
                  ×
                </button>

                <img
                  src={img(selected)}
                  alt={selected.name}
                  className="wrestler-image"
                />

                <div>
                  <strong>
                    {selected.name}
                  </strong>

                  <small>
                    Tu selección secreta
                  </small>
                </div>
              </div>
            )}
          </section>
        )}

      {choosing &&
        room?.mySecret && (
          <section className="waiting-box">

            <div className="spinner-dot" />

            {opponent
              ? `Esperando que ${opponent.name} elija su luchador...`
              : "Comparte el código de sala con tu rival."}

            <strong>
              {session.code}
            </strong>

          </section>
        )}

      {!choosing &&
        !finished && (
          <section className="game-card">

            <div
              className={`turn-banner ${myTurn
                ? "my-turn"
                : "opponent-turn"
                }`}
            >
              {myTurn
                ? `🔥 ES TU TURNO, ${me?.name ||
                "JUGADOR"
                }`
                : `⏳ TURNO DE ${opponent?.name ||
                "TU RIVAL"
                }`}
            </div>

            <GuessSearch
              query={query}
              setQuery={setQuery}
              options={options}
              choose={choose}
              disabled={
                !myTurn ||
                loading
              }
              img={img}
              selected={selected}
            />

            <button
              className="primary guess-submit"
              disabled={
                !selected ||
                !myTurn ||
                loading
              }
              onClick={() =>
                sendAction(
                  "guess",
                  selected.id
                )
              }
            >
              {loading
                ? "COMPROBANDO..."
                : "ADIVINAR"}
            </button>

            {message && (
              <div className="message success">
                {message}
              </div>
            )}

            <div className="players-attempts">

              {[1, 2].map(
                (playerNo) => {

                  const player =
                    room?.players?.find(
                      (p) =>
                        p.playerNo ===
                        playerNo
                    );

                  const playerGuesses =
                    guesses.filter(
                      (row) =>
                        row.playerNo ===
                        playerNo
                    );

                  const isActive =
                    room?.turnPlayer ===
                    playerNo &&
                    !finished;

                  return (
                    <div
                      className={`player-attempts ${isActive
                        ? "active-player"
                        : ""
                        }`}
                      key={playerNo}
                    >

                      <div className="player-attempts-header">

                        <div>

                          <strong>
                            {player?.name ||
                              `Jugador ${playerNo}`}
                          </strong>

                          <span>
                            {isActive
                              ? "🔥 TU TURNO"
                              : player
                                ? "⏳ ESPERANDO"
                                : "ESPERANDO JUGADOR"}
                          </span>

                        </div>

                      </div>

                      <div className="player-attempts-list">

                        <div className="guess-grid guess-header">

                          <div className="header-cell wrestler-header">
                            LUCHADOR
                          </div>

                          {columns.map(
                            ([key, label]) => (
                              <div
                                className="header-cell"
                                key={key}
                              >
                                {label}
                              </div>
                            )
                          )}

                        </div>

                        {playerGuesses.map(
                          (row) => (

                            <div
                              className="guess-grid guess-row"
                              key={row.id}
                            >

                              <div className="name-cell">

                                <SafeImage
                                  src={
                                    row.image_url
                                  }
                                  fallback={
                                    row.local_image ||
                                    "/wrestlers/default.svg"
                                  }
                                    className="wrestler-image"

                                />

                                <span>
                                  {row.name}
                                </span>

                              </div>

                              {columns.map(
                                ([key], index) => (

                                  <StatusCell
                                    item={
                                      row.result?.[
                                      key
                                      ]
                                    }
                                    key={key}
                                    revealDelay={index * 130}
                                  />

                                )
                              )}

                            </div>

                          )
                        )}

                        {playerGuesses.length ===
                          0 && (

                            <div className="empty-state">
                              Aún no hay intentos.
                            </div>

                          )}

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          </section>
        )}

      {finished && (
        <section className="winner-card">

          <div className="trophy">
            🏆
          </div>

          <h2>
            ¡PARTIDA TERMINADA!
          </h2>

          <p>
            Ganó{" "}
            <strong>
              {
                room.players?.find(
                  (p) =>
                    p.playerNo ===
                    room.winnerPlayer
                )?.name ||
                `Jugador ${room.winnerPlayer}`
              }
            </strong>
          </p>

          <div className="final-score">

            <div>

              <span>
                {
                  room.players?.find(
                    (p) =>
                      p.playerNo === 1
                  )?.name ||
                  "Jugador 1"
                }
              </span>

              <strong>
                {room.player1Wins || 0}
              </strong>

            </div>

            <div className="score-separator">
              -
            </div>

            <div>

              <span>
                {
                  room.players?.find(
                    (p) =>
                      p.playerNo === 2
                  )?.name ||
                  "Jugador 2"
                }
              </span>

              <strong>
                {room.player2Wins || 0}
              </strong>

            </div>

          </div>

          <div className="final-secrets">

            <SecretCard
              title={me?.name}
              wrestler={room?.mySecret}
            />

            <SecretCard
              title={opponent?.name}
              wrestler={
                room?.opponentSecret
              }
            />

          </div>

          <button
            className="primary rematch-button"
            onClick={rematch}
            disabled={loading}
          >
            {loading
              ? "INICIANDO..."
              : "🔄 VOLVER A JUGAR"}
          </button>

        </section>
      )}

      {error && (
        <div className="message error">
          {error}
        </div>
      )}

      <footer>
        Fan-made. No afiliado a WWE,
        AEW ni otras promociones.
      </footer>

    </main>
  );
}

/*
 * IMAGEN SEGURA
 */
function SafeImage({
  src,
  fallback,
  alt = "",
  className ="wrestler-image"
}) {
  const [url, setUrl] =
    useState(
      src || fallback
    );

  useEffect(
    () => {
      setUrl(
        src || fallback
      );
    },
    [src, fallback]
  );

  return (
    <img
      className={className}
      src={url}
      alt={alt}
      
      onError={() =>
        setUrl(fallback)
      }
    />
  );
}

/*
 * CAJA DE JUGADOR
 */
function PlayerBox({
  player,
  secret,
  active,
  own
}) {
  return (
    <div
      className={`player-box ${active ? "active" : ""
        }`}
    >

      <span>
        {player?.name ||
          "Esperando jugador..."}
      </span>

      {secret ? (
        <>

          <SafeImage
            className="secret-thumb"
            src={secret.image_url}
            fallback={
              secret.local_image ||
              "/wrestlers/default.svg"
            }
            
          />

          <strong>
            {secret.name}
          </strong>

          <small>
            🔒{" "}
            {own
              ? "Tu luchador secreto"
              : "Luchador secreto"}
          </small>

        </>
      ) : (

        <>

          <div className="unknown-avatar">
            ?
          </div>

          <strong>
            {player
              ? "Luchador oculto"
              : "Esperando..."}
          </strong>

          <small>
            {player
              ? player.ready
                ? "Listo"
                : "Escogiendo..."
              : "Comparte el código"}
          </small>

        </>
      )}

    </div>
  );
}

/*
 * CARTA DEL LUCHADOR SECRETO
 */
function SecretCard({
  title,
  wrestler
}) {
  return (
    <div className="secret-card">

      <small>
        {title || "Rival"}
      </small>

      {wrestler ? (

        <>

          <SafeImage
            src={
              wrestler.image_url
            }
            fallback={
              wrestler.local_image ||
              "/wrestlers/default.svg"
            }
            className="wrestler-image"
          />

          <strong>
            {wrestler.name}
          </strong>

        </>

      ) : (

        <div className="unknown-avatar">
          ?
        </div>

      )}

    </div>
  );
}

/*
 * BUSCADOR DE LUCHADORES
 */
function GuessSearch({
  query,
  setQuery,
  options,
  choose,
  disabled,
  selected
}) {
  return (
    <div className="search-box">

      <div className="input-wrap">

        <input
          value={query}
          onChange={(e) =>
            setQuery(
              e.target.value
            )
          }
          placeholder="Escribe el nombre de un luchador..."
          autoComplete="off"
          disabled={disabled}
        />

        {!selected &&
          options.length > 0 && (

            <div className="suggestions">

              {options.map(
                (w) => (

                  <button
                    type="button"
                    key={w.id}
                    onClick={() =>
                      choose(w)
                    }
                  >

                    <SafeImage
                      src={
                        w.image_url
                      }
                      fallback={
                        w.local_image ||
                        "/wrestlers/default.svg"
                      }
                      className="wrestler-image"
                    />

                    <span>
                      {w.name}
                    </span>

                    <small>
                      {w.primary_promotion ||
                        "Wrestling"}
                    </small>

                  </button>

                )
              )}

            </div>
          )}

      </div>

    </div>
  );
}

function LoadingScreen() {
  return (
    <div
      className="game-loading-overlay"
      role="status"
      aria-live="polite"
    >
      <div className="game-loading-content">
        <div className="game-loading-spinner" />

        <h2>PREPARANDO LA PARTIDA</h2>

        <p>
          Estamos buscando a los luchadores...
        </p>

        <div className="game-loading-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function RulesTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rules-tooltip">
      <button
        type="button"
        className="rules-tooltip-trigger"
        aria-label="Ver reglas del juego"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        ?
      </button>

      {open && (
        <div
          className="rules-tooltip-content"
          role="dialog"
          aria-label="Reglas del juego"
        >
          <strong>¿Cómo se juega?</strong>

          <p>
            <b>1. Elige tu luchador.</b>
            Cada jugador selecciona en secreto un luchador.
          </p>

          <p>
            <b>2. Adivina al rival.</b>
            En tu turno, busca un luchador e intenta descubrir
            la elección secreta de tu oponente.
          </p>

          <p>
            <b>3. Interpreta las pistas.</b>
            ✓ Coincide · ≈ Coincide parcialmente · × No coincide.
          </p>

          <p>
            <b>4. Respeta los turnos.</b>
            Si no aciertas, el turno pasa al otro jugador.
          </p>

          <p>
            <b>5. Gana la partida.</b>
            El primero que adivine el luchador secreto rival gana.
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

