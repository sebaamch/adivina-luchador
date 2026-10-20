import Link from "next/link";

export const metadata = {
  title: "ESTO ES LUCHA",
  description: "Elige tu modo de juego"
};

export default function Home() {
  return (
    <main className="page game-select-page">
      <section className="hero game-select-hero">
        <div className="eyebrow">WRESTLING • GAME CENTER</div>
        <h1>ADIVINA EL LUCHADOR</h1>
        <p>Elige cómo quieres competir.</p>
      </section>

      <section className="game-mode-grid" aria-label="Modos de juego">
        <Link href="/adivina-el-luchador" className="game-mode-card classic-mode-card">
          <div className="game-mode-icon" aria-hidden="true">VS</div>
          <div className="game-mode-tag">Adivina el Luchador</div>
          <h2>Versus</h2>
          <p>Elige un luchador secreto, descubre el de tu rival y gana por deducción.</p>
          <span className="game-mode-cta">JUGAR VERSUS <span aria-hidden="true">→</span></span>
        </Link>

        <Link href="/bomba-de-tiempo" className="game-mode-card hot-mode-card">
          <div className="game-mode-icon" aria-hidden="true">90s</div>
          <h2>Bomba de tiempo</h2>
          <p>Tienen 90 segundos para ganar.</p>
          <span className="game-mode-cta">JUGAR Bomba de tiempo <span aria-hidden="true">→</span></span>
        </Link>
      </section>
      <p className="game-select-footer">Dos modos de juego. Una sola arena.</p>
    </main>
  );
}
