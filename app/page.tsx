"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Check, PenLine, RotateCcw, X } from "lucide-react";
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
  { id: "guayaquil", code: "GYE", label: "Guayaquil", product: "Vitamina C" },
  { id: "quito", code: "UIO", label: "Quito", product: "Protector solar" },
  { id: "cuenca", code: "CUE", label: "Cuenca", product: "Alcohol 70%" },
] as const;

type CityId = (typeof CITIES)[number]["id"];
type Status = "pending" | "approved" | "rejected";

type Signal = { city: string; source: "whatsapp" | "inventario" | "promocion"; product: string; summary: string; level: number };
type Order = {
  id: Id<"recommendations">;
  city: string;
  product: string;
  headline: string;
  detail: string;
  status: Status;
  proposedBy: string;
  decidedBy: string | null;
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

function orderTerms(headline: string) {
  const units = headline.match(/(\d[\d.]*)\s*unidades/)?.[1] ?? null;
  const days = headline.match(/(\d+)\s*días/)?.[1] ?? null;
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
  const ensureScenario = useMutation(api.comercial.ensureScenario);
  const resetScenario = useMutation(api.comercial.resetScenario);
  const decide = useMutation(api.comercial.decide);
  const analyzeCity = useAction(api.agents.run.analyzeCity);
  const board = useQuery(api.comercial.board, {});
  const [focus, setFocus] = useState<CityId>("guayaquil");
  const [busy, setBusy] = useState<"approve" | "reject" | "reset" | "agents" | null>(null);
  const [agentMode, setAgentMode] = useState<"bedrock" | "fallback" | null>(null);
  const analyzedCities = useRef<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reduced = useReducedMotion();
  const stockBefore = useRef<Record<string, number>>({});

  useEffect(() => {
    void ensureScenario();
  }, [ensureScenario]);

  async function runAgents(cityId: CityId) {
    const meta = CITIES.find((item) => item.id === cityId) ?? CITIES[0];
    setBusy("agents");
    setError(null);
    try {
      const result = await analyzeCity({ city: cityId, product: meta.product });
      setAgentMode(result.mode);
      if (result.error && result.mode === "fallback") {
        setError(`Agentes en modo respaldo: ${result.error}`);
      } else {
        setAnnouncement(
          result.mode === "bedrock"
            ? `Tres agentes Bedrock actualizaron la zona ${meta.label}.`
            : `Señales actualizadas (modo respaldo) en ${meta.label}.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Los agentes no pudieron analizar la zona.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (board === undefined) return;
    if (analyzedCities.current.has(focus)) return;
    analyzedCities.current.add(focus);
    void runAgents(focus);
  }, [board, focus]);

  const city = CITIES.find((item) => item.id === focus) ?? CITIES[0];
  const signals: Signal[] = (board?.signals ?? []).filter((signal) => signal.city === focus);
  const wa = signals.find((signal) => signal.source === "whatsapp");
  const inv = signals.find((signal) => signal.source === "inventario");
  const pro = signals.find((signal) => signal.source === "promocion");
  const product = wa?.product ?? city.product;
  const orders: Order[] = (board?.recommendations ?? []).filter((item) => item.city === focus);
  const order =
    orders.find((item) => item.status === "pending") ??
    orders.find((item) => item.status === "approved") ??
    orders.find((item) => item.status === "rejected") ??
    null;

  useEffect(() => {
    if (order?.status === "pending" && inv) stockBefore.current[focus] = inv.level;
  }, [order?.status, inv, focus]);

  function routeState(id: CityId): "pending" | "approved" | "rejected" | "clear" {
    const rows = (board?.recommendations ?? []).filter((item) => item.city === id);
    if (rows.some((item) => item.status === "pending")) return "pending";
    if (rows.some((item) => item.status === "approved")) return "approved";
    if (rows.some((item) => item.status === "rejected")) return "rejected";
    return "clear";
  }

  async function onDecide(decision: "approve" | "reject") {
    if (!order || order.status !== "pending") return;
    setBusy(decision);
    setError(null);
    try {
      await decide({ recommendationId: order.id, decision });
      const code = orderCode(order, city.code);
      setAnnouncement(decision === "approve" ? `Orden ${code} liberada.` : `Orden ${code} rechazada.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo registrar la firma. Intenta de nuevo.");
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
      analyzedCities.current = new Set();
      setAgentMode(null);
      setFocus("guayaquil");
      setAnnouncement("Demo reiniciada. Hay una orden por firmar en Guayaquil.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo reiniciar la demo.");
    } finally {
      setBusy(null);
    }
  }

  const loading = board === undefined || busy === "agents";
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
                              : "Estable"}
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
            onClick={() => {
              analyzedCities.current.delete(focus);
              void runAgents(focus);
            }}
            disabled={busy !== null}
          >
            <span className="ghost-label">
              {busy === "agents"
                ? "Agentes analizando…"
                : agentMode === "bedrock"
                  ? "Reanalizar (Bedrock)"
                  : "Reanalizar zona"}
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
                {status === "none" && (loading ? "Leyendo" : "En observación")}
              </p>
            </header>

            <h1 id="order-title" className="order-title">
              {loading ? `Leyendo la zona ${city.label}…` : order ? keepTogether(order.headline, product) : `${city.label} no necesita acción hoy.`}
            </h1>

            {order ? (
              <OrderFields order={order} city={city.label} />
            ) : loading ? null : (
              <p className="order-quiet">
                Los tres agentes siguen cruzando consultas, stock y promociones de {product}. Si algo se mueve, la orden
                aparece aquí para tu firma.
              </p>
            )}

            <section className="signals" aria-labelledby="signals-title">
              <h2 id="signals-title">Por qué: tres señales cruzadas</h2>
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
                      <StockCells level={inv.level} before={released ? (stockBefore.current[focus] ?? null) : null} />
                    </SignalRow>
                  )}
                  {pro && (
                    <SignalRow
                      code="PRO"
                      name="Catálogo y promociones"
                      summary={pro.summary}
                      value={promoState(pro.level) === "live" ? "7" : promoState(pro.level) === "season" ? "Sí" : "0"}
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
              <blockquote className="reason">
                <p>{order.detail}</p>
                <footer>
                  {order.proposedBy === "agentes-bedrock"
                    ? "Tres agentes Bedrock · WA, INV y PRO"
                    : "Analista comercial · cruzó WA, INV y PRO"}
                </footer>
              </blockquote>
            )}

            <footer className="sign">
              <div className="sign-code">
                <Barcode value={order ? orderCode(order, city.code) : city.code} />
                <span>{order ? orderCode(order, city.code) : `ZONA ${city.code}`}</span>
              </div>
              <div className="sign-body">
                {status === "pending" && order && (
                  <>
                    <p className="sign-note">Nada se ejecuta sin tu firma.</p>
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
                      <b>Firmada por el encargado de zona.</b> Reabastecimiento de {orderTerms(order.headline).units ?? "las"}{" "}
                      unidades en camino y promo SmartClub activa por {orderTerms(order.headline).days ?? "7"} días.
                    </p>
                  </>
                )}
                {status === "rejected" && (
                  <p className="sign-done">
                    <b>Rechazada por el encargado de zona.</b> Los agentes siguen observando la zona.
                  </p>
                )}
                {status === "none" && !loading && <p className="sign-done">Sin orden pendiente en {city.label}.</p>}
                {error && (
                  <p className="sign-error" role="alert">
                    {error}
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
            aria-label={`Maqueta de la sucursal de ${city.label}: góndola de ${product} al ${inv?.level ?? 0}% y tres agentes en sus puestos.`}
          >
            <Branch
              zone={city.id}
              product={product}
              queries={wa?.level ?? 0}
              stock={inv?.level ?? 0}
              promo={pro?.level ?? 0}
              alert={status === "pending"}
              released={released}
              motion={!reduced}
            />
          </div>
          <div className="stage-head">
            <h2 id="stage-title">Zona {city.label}</h2>
            <p>
              {status === "pending" && `Tres agentes cruzan señales sobre ${product}.`}
              {status === "approved" && `Orden liberada: reabasteciendo ${product}.`}
              {status === "rejected" && `Orden rechazada. ${product} sigue en observación.`}
              {status === "none" && (loading ? "Leyendo señales de la zona…" : `Sin alertas. ${product} en observación.`)}
            </p>
          </div>
          <footer className="manifest">
            <p className="manifest-claim">Antes de perder el stock y la venta.</p>
            <p className="manifest-scale">
              172 mil transacciones al día · 17.000 productos · 1.422 puntos de venta · 10 años de historial
            </p>
            <p className="manifest-stack">Capa sobre SAP, Big Data y Airflow</p>
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
  const { units, days } = orderTerms(order.headline);
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
