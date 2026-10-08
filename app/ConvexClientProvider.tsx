"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Component } from "react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

class BackendErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main role="alert">
          <h1>No se pudo cargar el tablero</h1>
          <p>El servicio no está disponible en este momento. Reintenta cuando se restablezca la conexión.</p>
          <button type="button" onClick={() => window.location.reload()}>Volver a cargar</button>
        </main>
      );
    }
    return this.props.children;
  }
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return (
      <main>
        <h1>El servicio aún no está configurado</h1>
        <p>Falta completar la conexión del tablero con el backend de este despliegue.</p>
      </main>
    );
  }
  return <ConvexProvider client={client}><BackendErrorBoundary>{children}</BackendErrorBoundary></ConvexProvider>;
}
