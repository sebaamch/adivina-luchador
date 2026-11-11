
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

    const isImpostor = challenge?.format === "impostor";

    // Cargar sesión y desafío.
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
                    throw new Error(
                        data.error || "No fue posible cargar el desafío."
                    );
                }

                if (
                    !["secret_wrestler", "impostor"].includes(
                        data.challenge.format
                    )
                ) {
                    throw new Error(
                        "Este formato todavía no está disponible."
                    );
                }

                if (
                    data.challenge.format === "impostor" &&
                    data.challenge.wrestlers?.length !== 4
                ) {
                    throw new Error(
                        "Este desafío no tiene los cuatro luchadores."
                    );
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

    // Buscador utilizado solamente por Luchador Secreto.
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

    // Comprobar respuesta para ambos formatos.
    async function checkAnswer(wrestler) {
        const answer = wrestler || selected;

        if (!answer) {
            setError("Selecciona un luchador antes de comprobar.");
            return;
        }

        // Solo impedir nuevos intentos si ya acertó.
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

                {/* Botón disponible para ambos formatos */}
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

                {isImpostor ? (
                    <>
                        <div className="game-mode-tag">EL IMPOSTOR</div>

                        <h2>¿QUIÉN ES EL IMPOSTOR?</h2>

                        <p>
                            Observa los cuatro luchadores y selecciona al que crees
                            que es el impostor.
                        </p>

                        <div
                            className="impostor-grid"
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 16,
                                marginTop: 24,
                            }}
                        >
                            {challenge.wrestlers.map((wrestler) => {
                                const isSelected = selected?.id === wrestler.id;

                                const isRevealed =
                                    result?.impostor &&
                                    result.impostor.name === wrestler.name;

                                return (
                                    <button
                                        key={wrestler.id}
                                        type="button"
                                        disabled={checking || Boolean(result)}
                                        onClick={() => checkAnswer(wrestler)}
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
                                            cursor: result ? "default" : "pointer",
                                            opacity:
                                                result && !isRevealed && !isSelected
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
                                            <span style={{ color: "#16a34a" }}>
                                                IMPOSTOR
                                            </span>
                                        )}

                                        {result && isSelected && !result.correct && (
                                            <span style={{ color: "#dc2626" }}>
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

                                            <strong>{result.impostor.name}</strong>
                                        </div>

                                        <h3>¿POR QUÉ ERA EL IMPOSTOR?</h3>
                                        <p>{result.reason}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <h2>LUCHADOR SECRETO</h2>

                        <p>
                            Lee las pistas e intenta descubrir de quién se trata.
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
                                <p>Este desafío no tiene pistas configuradas.</p>
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
                            disabled={!selected || checking || result?.correct}
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
                                    disabled={checking || result?.correct}
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

                                        <strong>{result.wrestler.name}</strong>
                                    </div>
                                )}

                                {!result.correct && (
                                    <p>Puedes intentarlo nuevamente.</p>
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

                                <span>{wrestler.name}</span>

                                <small>
                                    {wrestler.primary_promotion || "Wrestling"}
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
