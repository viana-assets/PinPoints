import "./globals.css";

export const metadata = {
  title: "Viana PinPoints",
  description: "Reifenwechsel-Anruflisten auf der Karte",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cline x1='6' y1='21' x2='6' y2='3' stroke='%231f2430' stroke-width='1.8' stroke-linecap='round'/%3E%3Cpath d='M6 3 L19 7.5 L6 12 Z' fill='%232f6fed'/%3E%3Ccircle cx='6' cy='21' r='1.6' fill='%231f2430'/%3E%3C/svg%3E"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" defer></script>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>{children}</body>
    </html>
  );
}
