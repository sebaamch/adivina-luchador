import "./globals.css";

export const metadata = {
  title: "Adivina el Luchador",
  description: "Juego diario para adivinar luchadores de wrestling."
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
