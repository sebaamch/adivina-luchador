
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

    if (normalizedCode.length !== 6) {
      setError("El código debe tener 6 caracteres.");
      return;
    }

    if (!playerName.trim()) {
      setError("Ingresa tu nombre para continuar.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/desafios/${encodeURIComponent(normalizedCode)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se encontró el desafío.");
      }

      if (data.challenge.status !== "waiting") {
        throw new Error("Este desafío ya no está disponible.");
      }

      sessionStorage.setItem(
        `desafio-${normalizedCode}`,
        JSON.stringify({
          playerName: playerName.trim(),
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
        <h3>ENTRAR A UNA SALA</h3>
        <div className="">
          <input
            type="text"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Escribe tu nombre"
            maxLength={40}
            required
          />
          </div>

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
          {loading ? "BUSCANDO DESAFÍO..." : "CONTINUAR →"}
        </button>

        <button className="secondary" >
          <Link href="/desafios">Volver a desafíos</Link>
        </button>
      </form>
    </main>
  );
}
