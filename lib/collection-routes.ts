export const collectionAliases: Record<string, { title: string; category?: string; collection?: string }> = {
  tops: { title: "Tops", collection: "tops" },
  bottoms: { title: "Bottoms", collection: "bottoms" },
  accessories: { title: "Accessories", collection: "accessories" },
  "t-shirts-longsleeves": { title: "T-Shirts", collection: "t-shirts-longsleeves" },
  "t-shirts": { title: "T-Shirts", collection: "t-shirts-longsleeves" },
  shorts: { title: "Shorts", collection: "shorts" },
  tights: { title: "Tights", collection: "tights" },
  headwear: { title: "Headwear", collection: "headwear" },
  "fall-26": { title: "Fall 26", collection: "fall-26" },
  "tank-tops": { title: "Tank Tops", category: "tank-tops" },
  pullovers: { title: "Pullovers", category: "pullovers" },
  jackets: { title: "Jackets", category: "jackets" },
  pants: { title: "Pants", category: "pants" },
  socks: { title: "Socks", category: "socks" },
  other: { title: "Other", category: "other" },
  // Legacy campaign links have no corresponding backend collection; preserve the URL with the active catalog.
  performance: { title: "Performance" },
  lifestyle: { title: "Lifestyle" },
};

export function collectionCanonical(slug: string) { return slug === "t-shirts-longsleeves" ? "t-shirts" : slug; }
