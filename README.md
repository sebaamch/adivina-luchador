# Adivina el Luchador — Versus Local

Juego 1 vs 1 de lucha libre para probar completamente en local con Next.js. No requiere Supabase ni otra base de datos externa.

## Ejecutar en VS Code

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Reiniciar la base local

```bash
npm run seed:local
```

Esto vuelve a crear `data/db.json` usando `data/wrestlers.json` y borra las salas existentes.

## Qué incluye

- 2 jugadores por partida.
- Cada jugador introduce su propio nombre.
- Código de sala de 6 caracteres.
- Cada jugador elige un luchador secreto.
- Turnos alternados.
- Comparación con verde / amarillo / rojo.
- 100 luchadores en la base local.
- Datos de promoción, país, género, debut, estado, categoría, estilo, altura, peso, alineación, campeón mundial y ganador de Royal Rumble.
- Alias, finisher, equipos y campeonatos para varios luchadores.
- Imágenes locales de fallback para los 100 luchadores.
- Algunas fichas incluyen imágenes externas de Wikimedia Commons; si no hay conexión o la imagen falla, se usa automáticamente la ficha local.
- El secreto del rival no se entrega durante la partida.

## Estructura

- `data/wrestlers.json`: catálogo de luchadores.
- `data/db.json`: salas y partidas locales.
- `public/wrestlers/`: imágenes/fichas locales.
- `app/api/`: API local del juego.
- `components/Game.js`: interfaz principal.
- `lib/game.js`: reglas y comparación.
- `lib/localdb.js`: persistencia JSON local.

## Nota sobre imágenes y datos

El proyecto usa Wikimedia Commons para algunas imágenes con licencia indicada por la fuente y mantiene una imagen local de fallback. Antes de publicar el sitio, revisa la licencia/atribución de cada imagen y los derechos de uso de los nombres, marcas y material visual de las promociones.

La base inicial se inspiró en fuentes públicas de wrestling, incluyendo Pro-Wrestling-Atlas, que publica un dataset de 383 luchadores con atributos históricos y de promociones. Para una versión pública grande conviene construir un pipeline de datos con fuentes y licencias verificadas.
