"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return (
      <main>
        <h1>Falta el enlace a Convex</h1>
        <p>
          Ejecuta <code>npx convex dev</code> en esta carpeta para escribir
          NEXT_PUBLIC_CONVEX_URL en .env.local.
        </p>
      </main>
    );
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
