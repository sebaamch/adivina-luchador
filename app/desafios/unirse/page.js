
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnirseDesafioPage() {
    const router = useRouter();

    const [code, setCode] = useState("");
    const [playerName, setPlayerName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function joinChallenge(event) {
        event.preventDefault();
        setError("");

        const normalizedCode = code.trim().toUpperCase();
        const normalizedName = playerName.trim();

        if (normalizedCode.length !== 6) {
            setError("El código debe tener 6 caracteres.");
            return;
        }

        if (!normalizedName) {
            setError("Ingresa tu nombre para continuar.");
            return;
        }

        setLoading(true);

        try {
            // Consultar el desafío.
            const response = await fetch(
                `/api/desafios/${encodeURIComponent(normalizedCode)}`,
                { cache: "no-store" }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No se encontró el desafío."
                );
            }

            if (data.challenge.status !== "waiting") {
                throw new Error(
                    "Este desafío ya no está disponible."
                );
            }

            const format = data.challenge.format;

            // Los formatos que necesitan token de adversario.
            const requiresOpponentToken = [
                "yes_no_questions",
                "what_would_you_choose",
            ].includes(format);

            let opponentToken = null;

            // Registrar al adversario en la base de datos.
            if (requiresOpponentToken) {
                const joinResponse = await fetch(
                    `/api/desafios/${encodeURIComponent(normalizedCode)}/ingresar`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            player_name: normalizedName,
                        }),
                    }
                );

                const joinData = await joinResponse.json();

                if (!joinResponse.ok) {
                    throw new Error(
                        joinData.error ||
                        "No fue posible ingresar al desafío."
                    );
                }

                if (!joinData.opponent_token) {
                    throw new Error(
                        "No se recibió el token del adversario."
                    );
                }

                opponentToken = joinData.opponent_token;
            }

            // Guardar sesión del participante.
            sessionStorage.setItem(
                `desafio-${normalizedCode}`,
                JSON.stringify({
                    playerName: normalizedName,
                })
            );

            // Guardar token para autenticar al adversario.
            if (opponentToken) {
                sessionStorage.setItem(
                    `desafio-adversario-${normalizedCode}`,
                    opponentToken
                );
            }

            // Ir a la pantalla de juego.
            router.push(
                `/desafios/jugar/${encodeURIComponent(normalizedCode)}`
            );

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="page">
            <section className="hero">
                <div className="eyebrow">ESTO ES LUCHA</div>

                <h1>UNIRSE A UN DESAFÍO</h1>

                <p>
                    Introduce el código que te compartieron y acepta el reto.
                </p>
            </section>

            <form
                onSubmit={joinChallenge}
                className="game-mode-card"
                style={{ maxWidth: 520, margin: "0 auto" }}
            >
                <h3>ENTRAR A UNA SALA</h3>

                <input
                    type="text"
                    value={playerName}
                    onChange={(event) =>
                        setPlayerName(event.target.value)
                    }
                    placeholder="Escribe tu nombre"
                    maxLength={40}
                    required
                />

                <input
                    type="text"
                    value={code}
                    onChange={(event) =>
                        setCode(
                            event.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, "")
                                .slice(0, 6)
                        )
                    }
                    placeholder="Escribe el código"
                    maxLength={6}
                    required
                    style={{
                        textTransform: "uppercase",
                        letterSpacing: 5,
                        fontWeight: "bold",
                    }}
                />

                {error && (
                    <p role="alert" style={{ color: "red" }}>
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    className="primary"
                    disabled={loading}
                >
                    {loading
                        ? "INGRESANDO..."
                        : "CONTINUAR →"}
                </button>

                <button
                    type="button"
                    className="secondary"
                    onClick={() => router.push("/desafios")}
                >
                    VOLVER A DESAFÍOS
                </button>
            </form>
        </main>
    );
}
