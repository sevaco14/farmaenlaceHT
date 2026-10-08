/**
 * Every colour the 3D branch draws. The chrome (`app/globals.css`) and the scene
 * share Farmaenlace's corporate set: navy ink, gray, the corporate blue field, and
 * lime, which is reserved for the action layer (a released order, a live promo).
 * Product packaging keeps its own colours because a box of Vitamina C is orange.
 */
export const C = {
  navy: "#001a8c",
  navyLift: "#1d2f9a",
  navyDeep: "#0b1660",
  gray: "#868686",
  lime: "#7dba00",
  limeLit: "#9fd629",

  slab: "#0b1f63",
  slabEdge: "#132a7a",
  tile: "#eef1f6",
  tileLine: "#d6dce6",
  wall: "#f7f8fb",
  wallShade: "#e7ebf2",
  trim: "#d9dee8",
  glass: "#a9c4e2",

  shelfFrame: "#22348f",
  shelfBoard: "#f4f6fa",
  shelfBack: "#e3e8f1",
  counter: "#ffffff",
  counterFront: "#1d2f9a",
  counterTop: "#e9edf4",
  metal: "#9aa6b8",
  metalDark: "#4f5a6e",
  pallet: "#c9a477",
  palletDark: "#a5825a",
  wrap: "#dfe9f5",
  carton: "#d2b48c",
  cartonTape: "#b8956a",

  screen: "#0e1a45",
  screenLive: "#9fb6ff",
  phone: "#1b2233",
  laser: "#ff4d4d",
  paper: "#ffffff",
  ink: "#0a1440",
  promoOff: "#d5dbe5",

  skinTones: ["#e2b48e", "#b98261", "#ce9a76", "#885e48"],
  hairColors: ["#2b211c", "#5a3d2b", "#1f2326", "#7a5a3f"],
  trousers: "#2a3242",
  shoe: "#1d2230",
  coat: "#ffffff",

  /** The assortment on the gondolas that are not under watch. */
  stock: ["#ffffff", "#dce6f5", "#9fb6da", "#2b3f99", "#e9edf3", "#c7d3e6", "#f4c9c9", "#cfe3d8"],
} as const;

/** Packaging for the product the zone is watching. */
export const PRODUCT_LOOK: Record<string, { body: string; band: string; shape: "box" | "tube" | "bottle" }> = {
  "Vitamina C": { body: "#f28c28", band: "#ffffff", shape: "box" },
  "Protector solar": { body: "#f6c744", band: "#ffffff", shape: "tube" },
  "Alcohol 70%": { body: "#ffffff", band: "#2b3f99", shape: "bottle" },
  "Paracetamol 500 mg": { body: "#e8eef7", band: "#001a8c", shape: "box" },
  "Losartán 50 mg": { body: "#cfe3d8", band: "#0b1660", shape: "box" },
  "Suero oral": { body: "#9fd6d6", band: "#ffffff", shape: "box" },
};

export type ProductLook = { body: string; band: string; shape: "box" | "tube" | "bottle" };

const CATEGORY_LOOK: Record<string, ProductLook> = {
  vitaminas: { body: "#f2b045", band: "#ffffff", shape: "box" },
  analgesicos: { body: "#e8eef7", band: "#c8102e", shape: "box" },
  antisepticos: { body: "#ffffff", band: "#2b3f99", shape: "bottle" },
  dermocosmetica: { body: "#f6c744", band: "#ffffff", shape: "tube" },
  antihistaminicos: { body: "#dcd3f2", band: "#3b2a8c", shape: "box" },
  gastro: { body: "#f4c9c9", band: "#8c1a2b", shape: "box" },
  cardiovascular: { body: "#cfe3d8", band: "#0b1660", shape: "box" },
  metabolico: { body: "#d6e4f5", band: "#001a8c", shape: "box" },
  antibioticos: { body: "#ffffff", band: "#d94f1e", shape: "box" },
  hidratacion: { body: "#9fd6d6", band: "#ffffff", shape: "bottle" },
  curacion: { body: "#ffffff", band: "#7fb3e0", shape: "box" },
  infantil: { body: "#bfe0f7", band: "#ffffff", shape: "box" },
  higiene: { body: "#cfeec2", band: "#2e7d32", shape: "bottle" },
};

export function lookFor(product: string, category?: string): ProductLook {
  return PRODUCT_LOOK[product] ?? (category ? CATEGORY_LOOK[category] : undefined) ?? { body: "#e9edf3", band: "#001a8c", shape: "box" };
}
