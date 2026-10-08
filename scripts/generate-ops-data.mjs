/**
 * Generates operational mock data for Farmaenlace primera línea.
 *
 * The world is generated from a latent demand model (city mix, product mix,
 * seasonal shocks). WhatsApp volume, inventory coverage, promos and news all
 * read from that model so insights can be computed forward from the files.
 *
 * As-of date: 2026-10-08 (America/Guayaquil).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "mock");

const AS_OF = Date.parse("2026-10-08T12:00:00-05:00");
const DAY_MS = 86_400_000;
const DAYS = 28;
const DAY0 = Date.parse("2026-09-10T00:00:00-05:00");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261008);

function pick(list) {
  return list[Math.floor(rand() * list.length)];
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > L);
  return k - 1;
}

function ecuadorDay(t) {
  return new Date(t - 5 * 3600_000).toISOString().slice(0, 10);
}

function dayStamp(offset) {
  return ecuadorDay(DAY0 + offset * DAY_MS + 12 * 3600_000);
}

const CITIES = [
  { id: "guayaquil", label: "Guayaquil", weight: 1.0, dailyInbound: 58 },
  { id: "quito", label: "Quito", weight: 0.72, dailyInbound: 36 },
  { id: "cuenca", label: "Cuenca", weight: 0.38, dailyInbound: 16 },
];

const PRODUCTS = [
  { sku: "FE-VC500", name: "Vitamina C", category: "vitaminas", form: "tableta 500 mg", cost: 42 },
  { sku: "FE-PARA500", name: "Paracetamol 500 mg", category: "analgesicos", form: "tableta 500 mg", cost: 8 },
  { sku: "FE-IBU400", name: "Ibuprofeno 400 mg", category: "analgesicos", form: "tableta 400 mg", cost: 12 },
  { sku: "FE-ALC70", name: "Alcohol 70%", category: "antisepticos", form: "frasco 500 ml", cost: 95 },
  { sku: "FE-SUN50", name: "Protector solar", category: "dermocosmetica", form: "FPS 50 90 ml", cost: 780 },
  { sku: "FE-LOR10", name: "Loratadina 10 mg", category: "antihistaminicos", form: "tableta 10 mg", cost: 18 },
  { sku: "FE-OMEP20", name: "Omeprazol 20 mg", category: "gastro", form: "capsula 20 mg", cost: 22 },
  { sku: "FE-LOS50", name: "Losartán 50 mg", category: "cardiovascular", form: "tableta 50 mg", cost: 16 },
  { sku: "FE-MET850", name: "Metformina 850 mg", category: "metabolico", form: "tableta 850 mg", cost: 14 },
  { sku: "FE-AMX500", name: "Amoxicilina 500 mg", category: "antibioticos", form: "capsula 500 mg", cost: 28 },
  { sku: "FE-SAL100", name: "Suero oral", category: "hidratacion", form: "sobre 20.5 g", cost: 35 },
  { sku: "FE-GAS10", name: "Gasas estériles", category: "curacion", form: "caja 10 u", cost: 64 },
  { sku: "FE-COND", name: "Preservativos", category: "salud_sexual", form: "caja 3 u", cost: 210 },
  { sku: "FE-DIAP", name: "Pañales", category: "infantil", form: "paquete talla M", cost: 890 },
  { sku: "FE-JAB", name: "Jabón antibacterial", category: "higiene", form: "barra 90 g", cost: 45 },
  { sku: "FE-MAG", name: "Magnesio + B6", category: "vitaminas", form: "tableta", cost: 68 },
];

const bySku = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]));

const BASE_MIX = {
  guayaquil: {
    "FE-VC500": 0.07,
    "FE-PARA500": 0.12,
    "FE-IBU400": 0.08,
    "FE-ALC70": 0.05,
    "FE-SUN50": 0.04,
    "FE-LOR10": 0.06,
    "FE-OMEP20": 0.08,
    "FE-LOS50": 0.05,
    "FE-MET850": 0.05,
    "FE-AMX500": 0.04,
    "FE-SAL100": 0.06,
    "FE-GAS10": 0.04,
    "FE-COND": 0.05,
    "FE-DIAP": 0.09,
    "FE-JAB": 0.07,
    "FE-MAG": 0.05,
  },
  quito: {
    "FE-VC500": 0.05,
    "FE-PARA500": 0.1,
    "FE-IBU400": 0.07,
    "FE-ALC70": 0.04,
    "FE-SUN50": 0.18,
    "FE-LOR10": 0.08,
    "FE-OMEP20": 0.07,
    "FE-LOS50": 0.06,
    "FE-MET850": 0.05,
    "FE-AMX500": 0.03,
    "FE-SAL100": 0.03,
    "FE-GAS10": 0.04,
    "FE-COND": 0.05,
    "FE-DIAP": 0.08,
    "FE-JAB": 0.04,
    "FE-MAG": 0.03,
  },
  cuenca: {
    "FE-VC500": 0.06,
    "FE-PARA500": 0.11,
    "FE-IBU400": 0.08,
    "FE-ALC70": 0.12,
    "FE-SUN50": 0.06,
    "FE-LOR10": 0.05,
    "FE-OMEP20": 0.07,
    "FE-LOS50": 0.09,
    "FE-MET850": 0.05,
    "FE-AMX500": 0.04,
    "FE-SAL100": 0.04,
    "FE-GAS10": 0.05,
    "FE-COND": 0.04,
    "FE-DIAP": 0.07,
    "FE-JAB": 0.04,
    "FE-MAG": 0.03,
  },
};

/** Demand shocks shared by WhatsApp volume and inventory depletion. */
const SHOCKS = [
  { city: "guayaquil", sku: "FE-VC500", fromDay: 21, multiplier: 4.2 },
  { city: "guayaquil", sku: "FE-PARA500", fromDay: 23, multiplier: 1.8 },
  { city: "guayaquil", sku: "FE-SAL100", fromDay: 22, multiplier: 1.5 },
  { city: "quito", sku: "FE-SUN50", fromDay: 0, multiplier: 1.08 },
  { city: "cuenca", sku: "FE-LOS50", fromDay: 0, multiplier: 1.05 },
];

function shockFor(city, sku, dayOffset) {
  let m = 1;
  for (const s of SHOCKS) {
    if (s.city === city && s.sku === sku && dayOffset >= s.fromDay) m *= s.multiplier;
  }
  return m;
}

function mixFor(city, dayOffset) {
  const base = { ...BASE_MIX[city] };
  const weighted = {};
  let sum = 0;
  for (const sku of Object.keys(base)) {
    const w = base[sku] * shockFor(city, sku, dayOffset);
    weighted[sku] = w;
    sum += w;
  }
  for (const sku of Object.keys(weighted)) weighted[sku] /= sum;
  return weighted;
}

function drawSku(mix) {
  let r = rand();
  for (const [sku, w] of Object.entries(mix)) {
    r -= w;
    if (r <= 0) return sku;
  }
  return Object.keys(mix)[0];
}

const BRANCH_SEED = {
  guayaquil: [
    ["large", "Centro", "Mall del Sol", "Alborada", "Urdesa", "Samborondón"],
    ["medium", "Norte", "Ceibos", "Sauces", "Kennedy", "Mapasingue", "Vía a la Costa", "Durán", "Bastión Popular"],
    ["small", "Guasmo", "Fertisa", "Paso Lateral", "Pascuales", "Mucho Lote", "La Joya", "Orquídeas", "Samanes", "Entre Ríos"],
  ],
  quito: [
    ["large", "La Carolina", "Cumbayá", "Centro Histórico", "El Recreo"],
    ["medium", "Iñaquito", "Los Chillos", "Calderón", "Quitumbe", "La Mariscal", "Carcelén"],
    ["small", "El Condado", "San Rafael", "Tumbaco", "La Ofelia", "Guamaní", "Comité del Pueblo", "Sangolquí", "Pomasqui"],
  ],
  cuenca: [
    ["large", "Centro", "Mall del Río"],
    ["medium", "El Batán", "Yanuncay", "Misicata"],
    ["small", "Totoracocha", "Monay", "Ricaurte"],
  ],
};

const branches = [];
for (const city of CITIES) {
  let n = 1;
  for (const [size, ...names] of BRANCH_SEED[city.id]) {
    for (const barrio of names) {
      branches.push({
        code: `${city.id.slice(0, 3).toUpperCase()}-${String(n).padStart(2, "0")}`,
        name: `Farmaenlace ${barrio}`,
        city: city.id,
        size,
      });
      n += 1;
    }
  }
}

const TARGET_BY_SIZE = { small: 12, medium: 28, large: 52 };
const COST_MULT = { small: 1.06, medium: 1.0, large: 0.97 };

function coverage(city, sku) {
  let c = 0.68 + rand() * 0.22;
  const shock = shockFor(city, sku, DAYS - 1);
  if (shock > 1.2) c = c / (0.55 + shock * 0.35);
  if (city === "guayaquil" && sku === "FE-VC500") c = 0.18;
  if (city === "quito" && sku === "FE-SUN50") c = 0.74;
  if (city === "cuenca" && sku === "FE-ALC70") c = 0.81;
  if (city === "cuenca" && sku === "FE-LOS50") c = 0.22;
  if (city === "guayaquil" && sku === "FE-PARA500") c = 0.47;
  return clamp(c, 0.05, 1.15);
}

const FIRST = [
  "María", "José", "Carla", "Andrés", "Doménica", "Kevin", "Lady", "Jefferson",
  "Paola", "Luis", "Andrea", "Diego", "Fernanda", "Carlos", "Valeria", "Jorge",
  "Nicole", "Pedro", "Gabriela", "Daniel", "Rosa", "Miguel", "Ana", "Xavier",
  "Stefany", "Manuel", "Katherine", "Ricardo", "Jennifer", "Héctor",
];

const INTENTS = {
  stock_inquiry: (p, loc) => [
    `Buenas, ¿tienen ${p.name} en ${loc}?`,
    `Hola, quiero saber si hay stock de ${p.name}`,
    `¿Les queda ${p.name} ${p.form}?`,
    `Necesito ${p.name} hoy, ¿hay en sucursal?`,
    `Buenas tardes, consulto ${p.name}`,
  ],
  price: (p) => [
    `¿Cuánto cuesta ${p.name}?`,
    `Precio de ${p.name} ${p.form} porfa`,
    `Está en oferta ${p.name}?`,
  ],
  promo: (p) => [
    `Hay promo SmartClub de ${p.name}?`,
    `${p.name} entra en descuento esta semana?`,
    `Puedo pagar ${p.name} con puntos?`,
  ],
  symptoms: (p) => [
    `Estoy con gripe, me sirve ${p.name}?`,
    `Mi hijo está resfriado, tienen ${p.name}?`,
    `Me recomendaron ${p.name} para las defensas`,
    `Ando con dolor de cuerpo, ${p.name} hay?`,
  ],
  hours: () => [
    "Hasta qué hora atienden hoy?",
    "Están abiertos domingo?",
    "Hacen delivery a domicilio?",
  ],
};

function inboundText(product, intent, branch) {
  const loc = branch?.name.replace("Farmaenlace ", "") ?? "la sucursal";
  if (intent === "hours") return pick(INTENTS.hours());
  if (intent === "price") return pick(INTENTS.price(product));
  if (intent === "promo") return pick(INTENTS.promo(product));
  if (intent === "symptoms") return pick(INTENTS.symptoms(product));
  return pick(INTENTS.stock_inquiry(product, loc));
}

function outboundText(product, intent) {
  if (intent === "hours") {
    return pick([
      "Atendemos de 08:00 a 21:00. ¿Te ayudo con algún producto?",
      "Sí, abierto. Indícame tu sector para ver la sucursal más cercana.",
    ]);
  }
  return pick([
    `Sí, ${product.name} está en catálogo. Confirmo stock de tu zona.`,
    `Te confirmo disponibilidad de ${product.name} y te indico la sucursal.`,
    `Recibido. Reviso ${product.name} y te escribo en un momento.`,
  ]);
}

const waMessages = [];
const waDailyMap = new Map();
let msgN = 1;

function bumpDaily(city, sku, day) {
  const key = `${city}|${sku}|${day}`;
  const cur = waDailyMap.get(key) ?? { city, sku, product: bySku[sku].name, day, inbound: 0 };
  cur.inbound += 1;
  waDailyMap.set(key, cur);
}

const cityBranches = Object.fromEntries(
  CITIES.map((c) => [c.id, branches.filter((b) => b.city === c.id)]),
);

for (let d = 0; d < DAYS; d += 1) {
  for (const city of CITIES) {
    const mix = mixFor(city.id, d);
    const shockBoost = d >= 21 && city.id === "guayaquil" ? 1.22 : 1;
    const lambda = city.dailyInbound * shockBoost * (0.88 + rand() * 0.24);
    const n = poisson(lambda);
    for (let i = 0; i < n; i += 1) {
      const operational = rand() < 0.11;
      const sku = operational ? null : drawSku(mix);
      const product = sku ? bySku[sku] : pick(PRODUCTS);
      const intent = operational
        ? "hours"
        : pick(["stock_inquiry", "stock_inquiry", "stock_inquiry", "price", "promo", "symptoms"]);
      const hour = 8 + Math.floor(rand() * 13);
      const minute = Math.floor(rand() * 60);
      const at = DAY0 + d * DAY_MS + hour * 3600_000 + minute * 60_000 + Math.floor(rand() * 50_000);
      const branch = pick(cityBranches[city.id]);
      const who = pick(FIRST);
      const text = operational
        ? `${who}: ${inboundText(product, "hours", branch)}`
        : `${who}: ${inboundText(product, intent, branch)}`;
      waMessages.push({
        messageId: `wa-${String(msgN).padStart(5, "0")}`,
        at,
        day: dayStamp(d),
        city: city.id,
        branchCode: branch.code,
        direction: "inbound",
        text,
        sku,
        product: sku ? product.name : null,
        intent,
      });
      if (sku) bumpDaily(city.id, sku, dayStamp(d));
      msgN += 1;

      if (rand() < 0.18) {
        const replyAt = at + 2 * 60_000 + Math.floor(rand() * 25 * 60_000);
        waMessages.push({
          messageId: `wa-${String(msgN).padStart(5, "0")}`,
          at: replyAt,
          day: ecuadorDay(replyAt),
          city: city.id,
          branchCode: branch.code,
          direction: "outbound",
          text: outboundText(sku ? product : pick(PRODUCTS), intent),
          sku,
          product: sku ? product.name : null,
          intent: "agent_reply",
        });
        msgN += 1;
      }
    }
  }
}

const inventory = [];
for (const branch of branches) {
  for (const product of PRODUCTS) {
    const targetBase = TARGET_BY_SIZE[branch.size];
    const target = Math.max(4, Math.round(targetBase * (0.85 + rand() * 0.3) * (product.cost > 400 ? 0.55 : 1)));
    const cov = coverage(branch.city, product.sku);
    const onHand = Math.max(0, Math.round(target * cov * (0.9 + rand() * 0.2)));
    inventory.push({
      asOf: AS_OF,
      branchCode: branch.code,
      city: branch.city,
      sku: product.sku,
      product: product.name,
      onHand,
      target,
      unitCostCents: Math.round(product.cost * 100 * COST_MULT[branch.size]),
    });
  }
}

function ts(iso) {
  return Date.parse(`${iso}T00:00:00-05:00`);
}

const promos = [
  {
    promoId: "SC-VC-GYE-SEP",
    program: "SmartClub",
    sku: "FE-VC500",
    product: "Vitamina C",
    city: "guayaquil",
    startsAt: ts("2026-09-01"),
    endsAt: ts("2026-09-20"),
    discountPct: 15,
    active: false,
  },
  {
    promoId: "SC-SUN-UIO",
    program: "SmartClub",
    sku: "FE-SUN50",
    product: "Protector solar",
    city: "quito",
    startsAt: ts("2026-09-15"),
    endsAt: ts("2026-10-31"),
    discountPct: 20,
    active: true,
  },
  {
    promoId: "SC-OMEP-NAC",
    program: "SmartClub",
    sku: "FE-OMEP20",
    product: "Omeprazol 20 mg",
    city: "nacional",
    startsAt: ts("2026-10-01"),
    endsAt: ts("2026-10-15"),
    discountPct: 10,
    active: true,
  },
  {
    promoId: "SC-DIAP-NAC",
    program: "SmartClub",
    sku: "FE-DIAP",
    product: "Pañales",
    city: "nacional",
    startsAt: ts("2026-09-20"),
    endsAt: ts("2026-10-20"),
    discountPct: 12,
    active: true,
  },
  {
    promoId: "SC-PARA-UIO",
    program: "SmartClub",
    sku: "FE-PARA500",
    product: "Paracetamol 500 mg",
    city: "quito",
    startsAt: ts("2026-08-01"),
    endsAt: ts("2026-08-31"),
    discountPct: 10,
    active: false,
  },
  {
    promoId: "SC-ALC-CUE",
    program: "local",
    sku: "FE-ALC70",
    product: "Alcohol 70%",
    city: "cuenca",
    startsAt: ts("2026-07-01"),
    endsAt: ts("2026-07-21"),
    discountPct: 8,
    active: false,
  },
  {
    promoId: "SC-JAB-GYE",
    program: "SmartClub",
    sku: "FE-JAB",
    product: "Jabón antibacterial",
    city: "guayaquil",
    startsAt: ts("2026-10-01"),
    endsAt: ts("2026-10-12"),
    discountPct: 15,
    active: true,
  },
  {
    promoId: "SC-MAG-UIO",
    program: "SmartClub",
    sku: "FE-MAG",
    product: "Magnesio + B6",
    city: "quito",
    startsAt: ts("2026-10-05"),
    endsAt: ts("2026-10-19"),
    discountPct: 18,
    active: true,
  },
];

let extraPromo = 1;
for (const city of CITIES) {
  for (const product of PRODUCTS) {
    if (rand() > 0.22) continue;
    if (promos.some((p) => p.city === city.id && p.sku === product.sku)) continue;
    const startOffset = Math.floor(rand() * 50);
    const start = AS_OF - (70 - startOffset) * DAY_MS;
    const dur = 10 + Math.floor(rand() * 18);
    const ends = start + dur * DAY_MS;
    const active = start <= AS_OF && AS_OF <= ends;
    if (city.id === "guayaquil" && product.sku === "FE-VC500") continue;
    promos.push({
      promoId: `SC-X-${extraPromo}`,
      program: pick(["SmartClub", "SmartClub", "local"]),
      sku: product.sku,
      product: product.name,
      city: city.id,
      startsAt: start,
      endsAt: ends,
      discountPct: 8 + Math.floor(rand() * 15),
      active,
    });
    extraPromo += 1;
  }
}

for (const city of CITIES) {
  for (const product of PRODUCTS) {
    const start = AS_OF - (120 + Math.floor(rand() * 40)) * DAY_MS;
    const ends = start + (12 + Math.floor(rand() * 20)) * DAY_MS;
    if (promos.some((p) => p.promoId === `SC-H-${city.id}-${product.sku}`)) continue;
    promos.push({
      promoId: `SC-H-${city.id}-${product.sku}`,
      program: "SmartClub",
      sku: product.sku,
      product: product.name,
      city: city.id,
      startsAt: start,
      endsAt: ends,
      discountPct: 5 + Math.floor(rand() * 16),
      active: false,
    });
  }
}

const news = [
  {
    newsId: "n-001",
    publishedAt: ts("2026-10-03"),
    title: "MSP alerta incremento de infecciones respiratorias en la Costa",
    summary: "El Ministerio de Salud reporta más consultas por resfriado y gripe en Guayaquil y Durán en la primera semana de octubre.",
    source: "MSP Ecuador (mock)",
    cityTags: ["guayaquil"],
    skuTags: ["FE-VC500", "FE-PARA500", "FE-SAL100"],
    relevance: 0.92,
  },
  {
    newsId: "n-002",
    publishedAt: ts("2026-10-05"),
    title: "Inicio de temporada invernal adelanta demanda de vitaminas en farmacias",
    summary: "Comerciantes de la Costa señalan mayor rotación de Vitamina C y analgésicos ante lluvias y cambios de temperatura.",
    source: "El Universo (mock)",
    cityTags: ["guayaquil"],
    skuTags: ["FE-VC500", "FE-PARA500"],
    relevance: 0.88,
  },
  {
    newsId: "n-003",
    publishedAt: ts("2026-09-28"),
    title: "Índice UV extremo en Quito: recomendaciones de fotoprotección",
    summary: "El IGM reitera uso de protector solar FPS 50 en la Sierra por radiación alta en septiembre-octubre.",
    source: "IGM (mock)",
    cityTags: ["quito"],
    skuTags: ["FE-SUN50"],
    relevance: 0.8,
  },
  {
    newsId: "n-004",
    publishedAt: ts("2026-10-01"),
    title: "Feria de Cuenca eleva afluencia en el centro histórico",
    summary: "Más turismo local en el Austro; farmacias del centro reportan movimiento estable de curación y alcohol.",
    source: "El Mercurio (mock)",
    cityTags: ["cuenca"],
    skuTags: ["FE-ALC70", "FE-GAS10"],
    relevance: 0.45,
  },
  {
    newsId: "n-005",
    publishedAt: ts("2026-09-22"),
    title: "Desabastecimiento puntual de antihipertensivos en el Austro",
    summary: "Pacientes crónicos reportan dificultades para encontrar Losartán en algunas farmacias de Cuenca.",
    source: "Primicias (mock)",
    cityTags: ["cuenca"],
    skuTags: ["FE-LOS50"],
    relevance: 0.84,
  },
  {
    newsId: "n-006",
    publishedAt: ts("2026-10-06"),
    title: "Colegios de Guayaquil reportan ausentismo por cuadro gripal",
    summary: "Padres buscan suero oral, paracetamol y vitaminas en barrios del norte y del sur.",
    source: "Expreso (mock)",
    cityTags: ["guayaquil"],
    skuTags: ["FE-SAL100", "FE-PARA500", "FE-VC500"],
    relevance: 0.86,
  },
  {
    newsId: "n-007",
    publishedAt: ts("2026-09-18"),
    title: "Campaña nacional SmartClub de cuidado gástrico",
    summary: "Farmaenlace anuncia descuento en omeprazol en todas las zonas hasta mediados de octubre.",
    source: "Farmaenlace (mock)",
    cityTags: ["guayaquil", "quito", "cuenca"],
    skuTags: ["FE-OMEP20"],
    relevance: 0.4,
  },
  {
    newsId: "n-008",
    publishedAt: ts("2026-10-04"),
    title: "Lluvias en el Litoral y aumento de consultas pediátricas",
    summary: "Hospitales de la Junta de Beneficencia registran más atenciones por IRA en menores de 12 años.",
    source: "El Telégrafo (mock)",
    cityTags: ["guayaquil"],
    skuTags: ["FE-PARA500", "FE-SAL100"],
    relevance: 0.77,
  },
];

let extraNews = 9;
const extraTitles = [
  ["Control de dengue residual en Durán", ["guayaquil"], ["FE-JAB", "FE-ALC70"], 0.5],
  ["Quito promociona deporte al aire libre en parques", ["quito"], ["FE-SUN50", "FE-MAG"], 0.42],
  ["Cuenca: campaña de hipertensión en centros de salud", ["cuenca"], ["FE-LOS50"], 0.7],
  ["Alza de precios en dermocosmética importada", ["quito", "guayaquil"], ["FE-SUN50"], 0.33],
  ["Semana de la lactancia: más tráfico en góndola infantil", ["guayaquil", "quito", "cuenca"], ["FE-DIAP"], 0.38],
  ["Brote de alergias por polen en valles de Quito", ["quito"], ["FE-LOR10"], 0.61],
  ["Guayaquil: feria de salud en la Alborada", ["guayaquil"], ["FE-VC500", "FE-MET850"], 0.55],
  ["Farmacias del Austro refuerzan stock de curación", ["cuenca"], ["FE-GAS10", "FE-ALC70"], 0.48],
  ["Advertencia de automedicación con antibióticos", ["guayaquil", "quito", "cuenca"], ["FE-AMX500"], 0.44],
  ["Temporada de gastritis por comidas fuera de casa", ["guayaquil"], ["FE-OMEP20"], 0.5],
];
for (const [title, cityTags, skuTags, relevance] of extraTitles) {
  news.push({
    newsId: `n-${String(extraNews).padStart(3, "0")}`,
    publishedAt: ts(dayStamp(8 + extraNews)),
    title,
    summary: `${title}. Nota de contexto regional para cruce con consultas e inventario.`,
    source: pick(["El Universo (mock)", "Primicias (mock)", "El Comercio (mock)", "GK (mock)"]),
    cityTags,
    skuTags,
    relevance,
  });
  extraNews += 1;
}

function writeJsonl(name, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  writeFileSync(join(OUT, name), body);
}

mkdirSync(OUT, { recursive: true });
writeJsonl("catalogItems.jsonl", PRODUCTS.map(({ sku, name, category, form }) => ({ sku, name, category, form })));
writeJsonl("pharmacyBranches.jsonl", branches);
writeJsonl("waMessages.jsonl", waMessages);
writeJsonl("waDaily.jsonl", [...waDailyMap.values()]);
writeJsonl("inventoryPositions.jsonl", inventory);
writeJsonl("promoCalendar.jsonl", promos);
writeJsonl("newsItems.jsonl", news);
writeJsonl("opsMeta.jsonl", [
  {
    key: "counts",
    catalogItems: PRODUCTS.length,
    pharmacyBranches: branches.length,
    waMessages: waMessages.length,
    waInbound: waMessages.filter((m) => m.direction === "inbound").length,
    waDaily: waDailyMap.size,
    inventoryPositions: inventory.length,
    promoCalendar: promos.length,
    newsItems: news.length,
    asOf: "2026-10-08",
  },
]);

function citySkuStock(city, sku) {
  const rows = inventory.filter((r) => r.city === city && r.sku === sku);
  const onHand = rows.reduce((s, r) => s + r.onHand, 0);
  const target = rows.reduce((s, r) => s + r.target, 0);
  return { onHand, target, pct: target ? Math.round((100 * onHand) / target) : 0, branches: rows.length };
}

function inboundWindow(city, sku, fromDay, toDay) {
  let n = 0;
  for (let d = fromDay; d < toDay; d += 1) {
    n += waDailyMap.get(`${city}|${sku}|${dayStamp(d)}`)?.inbound ?? 0;
  }
  return n;
}

const preview = [];
for (const city of CITIES) {
  for (const product of PRODUCTS) {
    const recent = inboundWindow(city.id, product.sku, DAYS - 7, DAYS);
    const prior = inboundWindow(city.id, product.sku, 0, DAYS - 7);
    const expected = (prior / 21) * 7;
    const lift = expected > 0.5 ? recent / expected : 0;
    const stock = citySkuStock(city.id, product.sku);
    const activePromo = promos.some(
      (p) =>
        p.active &&
        p.sku === product.sku &&
        (p.city === city.id || p.city === "nacional"),
    );
    preview.push({
      city: city.id,
      sku: product.sku,
      product: product.name,
      waRecent7: recent,
      waPrior21: prior,
      lift: Math.round(lift * 100) / 100,
      ...stock,
      activePromo,
    });
  }
}

preview.sort((a, b) => b.lift * (1 - b.pct / 100) - a.lift * (1 - a.pct / 100));
writeFileSync(join(OUT, "_preview_metrics.json"), JSON.stringify({ asOf: "2026-10-08", preview }, null, 2));

const inbound = waMessages.filter((m) => m.direction === "inbound").length;
console.log(JSON.stringify({
  asOf: "2026-10-08",
  catalogItems: PRODUCTS.length,
  pharmacyBranches: branches.length,
  waMessages: waMessages.length,
  waInbound: inbound,
  waDaily: waDailyMap.size,
  inventoryPositions: inventory.length,
  promoCalendar: promos.length,
  newsItems: news.length,
  top: preview.slice(0, 8).map((r) => ({
    city: r.city,
    product: r.product,
    lift: r.lift,
    stockPct: r.pct,
    waRecent7: r.waRecent7,
    activePromo: r.activePromo,
  })),
}, null, 2));
