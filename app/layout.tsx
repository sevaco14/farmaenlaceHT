import type { ReactNode } from "react";
import localFont from "next/font/local";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const archivo = localFont({
  src: [
    { path: "../public/fonts/archivo-400.woff", weight: "400", style: "normal" },
    { path: "../public/fonts/archivo-800.woff", weight: "800", style: "normal" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata = {
  title: "Orden por firmar · Analista comercial Farmaenlace",
  description:
    "Tres agentes cruzan WhatsApp, inventario y promociones y proponen una orden concreta que el encargado de zona firma.",
};

export const viewport = {
  themeColor: "#08467f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={archivo.variable}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
