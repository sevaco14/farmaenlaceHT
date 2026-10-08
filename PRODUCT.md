# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the encargado comercial or jefe de zona at Farmaenlace's primera línea. They watch a city or region, decide restocks and local promotions, and today they react late because the signals live in separate systems.

Secondary: the hackathon jury (Connect AI Build, Farmaenlace + BYD), who see the product in a 3-minute demo and must understand the mechanism in seconds. The screen must work as a real tool and hold up live on stage.

## Product Purpose

Convert the flood of Farmaenlace's operational data into concrete, approvable decisions for the first-line manager, before the stock and the sale are lost.

One-liner: "Convertimos la avalancha de datos operativos de Farmaenlace en decisiones concretas para el encargado de primera línea — antes de perder el stock y la venta."

Success: the manager sees which city needs attention, understands why from three crossed signals, and approves or rejects a concrete action in one step.

## Positioning

A multi-agent system that crosses three sources no single report joins: customer queries from WhatsApp, inventory movements per branch, and the product catalog with stock and active promotions. It proposes a specific action with quantities and duration. The agent never acts alone: it proposes, the human decides.

## Operating Context

- Sits on top of Farmaenlace's existing stack: SAP, Big Data lake, Airflow, predictive models. Ties into the SmartClub loyalty program for local promotions.
- Scale: 172 mil transacciones diarias, 17.000 productos, 1.422 puntos de venta, 10 años de historial.
- Canonical scenario: "Hay un aumento inusual de consultas sobre Vitamina C en Guayaquil. El stock está al 18% y no hay promoción activa en esa zona. Recomiendo reabastecer 500 unidades y activar una promo local por 7 días."
- Cities in the demo: Guayaquil (alert), Quito (stable), Cuenca (stable).

## Capabilities and Constraints

- Next.js 15 App Router + React 19, Convex backend (reactive `board` query, `ensureScenario` and `decide` mutations), React Three Fiber for the 3D scene.
- Three agents by role: WhatsApp (consultas), Inventario (stock por zona), Promociones (catálogo y promos activas), plus the recommendation they jointly produce.
- Approve updates inventory to 78% ("Reabastecimiento de 500 unidades aprobado") and promo to 100% ("Promo local SmartClub activa por 7 días"). Reject only records the decision.
- Authentication (WorkOS AuthKit) is not configured yet; the actor defaults to a demo manager.
- All data is synthetic. No real customer, health, or payment data.

## Brand Commitments

- Farmaenlace corporate identity, explicitly requested by the user: wordmark "farma" (bold, navy) + "enlace" (light, gray) over a lime-green swoosh. Sampled colors: navy #001A8C, lime #7DBA00, gray #868686, corporate background blue #08467F.
- Language: Spanish (Ecuador), direct, operational.

## Evidence on Hand

- Hackathon case figures listed above (from the Farmaenlace case slides).
- Logos supplied by the user in chat (cropped PNG on white, small JPG on blue).
- No real customers, testimonials, or measured results exist: do not invent them. Data in the demo must be labeled synthetic.

## Product Principles

1. Propose, never act: every action waits for a human decision.
2. Show the why: each recommendation shows the crossed signals that produced it.
3. One concrete action: quantities, zone, and duration, not dashboards to interpret.
4. Primera línea first: built for the person who decides on the ground, not for headquarters reporting.
