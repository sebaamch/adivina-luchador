import Link from "next/link";

export const metadata = {
  title: "ESTO ES LUCHA",
  description: "Elige tu modo de juego"
};

export default function Home() {
  return (
    <main className="page game-select-page">
      <section className="hero game-select-hero">
        <div className="eyebrow">JUEGOS DE LUCHA LIBRE</div>
        <h1>ESTO ES LUCHA</h1>
        <p>Elige tu modo de juego</p>
      </section>

      <section className="game-mode-grid" aria-label="Modos de juego">
        <Link href="/adivina-el-luchador" className="game-mode-card classic-mode-card">
          <div className="game-mode-icon" aria-hidden="true">VS</div>
          <div className="game-mode-tag">Adivina el Luchador</div>
          <h2>Versus</h2>
          <p>Elige un luchador secreto y descubre cuál es el de tu rival</p>
          <span className="game-mode-cta">JUGAR VERSUS <span aria-hidden="true">→</span></span>
        </Link>

        <Link href="/bomba-de-tiempo" className="game-mode-card hot-mode-card">
          <div className="game-mode-icon" aria-hidden="true">90s</div>
          <h2>Bomba de tiempo</h2>
          <p>Tienen 90 segundos para ganar.</p>
          <span className="game-mode-cta">JUGAR BOMBA DE TIEMPO <span aria-hidden="true">→</span></span>
        </Link>

        <Link
          href="/mas-cerca"
          className="game-mode-card closer-mode-card"
        >
          <div className="game-mode-icon" aria-hidden="true">
            ±
          </div>

          <div className="game-mode-tag">
            RETO DE CONOCIMIENTO
          </div>

          <h2>¿Quién está más cerca?</h2>

          <p>
            Compara edades, debuts, pesos y alturas de tus luchadores favoritos.
            Gana quien se acerque más.
          </p>

          <span className="game-mode-cta">
            JUGAR AHORA <span aria-hidden="true">→</span>
          </span>
        </Link>

      </section>
      <p className="game-select-footer">Entretención para fans, por fans</p>
    </main>
  );
}
