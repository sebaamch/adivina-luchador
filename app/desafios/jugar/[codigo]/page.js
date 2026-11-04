
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JugarDesafioPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = String(params.codigo ?? "").toUpperCase();

  const [challenge, setChallenge] = useState(null);
  const [playerName, setPlayerName] = useState("");

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [checking, setChecking] = useState(false);

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Cargar sesión y desafío
  useEffect(() => {
    const savedSession = sessionStorage.getItem(`desafio-${codigo}`);

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

        if (!response.ok) {
          throw new Error(data.error || "No fue posible cargar el desafío.");
        }

        if (data.challenge.format !== "secret_wrestler") {
          throw new Error("Este formato todavía no está disponible para jugar.");
        }

        setChallenge(data.challenge);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (codigo) loadChallenge();
  }, [codigo, router]);

  // Buscador original de luchadores
  useEffect(() => {
    if (
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
          {
            signal: controller.signal,
          }
        );

        const data = await response.json();

        setOptions(data.wrestlers || []);
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
  }, [query, selected, result]);

  // Imagen del luchador
  const img = (w) =>
    w?.image_url ||
    w?.local_image ||
    "/wrestlers/default.svg";

  // Seleccionar luchador
  function choose(wrestler) {
    setSelected(wrestler);
    setQuery(wrestler.name);
    setOptions([]);
    setResult(null);
    setError("");
  }

  // Comprobar respuesta
  async function checkAnswer() {
    if (!selected) {
      setError("Selecciona un luchador antes de comprobar.");
      return;
    }

    setChecking(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `/api/desafios/${codigo}/responder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wrestler_id: selected.id,
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

      setResult(data);

      if (data.correct) {
        setOptions([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  // Cambiar búsqueda
  function handleQueryChange(value) {
    setQuery(value);
    setSelected(null);
    setOptions([]);
    setResult(null);
    setError("");
  }

  // Pantalla de carga
  if (loading) {
    return (
      <main className="page">
        <p>Cargando desafío...</p>
      </main>
    );
  }

  // Error al cargar desafío
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

      {/* ENCABEZADO */}
      <section className="hero compact">

        <div className="eyebrow">
          DESAFÍO {codigo}
        </div>

        <h1>{challenge.title}</h1>

        <p>
          Jugador: {playerName}
        </p>

        {challenge.instructions && (
          <p>{challenge.instructions}</p>
        )}

      </section>

      {/* PISTAS */}
      <section className="game-card selection-card">

        <h2>
          LUCHADOR SECRETO
        </h2>

        <p>
          Lee las pistas e intenta descubrir de quién se trata.
        </p>

        <div className="challenge-clues">

          <h3>PISTAS</h3>

          {challenge.clues?.length > 0 ? (
            <ol>
              {challenge.clues.map((clue, index) => (
                <li key={index}>
                  {clue}
                </li>
              ))}
            </ol>
          ) : (
            <p>
              Este desafío no tiene pistas configuradas.
            </p>
          )}

        </div>

        {/* BUSCADOR ORIGINAL */}
        <h3>
          ¿QUIÉN ES EL LUCHADOR?
        </h3>

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

        {/* BOTÓN COMPROBAR */}
        <button
          className="primary guess-submit"
          disabled={!selected || checking || result?.correct}
          onClick={checkAnswer}
        >
          {checking
            ? "COMPROBANDO..."
            : "COMPROBAR RESPUESTA"}
        </button>

        {/* LUCHADOR SELECCIONADO */}
        {selected && (
          <div
            className="selected-preview"
            style={{ position: "relative" }}
          >

            <button
              type="button"
              aria-label="Quitar luchador seleccionado"
              title="Quitar selección"
              disabled={checking || result?.correct}
              onClick={() => {
                setSelected(null);
                setQuery("");
                setOptions([]);
                setResult(null);
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
                cursor: "pointer",
                zIndex: 1,
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

              <small>
                Luchador seleccionado
              </small>
            </div>

          </div>
        )}

        {/* RESULTADO */}
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

          </div>
        )}

        {/* ERRORES */}
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}

      </section>

      <footer>
        Fan-made. No afiliado a WWE,
        AEW ni otras promociones.
      </footer>

    </main>
  );
}

/*
 * BUSCADOR REUTILIZADO DEL JUEGO VERSUS
 */
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
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
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

                <span>
                  {wrestler.name}
                </span>

                <small>
                  {wrestler.primary_promotion || "Wrestling"}
                </small>

              </button>
            ))}

          </div>
        )}

      </div>

      {searching && (
        <small>Buscando luchadores...</small>
      )}

    </div>
  );
}

/*
 * IMAGEN SEGURA
 */
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
