import type { ReactNode } from "react";
import { Archivo } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
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
