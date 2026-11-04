
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function CrearDesafioPage() {
  const [creatorName, setCreatorName] = useState("");
  const [title, setTitle] = useState("Adivina el luchador");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [clues, setClues] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (selected || search.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();

    const timeout = setTimeout(async () => {
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
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search, selected]);

  function updateClue(index, value) {
    setClues((current) =>
      current.map((clue, i) => (i === index ? value : clue))
    );
  }

  function addClue() {
    setClues((current) => [...current, ""]);
  }

  function removeClue(index) {
    setClues((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  async function createChallenge(event) {
    event.preventDefault();
    setError("");

    const validClues = clues
      .map((clue) => clue.trim())
      .filter(Boolean);

    if (!creatorName.trim()) {
      setError("Ingresa tu nombre.");
      return;
    }

    if (!selected) {
      setError("Debes seleccionar un luchador secreto.");
      return;
    }

    if (validClues.length === 0) {
      setError("Agrega al menos una pista.");
      return;
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
          format: "secret_wrestler",
          title: title.trim(),
          instructions: "Descubre quién es el luchador secreto utilizando las pistas.",
          settings: {},
          items: [
            {
              wrestler_id: selected.id,
              position: 1,
            },
          ],
          clues: validClues,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear el desafío.");
      }

      setCreated(data.challenge);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
              onClick={() => navigator.clipboard.writeText(created.code)}
            >
              COPIAR CÓDIGO →
            </button>

            <p>Comparte este código con la persona que quieras desafiar.</p>

            <Link href="/desafios" className="game-mode-cta">
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
        <div className="game-mode-tag">FORMATO: LUCHADOR SECRETO</div>

        <label>
          Tu nombre
          <input
            type="text"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="Escriba su nombre"
            maxLength={40}
            required
          />
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

        <h2>Selecciona el luchador secreto</h2>

        {!selected && (
          <>
            <input
              type="closer-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar luchador..."
              autoComplete="off"
            />

            {results.length > 0 && (
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {results.map((wrestler) => (
                  <button
                    type="button"
                    key={wrestler.id}
                    onClick={() => {
                      setSelected(wrestler);
                      setSearch("");
                      setResults([]);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 10,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={wrestler.local_image}
                      alt={wrestler.name}
                      width="55"
                      height="55"
                      style={{ objectFit: "contain" }}
                    />
                    {wrestler.name}
                  </button>
                ))}
              </div>
            )}

            {search.trim().length >= 2 && results.length === 0 && (
              <p>Busca un luchador o espera los resultados...</p>
            )}
          </>
        )}

        {selected && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img
                src={selected.local_image}
                alt={selected.name}
                width="90"
                height="90"
                style={{ objectFit: "contain" }}
              />

              <div>
                <strong>{selected.name}</strong>
                <p>Luchador secreto seleccionado</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                >
                  Cambiar luchador
                </button>
              </div>
            </div>
          </div>
        )}

        <hr />

        <h2>Agrega las pistas</h2>
        <p>Escribe pistas que ayuden al participante a descubrir al luchador.</p>

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

        <button className="secondary" type="button" onClick={addClue}>
          + Agregar otra pista
        </button>

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
          {loading ? "CREANDO DESAFÍO..." : "CREAR Y GENERAR CÓDIGO →"}
        </button>
      </form>
    </main>
  );
}

