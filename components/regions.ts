export const COUNTRIES = [
  { code: "EG", name: "Egypt", prefix: "+20", flag: "🇪🇬" },
  { code: "CA", name: "Canada", prefix: "+1", flag: "🇨🇦" },
  { code: "US", name: "United States", prefix: "+1", flag: "🇺🇸" },
  { code: "SV", name: "El Salvador", prefix: "+503", flag: "🇸🇻" },
] as const;

export type CountryCode = (typeof COUNTRIES[number])["code"];

export function countryFlag(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.flag ?? "🌍";
}

export function countryPrefix(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.prefix ?? "+20";
}

export function countryName(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

const STORAGE_KEY = "altura_country";

export function storedCountryCode(fallback = "EG") {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && COUNTRIES.some((c) => c.code === v)) return v;
  } catch {}
  return fallback;
}

export function storeCountryCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {}
  window.dispatchEvent(new CustomEvent("altura:country-changed", { detail: code }));
}

export const REGIONS: Record<string, string[]> = {
  EG: ["Cairo", "Giza", "Alexandria", "Dakahlia", "Red Sea", "Beheira", "Fayoum", "Gharbia", "Ismailia", "Menofia", "Minya", "Qaliubiya", "New Valley", "Suez", "Aswan", "Asyut", "Beni Suef", "Port Said", "Damietta", "Sharqia", "South Sinai", "Kafr El Sheikh", "Matrouh", "Luxor", "Qena", "North Sinai", "Sohag"],
  CA: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Northwest Territories", "Nunavut", "Yukon"],
  US: ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"],
  SV: ["Ahuachapán", "Cabañas", "Chalatenango", "Cuscatlán", "La Libertad", "La Paz", "La Unión", "Morazán", "San Miguel", "San Salvador", "San Vicente", "Santa Ana", "Sonsonate", "Usulután"],
};
