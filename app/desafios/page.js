
import Link from "next/link";

export const metadata = {
  title: "Desafíos | ESTO ES LUCHA",
  description: "Crea desafíos personalizados de lucha libre y reta a tus amigos."
};

/*const formats = [
  {
    id: "secret_wrestler",
    title: "Luchador secreto",
    description: "Prepara pistas para que otro jugador descubra al luchador.",
    icon: "?"
  },
  {
    id: "impostor",
    title: "Encuentra al impostor",
    description: "Presenta cuatro luchadores y descubre cuál no pertenece al grupo.",
    icon: "!"
  },
  {
    id: "similarity",
    title: "Encuentra la similitud",
    description: "Descubre qué característica tienen en común los luchadores.",
    icon: "≈"
  },
  {
    id: "blind_ranking",
    title: "Ranking a ciegas",
    description: "Ordena luchadores sin conocer los siguientes que aparecerán.",
    icon: "1–10"
  },
  {
    id: "top_10",
    title: "Top 10 de situaciones",
    description: "Clasifica momentos, combates y situaciones de la lucha libre.",
    icon: "TOP 10"
  },
  {
    id: "custom",
    title: "Desafío personalizado",
    description: "Crea tu propio reto con preguntas, palabras y pistas.",
    icon: "✎"
  }
];
*/
export default function DesafiosPage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="eyebrow">ESTO ES LUCHA</div>
        <h1>DESAFÍOS</h1>
        <p>Crea tu propio reto y demuestra cuánto sabes de lucha libre.</p>
      </section>

      <section className="game-mode-grid" aria-label="Opciones de desafíos">
        <Link href="/desafios/crear" className="game-mode-card">
          <div className="game-mode-icon">+</div>
          <div className="game-mode-tag">CREADOR</div>
          <h2>Crear desafío</h2>
          <p>Diseña un desafío personalizado y compártelo con tus amigos.</p>
          <span className="game-mode-cta">CREAR AHORA →</span>
        </Link>

        <Link href="/desafios/unirse" className="game-mode-card">
          <div className="game-mode-icon">VS</div>
          <div className="game-mode-tag">JUGADOR</div>
          <h2>Unirse a un desafío</h2>
          <p>Introduce el código que te compartieron y acepta el reto.</p>
          <span className="game-mode-cta">INTRODUCIR CÓDIGO →</span>
        </Link>
      </section>

      {/* <section className="game-mode-grid" aria-label="Formatos disponibles">
        {formats.map((format) => (
          <article className="game-mode-card" key={format.id}>
            <div className="game-mode-icon">{format.icon}</div>
            <h2>{format.title}</h2>
            <p>{format.description}</p>
          </article>
        ))}
      </section> */}

      <p className="game-select-footer">
        Entretención para fans, por fans
      </p>
    </main>
  );
}
