import "./globals.css";

export const metadata = {
  title: "ESTO ES LUCHA",
  description: "Página por fans para fans"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
