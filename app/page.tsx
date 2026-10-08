"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Check, FastForward, Pause, PenLine, Play, RotateCcw, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Wordmark } from "../components/brand/Wordmark";
import { Barcode, QueryBars, StockCells, WeekCells } from "../components/dispatch/Marks";

const Branch = dynamic(() => import("../components/branch/Branch").then((mod) => mod.Branch), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

const CITIES = [
  { id: "guayaquil", code: "GYE", label: "Guayaquil" },
  { id: "quito", code: "UIO", label: "Quito" },
  { id: "cuenca", code: "CUE", label: "Cuenca" },
] as const;

const HEARTBEAT_MS = 60_000;
const QUITO_OFFSET_MS = -5 * 60 * 60 * 1000;

function formatClock(ms: number) {
  const shifted = new Date(ms + QUITO_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function messageText(text: string) {
  const quoted = text.match(/“([^”]+)”/)?.[1];
  return quoted ?? text.split(" · ")[0];
}

type CityId = (typeof CITIES)[number]["id"];
type Status = "pending" | "approved" | "rejected" | "expired" | "superseded";

type Signal = { city: string; source: "whatsapp" | "inventario" | "promocion"; product: string; summary: string; level: number };
type AgentResult = { role: "whatsapp" | "inventario" | "promocion"; summary: string; rationale: string };
type Order = {
  id: Id<"recommendations">;
  city: string;
  product: string;
  headline: string;
  detail: string;
  status: Status;
  proposedBy: string;
  decidedBy: string | null;
  restockUnits: number | null;
  promoDays: number | null;
  createdAt: number;
  expiresAt?: number | null;
  decidedAt?: number | null;
};

const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(REDUCED);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

function orderCode(order: Order, cityCode: string) {
  let hash = 0;
  for (const char of order.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `ORD-${cityCode}-${String(100 + (hash % 900)).padStart(4, "0")}`;
}

function orderTerms(order: Order) {
  const units = order.restockUnits !== null ? String(order.restockUnits) : (order.headline.match(/(\d[\d.]*)\s*unidades/)?.[1] ?? null);
  const days = order.promoDays !== null ? String(order.promoDays) : (order.headline.match(/(\d+)\s*días/)?.[1] ?? null);
  return { units, days };
}

function keepTogether(text: string, product: string) {
  return text
    .replace(product, product.replace(/ /g, "\u00a0"))
    .replace(/(\d[\d.]*) (unidades|días)/g, "$1\u00a0$2");
}

function promoState(level: number): "none" | "season" | "live" {
  if (level >= 100) return "live";
  if (level >= 50) return "season";
  return "none";
}

export default function Page() {
  const heartbeat = useMutation(api.live.heartbeat);
  const setRunning = useMutation(api.live.setRunning);
  const setFast = useMutation(api.live.setFast);
  const advance = useMutation(api.live.advance);
  const resetScenario = useMutation(api.comercial.resetScenario);
  const decide = useMutation(api.comercial.decide);
  const analyzeCity = useAction(api.agents.run.analyzeCity);
  const board = useQuery(api.comercial.board, {});
  const world = useQuery(api.live.world, {});
  const [focus, setFocus] = useState<CityId>("guayaquil");
  const [busy, setBusy] = useState<"approve" | "reject" | "reset" | "agents" | "advance" | "clock" | null>(null);
  const [agentFeedback, setAgentFeedback] = useState<{ city: CityId; product: string; text: string; agents: AgentResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reduced = useReducedMotion();
  const stockBefore = useRef<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function pulse() {
      if (inFlight) return;
      inFlight = true;
      try {
        await heartbeat();
        if (active) setConnectionError(null);
      } catch {
        if (active) setConnectionError("No se pudo conectar con la simulación. Comprueba la conexión y vuelve a intentarlo.");
      } finally {
        inFlight = false;
      }
    }
    void pulse();
    const id = window.setInterval(() => void pulse(), HEARTBEAT_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [heartbeat]);

  async function runAgents(cityId: CityId, target: string | undefined) {
    const meta = CITIES.find((item) => item.id === cityId) ?? CITIES[0];
    setBusy("agents");
    setError(null);
    setAgentFeedback(null);
    try {
      const result = await analyzeCity({ city: cityId, product: target });
      if (!result.ok || result.mode !== "bedrock") {
        setError(result.error ?? "No se completó el análisis con Bedrock. Vuelve a intentarlo.");
        return;
      }
      const text = `${result.agents.length} agentes Bedrock analizaron los datos sintéticos de ${meta.label}.`;
      setAgentFeedback({ city: cityId, product: target ?? "la zona", text, agents: result.agents });
      setAnnouncement(text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Los agentes no pudieron analizar la zona.");
    } finally {
      setBusy(null);
    }
  }

  const city = CITIES.find((item) => item.id === focus) ?? CITIES[0];
  const signals: Signal[] = (board?.signals ?? []).filter((signal) => signal.city === focus);
  const orders: Order[] = (board?.recommendations ?? [])
    .filter((item) => item.city === focus)
    .sort((a, b) => b.createdAt - a.createdAt);
  const order = orders.find((item) => item.status === "pending") ?? orders.at(0) ?? null;
  const zone = world?.cities.find((item) => item.city === focus);
  const product = order?.product ?? signals[0]?.product ?? zone?.shelves[0]?.product ?? "";
  const heroShelf = zone?.shelves.find((shelf) => shelf.product === product);
  const wa = signals.find((signal) => signal.source === "whatsapp" && signal.product === product) ?? (heroShelf ? {
    level: heroShelf.waLevel,
    summary: `${heroShelf.waPerHour} consultas simuladas por hora sobre ${product}.`,
  } : undefined);
  const inv = heroShelf ? {
    level: heroShelf.stockPct,
    summary: `Stock actual de ${product} al ${heroShelf.stockPct}% en la simulación.`,
  } : signals.find((signal) => signal.source === "inventario" && signal.product === product);
  const pro = heroShelf ? {
    level: heroShelf.promoLevel,
    summary: heroShelf.promoLevel >= 100
      ? `Promo local simulada: ${heroShelf.promoDaysRemaining} días restantes.`
      : heroShelf.promoLevel >= 50 ? "Promo de temporada del catálogo sintético." : "Sin promoción local activa.",
  } : signals.find((signal) => signal.source === "promocion" && signal.product === product);
  const promoDays = heroShelf?.promoDaysRemaining ?? (order?.status === "approved" ? order.promoDays ?? 0 : 0);
  const neighbors = (zone?.shelves ?? []).filter((shelf) => shelf.product !== product).slice(0, 2);
  const zoneEvents = (world?.events ?? []).filter((event) => event.city === focus);
  const messages = zoneEvents
    .filter((event) => event.code === "WA" && event.product === product)
    .map((event) => ({ id: event.id, text: messageText(event.text) }));
  const clock = world?.clock ?? null;

  useEffect(() => {
    if (order?.status === "pending" && inv) stockBefore.current[order.id] = inv.level;
  }, [order?.id, order?.status, inv]);

  function routeState(id: CityId): Status | "clear" {
    const rows = (board?.recommendations ?? [])
      .filter((item) => item.city === id)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (rows.some((item) => item.status === "pending")) return "pending";
    return rows.at(0)?.status ?? "clear";
  }

  async function onDecide(decision: "approve" | "reject") {
    if (!order || order.status !== "pending") return;
    setBusy(decision);
    setError(null);
    try {
      const result = await decide({ recommendationId: order.id, decision });
      const code = orderCode(order, city.code);
      if (result.status === "expired" || result.status === "superseded") {
        setError("La orden ya no está vigente. Analiza de nuevo con los agentes antes de firmar.");
      } else {
        setAnnouncement(result.status === "approved" ? `Orden ${code} liberada en la simulación.` : `Orden ${code} rechazada.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo registrar la firma. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  async function onClockChange(control: "running" | "fast") {
    if (!clock || busy !== null) return;
    setBusy("clock");
    setError(null);
    try {
      if (control === "running") await setRunning({ running: !clock.running });
      else await setFast({ fast: !clock.fast });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cambiar el ritmo de la simulación.");
    } finally {
      setBusy(null);
    }
  }

  async function onAdvance() {
    setBusy("advance");
    setError(null);
    try {
      await advance();
      setAnnouncement("La simulación avanzó una hora.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo avanzar la simulación.");
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    setBusy("reset");
    setError(null);
    try {
      await resetScenario();
      stockBefore.current = {};
      setAgentFeedback(null);
      setFocus("guayaquil");
      setAnnouncement("Demo reiniciada. Las zonas empiezan a moverse de nuevo.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo reiniciar la demo.");
    } finally {
      setBusy(null);
    }
  }

  const loading = board === undefined || world === undefined || busy === "agents";
  const status: Status | "none" = order?.status ?? "none";
  const released = status === "approved";

  return (
    <div className="app">
      <a className="skip-link visually-hidden" href="#orden">
        Ir a la orden
      </a>
      <header className="routebar">
        <Wordmark />
        <p className="routebar-product">
          <b>Analista comercial</b>
          <span>Primera línea</span>
        </p>
        <nav className="routes" aria-label="Zonas">
          <ul role="list">
            {CITIES.map((item) => {
              const state = routeState(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="route"
                    aria-pressed={focus === item.id}
                    onClick={() => setFocus(item.id)}
                    disabled={busy !== null}
                  >
                    <span className="route-code">{item.code}</span>
                    <span className="route-name">{item.label}</span>
                    <span className="route-mark" data-state={state}>
                      {loading
                        ? "…"
                        : state === "pending"
                          ? "1 por firmar"
                          : state === "approved"
                            ? "Liberada"
                            : state === "rejected"
                              ? "Rechazada"
                              : state === "expired" || state === "superseded" ? "Reanalizar" : "Estable"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="routebar-meta">
          <span className="synthetic">Datos sintéticos</span>
          <button
            type="button"
            className="ghost"
            onClick={() => void runAgents(focus, product || undefined)}
            disabled={busy !== null || !product}
          >
            <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
            <span className="ghost-label">
              {busy === "agents"
                ? "Agentes analizando…"
                : "Analizar con Bedrock"}
            </span>
          </button>
          <button type="button" className="ghost" onClick={() => void onReset()} disabled={busy !== null}>
            <RotateCcw aria-hidden="true" size={16} strokeWidth={2} />
            <span className="ghost-label">{busy === "reset" ? "Reiniciando…" : "Reiniciar demo"}</span>
          </button>
        </div>
      </header>

      <main className="board" id="orden" tabIndex={-1}>
        <div className="order-wrap">
          <article className="order" data-state={status} aria-labelledby="order-title">
            <header className="order-head">
              <div>
                <span className="field-label">Orden</span>
                <span className="order-code">{order ? orderCode(order, city.code) : "Sin orden"}</span>
              </div>
              <div>
                <span className="field-label">Destino</span>
                <span className="order-route">{city.code}</span>
              </div>
              <p className="order-status" data-state={status}>
                {status === "pending" && "Por firmar"}
                {status === "approved" && (
                  <>
                    <Check aria-hidden="true" size={15} strokeWidth={3} /> Liberada
                  </>
                )}
                {status === "rejected" && "Rechazada"}
                {status === "expired" && "Vencida"}
                {status === "superseded" && "Reemplazada"}
                {!order && (loading ? "Leyendo" : "En observación")}
              </p>
            </header>

            <h1 id="order-title" className="order-title">
              {loading ? `Leyendo la zona ${city.label}…` : order ? keepTogether(order.headline, product) : `${city.label}: sin orden pendiente.`}
            </h1>

            {order ? (
              <OrderFields order={order} city={city.label} />
            ) : loading ? null : (
              <p className="order-quiet">
                Analiza {product} con Bedrock para cruzar consultas, stock y promociones. Si corresponde una acción,
                la propuesta aparece aquí para tu firma.
              </p>
            )}

            <section className="signals" aria-labelledby="signals-title">
              <h2 id="signals-title">Señales de {product || "la zona"}</h2>
              {board === undefined ? (
                <p className="signals-loading">Leyendo señales de la zona…</p>
              ) : (
                <ol role="list">
                  {wa && (
                    <SignalRow
                      code="WA"
                      name="Consultas por WhatsApp"
                      summary={wa.summary}
                      value={String(wa.level)}
                      unit="índice"
                      tone={wa.level >= 60 && !released ? "alert" : "calm"}
                    >
                      <QueryBars level={wa.level} />
                    </SignalRow>
                  )}
                  {inv && (
                    <SignalRow
                      code="INV"
                      name="Inventario en la zona"
                      summary={inv.summary}
                      value={`${inv.level}%`}
                      unit="stock"
                      tone={released ? "released" : inv.level < 30 ? "alert" : "calm"}
                    >
                      <StockCells level={inv.level} before={released && order ? (stockBefore.current[order.id] ?? null) : null} />
                    </SignalRow>
                  )}
                  {pro && (
                    <SignalRow
                      code="PRO"
                      name="Catálogo y promociones"
                      summary={pro.summary}
                      value={promoState(pro.level) === "live" ? String(promoDays) : promoState(pro.level) === "season" ? "Sí" : "0"}
                      unit={promoState(pro.level) === "season" ? "temporada" : "días promo"}
                      tone={promoState(pro.level) === "live" ? "released" : status === "pending" ? "alert" : "calm"}
                    >
                      <WeekCells state={promoState(pro.level)} />
                    </SignalRow>
                  )}
                </ol>
              )}
            </section>

            {order && (
              <details className="reason" key={order.id}>
                <summary>
                  {order.proposedBy === "agentes-bedrock"
                    ? "Ver evidencia · 3 agentes Bedrock (WA, INV, PRO)"
                    : "Ver evidencia · reglas de la demo"}
                </summary>
                <blockquote><p>{order.detail}</p></blockquote>
              </details>
            )}

            {agentFeedback?.city === focus && (
              <details className="order-quiet">
                <summary>Último análisis Bedrock · {agentFeedback.product}</summary>
                {agentFeedback.agents.map((agent) => (
                  <p key={agent.role}>
                    <b>{agent.role === "whatsapp" ? "WhatsApp" : agent.role === "inventario" ? "Inventario" : "Promociones"}:</b>{" "}
                    {agent.summary} {agent.rationale}
                  </p>
                ))}
              </details>
            )}

            <footer className="sign">
              <div className="sign-code">
                <Barcode value={order ? orderCode(order, city.code) : city.code} />
                <span>{order ? orderCode(order, city.code) : `ZONA ${city.code}`}</span>
              </div>
              <div className="sign-body">
                {status === "pending" && order && (
                  <>
                    <p className="sign-note">Tu firma aplica la propuesta en la simulación.</p>
                    <div className="sign-actions">
                      <button type="button" className="sign-approve" onClick={() => void onDecide("approve")} disabled={busy !== null}>
                        <PenLine aria-hidden="true" size={18} strokeWidth={2} />
                        {busy === "approve" ? "Firmando…" : "Firmar y liberar"}
                      </button>
                      <button type="button" className="sign-reject" onClick={() => void onDecide("reject")} disabled={busy !== null}>
                        <X aria-hidden="true" size={16} strokeWidth={2.4} />
                        {busy === "reject" ? "Rechazando…" : "Rechazar"}
                      </button>
                    </div>
                  </>
                )}
                {status === "approved" && order && (
                  <>
                    <div className="stamp" aria-hidden="true">
                      <span>Liberada</span>
                      <small>Primera línea</small>
                    </div>
                    <p className="sign-done">
                      <b>Firmada por el encargado de zona.</b> Se simuló un reabastecimiento de {orderTerms(order).units ?? "las"} unidades
                      de {order.product}
                      {orderTerms(order).days ? ` y una promo SmartClub de ${orderTerms(order).days} días.` : "."}
                    </p>
                  </>
                )}
                {status === "rejected" && (
                  <p className="sign-done">
                    <b>Rechazada por el encargado de zona.</b> Puedes solicitar otro análisis con Bedrock.
                  </p>
                )}
                {(status === "expired" || status === "superseded") && (
                  <p className="sign-done">La propuesta ya no está vigente. Analiza con Bedrock para actualizarla.</p>
                )}
                {!order && !loading && <p className="sign-done">Sin orden pendiente en {city.label}.</p>}
                {agentFeedback?.city === focus && <p className="sign-done" role="status">{agentFeedback.text}</p>}
                {(error || connectionError) && (
                  <p className="sign-error" role="alert">
                    {error || connectionError}
                  </p>
                )}
              </div>
            </footer>
          </article>
        </div>

        <section className="stage" aria-labelledby="stage-title">
          <div
            className="stage-canvas"
            role="img"
            aria-label={`Maqueta simulada de ${city.label}: ${product}, ${inv ? `stock al ${inv.level}%` : "stock pendiente de lectura"} y tres agentes en sus puestos.`}
          >
            {inv && <Branch
              zone={city.id}
              product={product || "Sin producto"}
              category={heroShelf?.category}
              neighbors={neighbors}
              messages={messages}
              queries={wa?.level ?? 0}
              stock={inv.level}
              promo={pro?.level ?? 0}
              promoDays={promoDays}
              alert={status === "pending"}
              released={released}
              motion={!reduced}
            />}
          </div>
          <div className="stage-head">
            <h2 id="stage-title">Zona {city.label}</h2>
            <p>
              {status === "pending" && (order?.proposedBy === "agentes-bedrock"
                ? `Tres agentes Bedrock analizaron ${product}.`
                : `Propuesta de reglas demo sobre ${product}. Analiza con Bedrock para usar los agentes.`)}
              {status === "approved" && `Reabastecimiento simulado de ${product}.`}
              {status === "rejected" && `Orden rechazada. ${product} sigue en observación.`}
              {(status === "expired" || status === "superseded") && `Propuesta anterior de ${product}. Requiere otro análisis.`}
              {!order && (loading ? "Leyendo señales de la zona…" : `Analiza ${product} con los agentes Bedrock.`)}
            </p>
            {heroShelf?.trend && <p className="stage-trend">Contexto sintético: {heroShelf.trend}</p>}
          </div>
          <aside className="live" aria-labelledby="live-title">
            <div className="live-bar">
              <p id="live-title" className="live-clock" data-running={clock?.running ?? false}>
                <span className="live-dot" aria-hidden="true" />
                {clock ? (clock.running ? "Simulación" : "Simulación en pausa") : "Conectando"}
                {clock && <time className="num">{formatClock(clock.simTime)}</time>}
              </p>
              <div className="live-actions">
                <button
                  type="button"
                  className="live-btn"
                  onClick={() => void onClockChange("running")}
                  disabled={!clock || busy !== null}
                  aria-label={clock?.running ? "Pausar simulación" : "Reanudar simulación"}
                >
                  {clock?.running ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
                </button>
                <button
                  type="button"
                  className="live-btn"
                  aria-pressed={clock?.fast ?? false}
                  onClick={() => void onClockChange("fast")}
                  disabled={!clock || busy !== null}
                  aria-label="Acelerar simulación"
                >
                  <FastForward aria-hidden="true" size={14} />
                  <span>×3</span>
                </button>
                <button type="button" className="live-btn" onClick={() => void onAdvance()} disabled={!clock || busy !== null}>
                  <span>{busy === "advance" ? "…" : "+1 h"}</span>
                </button>
              </div>
            </div>
            <ol className="live-feed" role="list" aria-live="off">
              {zoneEvents.slice(0, 5).map((event) => (
                <li key={event.id} className="live-event" data-code={event.code}>
                  <time className="num">{formatClock(event.simTime)}</time>
                  <b>{event.code}</b>
                  <span>{event.text}</span>
                </li>
              ))}
              {world !== undefined && zoneEvents.length === 0 && (
                <li className="live-event live-empty">Sin movimientos todavía en {city.label}.</li>
              )}
            </ol>
          </aside>
          <footer className="manifest">
            <p className="manifest-claim">Antes de perder el stock y la venta.</p>
            <p className="manifest-scale">
              172 mil transacciones al día · 17.000 productos · 1.422 puntos de venta · 10 años de historial
            </p>
            <p className="manifest-stack">Demo: datos y ejecución sintéticos · Análisis con Amazon Bedrock</p>
          </footer>
        </section>
      </main>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function OrderFields({ order, city }: { order: Order; city: string }) {
  const { units, days } = orderTerms(order);
  return (
    <dl className="order-fields">
      <div>
        <dt className="field-label">Producto</dt>
        <dd>{order.product}</dd>
      </div>
      <div>
        <dt className="field-label">Reabastecer</dt>
        <dd className="num">{units ? `${units} u.` : "Por definir"}</dd>
      </div>
      <div>
        <dt className="field-label">Promo</dt>
        <dd className="num">{days ? `${days} días` : "No"}</dd>
      </div>
      <div>
        <dt className="field-label">Zona</dt>
        <dd>{city}</dd>
      </div>
    </dl>
  );
}

function SignalRow({
  code,
  name,
  summary,
  value,
  unit,
  tone,
  children,
}: {
  code: string;
  name: string;
  summary: string;
  value: string;
  unit: string;
  tone: "alert" | "calm" | "released";
  children: ReactNode;
}) {
  return (
    <li className="signal" data-tone={tone}>
      <span className="signal-code">{code}</span>
      <div className="signal-text">
        <p className="signal-name">{name}</p>
        <p className="signal-summary">{summary}</p>
      </div>
      <div className="signal-viz">{children}</div>
      <p className="signal-value">
        <b>{value}</b>
        <span>{unit}</span>
      </p>
    </li>
  );
}
