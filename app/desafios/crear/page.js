
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function CrearDesafioPage() {
  const [creatorName, setCreatorName] = useState("");
  const [format, setFormat] = useState("secret_wrestler");
  const [title, setTitle] = useState("Adivina el luchador");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);

  const [selected, setSelected] = useState(null);
  const [selectedWrestlers, setSelectedWrestlers] = useState([]);
  const [impostor, setImpostor] = useState(null);
  const [impostorReason, setImpostorReason] = useState("");

  const [clues, setClues] = useState([""]);

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const isImpostor = format === "impostor";

  // Buscar luchadores
  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      setSearching(true);

      try {
        const response = await fetch(
          `/api/wrestlers?q=${encodeURIComponent(search)}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (response.ok) {
          setResults(data.wrestlers ?? []);
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
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search]);

  function changeFormat(value) {
    setFormat(value);
    setError("");
    setSearch("");
    setResults([]);
    setSelected(null);
    setSelectedWrestlers([]);
    setImpostor(null);
    setImpostorReason("");
    setClues([""]);

    setTitle(
      value === "impostor"
        ? "Encuentra al impostor"
        : "Adivina el luchador"
    );
  }

  function selectWrestler(wrestler) {
    if (isImpostor) {
      if (selectedWrestlers.some((item) => item.id === wrestler.id)) {
        return;
      }

      if (selectedWrestlers.length >= 4) {
        return;
      }

      setSelectedWrestlers((current) => [...current, wrestler]);
    } else {
      setSelected(wrestler);
    }

    setSearch("");
    setResults([]);
  }

  function removeWrestler(wrestlerId) {
    setSelectedWrestlers((current) =>
      current.filter((wrestler) => wrestler.id !== wrestlerId)
    );

    if (impostor?.id === wrestlerId) {
      setImpostor(null);
    }
  }

  function updateClue(index, value) {
    setClues((current) =>
      current.map((clue, i) => (i === index ? value : clue))
    );
  }

  function addClue() {
    if (clues.length < 10) {
      setClues((current) => [...current, ""]);
    }
  }

  function removeClue(index) {
    setClues((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  async function createChallenge(event) {
    event.preventDefault();
    setError("");

    if (!creatorName.trim()) {
      setError("Ingresa tu nombre.");
      return;
    }

    if (!title.trim()) {
      setError("Ingresa un título para el desafío.");
      return;
    }

    let items = [];
    let settings = {};
    let instructions = "";

    if (isImpostor) {
      if (selectedWrestlers.length !== 4) {
        setError("Debes seleccionar exactamente cuatro luchadores.");
        return;
      }

      if (!impostor) {
        setError("Debes marcar cuál de los cuatro luchadores es el impostor.");
        return;
      }

      if (!impostorReason.trim()) {
        setError("Escribe la razón por la que ese luchador es el impostor.");
        return;
      }

      items = selectedWrestlers.map((wrestler, index) => ({
        wrestler_id: wrestler.id,
        position: index + 1,
      }));

      settings = {
        impostor_position:
          selectedWrestlers.findIndex(
            (wrestler) => wrestler.id === impostor.id
          ) + 1,
        impostor_reason: impostorReason.trim(),
      };

      instructions =
        "Encuentra cuál de los cuatro luchadores es el impostor.";
    } else {
      const validClues = clues
        .map((clue) => clue.trim())
        .filter(Boolean);

      if (!selected) {
        setError("Debes seleccionar un luchador secreto.");
        return;
      }

      if (validClues.length === 0) {
        setError("Agrega al menos una pista.");
        return;
      }

      items = [
        {
          wrestler_id: selected.id,
          position: 1,
        },
      ];

      settings = {};

      instructions =
        "Descubre quién es el luchador secreto utilizando las pistas.";
    }

    setLoading(true);

    try {
      const response = await fetch("/api/desafios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creator_name: creatorName.trim(),
          format,
          title: title.trim(),
          instructions,
          settings,
          items,
          clues: isImpostor
            ? []
            : clues.map((clue) => clue.trim()).filter(Boolean),
        }),
      });

      const data = await response.json();

     if (!response.ok) {
  throw new Error(data.error || "No se pudo crear el desafío.");
}

// Guardar el acceso privado del creador
sessionStorage.setItem(
  `desafio-creador-${data.challenge.code}`,
  data.creator_token
);

setCreated(data.challenge);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function WrestlerImage({ wrestler, size = 65 }) {
    const fallback = "/wrestlers/default.svg";

    return (
      <img
        src={wrestler.local_image || fallback}
        alt={wrestler.name}
        width={size}
        height={size}
        style={{
          objectFit: "contain",
          borderRadius: 8,
          flexShrink: 0,
        }}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = fallback;
        }}
      />
    );
  }

  if (created) {
    return (
      <main className="page">
        <section className="hero">
          <div className="eyebrow">ESTO ES LUCHA</div>
          <h1>¡DESAFÍO CREADO!</h1>
          <p>Tu desafío está listo para compartir.</p>
        </section>

        <section className="game-mode-grid">
          <article className="game-mode-card">
            <div className="game-mode-tag">CÓDIGO DE INVITACIÓN</div>

            <h2>{created.code}</h2>
            <p>{created.title}</p>

            <button
              type="button"
              className="game-mode-cta"
              onClick={() =>
                navigator.clipboard.writeText(created.code)
              }
            >
              COPIAR CÓDIGO →
            </button>

            <p>
              Comparte este código con la persona que quieras desafiar.
            </p>

            <hr />

            <div className="game-mode-tag">
              PANEL DEL CREADOR
            </div>

            <p>
              Puedes observar en tiempo real cómo el participante
              responde tu desafío.
            </p>

            <Link
              href={`/desafios/observar/${created.code}`}
              className="game-mode-cta"
            >
              OBSERVAR DESAFÍO →
            </Link>

            <Link
              href="/desafios"
              className="game-mode-cta"
            >
              VOLVER A DESAFÍOS →
            </Link>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="eyebrow">ESTO ES LUCHA</div>
        <h1>CREAR DESAFÍO</h1>
        <p>Prepara un reto y desafía a otro fan de la lucha libre.</p>
      </section>

      <form
        onSubmit={createChallenge}
        className="game-mode-card"
        style={{ maxWidth: 700, margin: "0 auto" }}
      >
        <div className="game-mode-tag">CONFIGURACIÓN DEL DESAFÍO</div>

        <label>
          Tu nombre
          <input
            type="text"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="Escribe tu nombre"
            maxLength={40}
            required
          />
        </label>

        <label>
          Tipo de desafío
          <select
            value={format}
            onChange={(e) => changeFormat(e.target.value)}
          >
            <option value="secret_wrestler">Luchador secreto</option>
            <option value="impostor">El Impostor</option>
          </select>
        </label>

        <label>
          Título del desafío
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </label>

        <hr />

        {isImpostor ? (
          <>
            <div className="game-mode-tag">FORMATO: EL IMPOSTOR</div>

            <h2>Selecciona cuatro luchadores</h2>
            <p>
              Busca y agrega los cuatro luchadores que aparecerán
              en el desafío.
            </p>

            <div className="search-box">
              <div className="input-wrap">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar luchador..."
                  autoComplete="off"
                  disabled={selectedWrestlers.length === 4}
                />

                {results.length > 0 && (
                  <div className="suggestions">
                    {results.map((wrestler) => {
                      const alreadySelected = selectedWrestlers.some(
                        (item) => item.id === wrestler.id
                      );

                      return (
                        <button
                          type="button"
                          key={wrestler.id}
                          disabled={alreadySelected}
                          onClick={() => selectWrestler(wrestler)}
                        >
                          <WrestlerImage wrestler={wrestler} />
                          <span>{wrestler.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {search.trim().length >= 2 && searching && (
              <p>Buscando luchadores...</p>
            )}

            {search.trim().length >= 2 &&
              !searching &&
              results.length === 0 && (
                <p>No se encontraron luchadores.</p>
              )}

            <div style={{ marginTop: 20 }}>
              <p>
                <strong>
                  Luchadores seleccionados: {selectedWrestlers.length}/4
                </strong>
              </p>

              {selectedWrestlers.map((wrestler, index) => (
                <div
                  key={wrestler.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    marginBottom: 10,
                    border: "1px solid var(--border-color, #444)",
                    borderRadius: 10,
                  }}
                >
                  <WrestlerImage wrestler={wrestler} />

                  <div style={{ flex: 1 }}>
                    <strong>{wrestler.name}</strong>
                    <p style={{ margin: "4px 0" }}>
                      Luchador {index + 1}
                    </p>

                    {impostor?.id === wrestler.id && (
                      <span style={{ color: "#e6a23c" }}>
                        Impostor seleccionado
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className={
                      impostor?.id === wrestler.id
                        ? "primary"
                        : "secondary"
                    }
                    onClick={() => setImpostor(wrestler)}
                  >
                    {impostor?.id === wrestler.id
                      ? "IMPOSTOR"
                      : "Marcar impostor"}
                  </button>

                  <button
                    type="button"
                    className="error-button"
                    onClick={() => removeWrestler(wrestler.id)}
                    aria-label={`Quitar ${wrestler.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {selectedWrestlers.length === 4 && (
              <>
                <hr />

                <h2>¿Por qué es el impostor?</h2>
                <p>
                  Selecciona al impostor entre los cuatro luchadores
                  y explica libremente por qué es diferente.
                </p>

                {impostor && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <WrestlerImage wrestler={impostor} size={80} />
                    <div>
                      <strong>{impostor.name}</strong>
                      <p>Es el impostor elegido.</p>
                    </div>
                  </div>
                )}

                <label>
                  Explicación
                  <textarea
                    value={impostorReason}
                    onChange={(e) => setImpostorReason(e.target.value)}
                    placeholder="Ejemplo: Es el único de los cuatro que nunca ganó un campeonato mundial..."
                    maxLength={500}
                    rows={4}
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <>
            <h2>Selecciona el luchador secreto</h2>

            {!selected && (
              <div className="search-box">
                <div className="input-wrap">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar luchador..."
                    autoComplete="off"
                  />

                  {results.length > 0 && (
                    <div className="suggestions">
                      {results.map((wrestler) => (
                        <button
                          type="button"
                          key={wrestler.id}
                          onClick={() => selectWrestler(wrestler)}
                        >
                          <WrestlerImage wrestler={wrestler} />
                          <span>{wrestler.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {search.trim().length >= 2 && searching && !selected && (
              <p>Buscando luchadores...</p>
            )}

            {selected && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 16,
                }}
              >
                <WrestlerImage wrestler={selected} size={90} />

                <div>
                  <strong>{selected.name}</strong>
                  <p>Luchador secreto seleccionado</p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSelected(null)}
                  >
                    Cambiar luchador
                  </button>
                </div>
              </div>
            )}

            <hr />

            <h2>Agrega las pistas</h2>
            <p>
              Escribe pistas que ayuden al participante a descubrir
              al luchador.
            </p>

            {clues.map((clue, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 10,
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  value={clue}
                  onChange={(e) => updateClue(index, e.target.value)}
                  placeholder={`Pista ${index + 1}`}
                  maxLength={300}
                />

                {clues.length > 1 && (
                  <button
                    type="button"
                    className="error-button"
                    onClick={() => removeClue(index)}
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}

            {clues.length < 10 && (
              <button
                className="secondary"
                type="button"
                onClick={addClue}
              >
                + Agregar otra pista
              </button>
            )}
          </>
        )}

        {error && (
          <p role="alert" style={{ color: "red" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="primary"
          disabled={loading}
          style={{ marginTop: 24 }}
        >
          {loading
            ? "CREANDO DESAFÍO..."
            : "CREAR Y GENERAR CÓDIGO →"}
        </button>
      </form>
    </main>
  );
}
