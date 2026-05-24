// Catalogue unifié - Gentek + MAC
import { MATERIAUX as MATERIAUX_GENTEK, LIBELLE_CATEGORIE, type Materiau, type Categorie, type Unite } from "./materiaux-gentek";
import { MATERIAUX_MAC } from "./materiaux-mac";
import { MATERIAUX_MAIBEC } from "./materiaux-maibec";

export const MATERIAUX: Materiau[] = [...MATERIAUX_GENTEK, ...MATERIAUX_MAC, ...MATERIAUX_MAIBEC];
export { LIBELLE_CATEGORIE };
export type { Materiau, Categorie, Unite };

export function fournisseurs(): string[] {
  return Array.from(new Set(MATERIAUX.map((m) => m.fournisseur)));
}
