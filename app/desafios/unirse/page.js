
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      // Consultar el desafío
      const response = await fetch(
        `/api/desafios/${encodeURIComponent(normalizedCode)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se encontró el desafío.");
      }

      const challenge = data.challenge;

      if (challenge.status !== "waiting") {
        throw new Error("Este desafío ya no está disponible.");
      }

      // Nuevo formato: registrar al adversario en el servidor.
      if (challenge.format === "yes_no_questions") {
        const joinResponse = await fetch(
          `/api/desafios/${encodeURIComponent(normalizedCode)}/unirse`,
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
            joinData.error || "No fue posible ingresar al desafío."
          );
        }

        sessionStorage.setItem(
          `desafio-${normalizedCode}`,
          JSON.stringify({
            playerName: normalizedName,
            role: "opponent",
          })
        );

        sessionStorage.setItem(
          `desafio-adversario-${normalizedCode}`,
          joinData.opponent_token
        );

        router.push(
          `/desafios/jugar/${encodeURIComponent(normalizedCode)}`
        );

        return;
      }

      // Mantener el comportamiento de los formatos anteriores.
      sessionStorage.setItem(
        `desafio-${normalizedCode}`,
        JSON.stringify({
          playerName: normalizedName,
        })
      );

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
        <p>Introduce el código que te compartieron y acepta el reto.</p>
      </section>

      <form
        onSubmit={joinChallenge}
        className="game-mode-card"
        style={{ maxWidth: 520, margin: "0 auto" }}
      >
        <div className="game-mode-tag">ENTRAR A UNA SALA</div>

        <label>
          Tu nombre
          <input
            type="text"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="¿Cómo te llamas?"
            maxLength={40}
            required
          />
        </label>

        <label>
          Código del desafío
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
            placeholder="Ej: 19B6FF"
            maxLength={6}
            required
            style={{
              textTransform: "uppercase",
              letterSpacing: 5,
              fontWeight: "bold",
            }}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: "red" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="game-mode-cta"
          disabled={loading}
        >
          {loading ? "BUSCANDO DESAFÍO..." : "CONTINUAR →"}
        </button>

        <p>
          <Link href="/desafios">Volver a desafíos</Link>
        </p>
      </form>
    </main>
  );
}
