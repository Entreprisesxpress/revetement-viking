// Le service worker (public/sw.js) ne se charge pas dans le panneau navigateur ni dans
// vitest : on l'exécute dans une sandbox `vm` avec un faux `caches` et un faux `fetch`,
// puis on lui envoie des événements fetch comme le ferait le navigateur.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ORIGINE = "https://app.test";

type Rep = { status: number; type: string; corps: string; clone(): Rep };
const rep = (corps: string, status = 200): Rep => ({ status, type: "basic", corps, clone() { return { ...this }; } });

function faireSandbox() {
  const handlers: Record<string, Function[]> = {};
  const magasins = new Map<string, Map<string, Rep>>();
  const cle = (r: any) => (typeof r === "string" ? r : r.url);
  const ouvrir = (nom: string) => {
    if (!magasins.has(nom)) magasins.set(nom, new Map());
    const m = magasins.get(nom)!;
    return {
      put: async (r: any, v: Rep) => { m.set(cle(r), v); },
      match: async (r: any) => m.get(cle(r)),
      keys: async () => [...m.keys()],
      delete: async (r: any) => m.delete(cle(r)),
      addAll: async () => {},
    };
  };
  const reseau = { reponses: new Map<string, Rep | Error>(), appels: [] as string[] };
  const sandbox: any = {
    self: { addEventListener: (n: string, f: Function) => { (handlers[n] ||= []).push(f); }, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {} },
    location: { origin: ORIGINE },
    caches: {
      open: async (nom: string) => ouvrir(nom),
      keys: async () => [...magasins.keys()],
      delete: async (nom: string) => magasins.delete(nom),
      match: async (r: any) => { for (const m of magasins.values()) { const v = m.get(cle(r)); if (v) return v; } return undefined; },
    },
    fetch: async (r: any) => {
      reseau.appels.push(cle(r));
      const v = reseau.reponses.get(cle(r));
      if (v instanceof Error) throw v;
      return v ?? rep("réponse réseau par défaut");
    },
    URL, console,
  };
  sandbox.self.location = sandbox.location;
  vm.createContext(sandbox);
  // SW_FICHIER permet de faire tourner le banc sur une AUTRE version du fichier
  // (ex. : l'ancienne, pour prouver que le banc attrapait bien le défaut).
  vm.runInContext(readFileSync(join(process.cwd(), process.env.SW_FICHIER || "public/sw.js"), "utf8"), sandbox);

  async function requete(url: string, mode = "cors"): Promise<Rep | undefined> {
    let promesse: Promise<Rep> | undefined;
    const event = { request: { method: "GET", url: ORIGINE + url, mode }, respondWith: (p: Promise<Rep>) => { promesse = p; } };
    for (const h of handlers.fetch) h(event);
    if (!promesse) return undefined; // le SW a laissé passer (réseau normal)
    const r = await promesse;
    // Laisse finir les mises en cache lancées sans await. (setImmediate, pas setTimeout :
    // sous Windows, setTimeout(0) attend ~15 ms → 305 requêtes = 5 s de banc.)
    await new Promise((res) => setImmediate(res));
    await new Promise((res) => setImmediate(res));
    return r;
  }
  const precacher = async (nomCache: string, url: string, corps: string) => { await ouvrir(nomCache).put(ORIGINE + url, rep(corps)); };
  const contenu = async (nomCache: string) => [...(magasins.get(nomCache) || new Map()).keys()];
  return { requete, reseau, precacher, contenu, magasins };
}

const RUNTIME = "viking-v6-runtime";
let sb: ReturnType<typeof faireSandbox>;
beforeEach(() => { sb = faireSandbox(); });

describe("service worker — quoi mettre en cache, et dans quel ordre", () => {
  it("la charge utile d'une navigation interne (?_rsc=) vient du RÉSEAU, même si une version est en cache", async () => {
    // Avant : cache d'abord → l'ancienne page était servie tant qu'on ne rechargeait pas.
    await sb.precacher(RUNTIME, "/projets?_rsc=abc", "ANCIENNE page");
    sb.reseau.reponses.set(ORIGINE + "/projets?_rsc=abc", rep("NOUVELLE page"));
    const r = await sb.requete("/projets?_rsc=abc", "cors");
    expect(r?.corps).toBe("NOUVELLE page");
    expect(sb.reseau.appels).toContain(ORIGINE + "/projets?_rsc=abc");
  });

  it("hors ligne, la navigation interne retombe sur la copie en cache", async () => {
    await sb.precacher(RUNTIME, "/projets?_rsc=abc", "copie hors ligne");
    sb.reseau.reponses.set(ORIGINE + "/projets?_rsc=abc", new Error("réseau coupé"));
    const r = await sb.requete("/projets?_rsc=abc", "cors");
    expect(r?.corps).toBe("copie hors ligne");
  });

  it("un fichier haché de Next (/_next/static/…) est servi du cache SANS toucher au réseau", async () => {
    await sb.precacher(RUNTIME, "/_next/static/chunks/abc123.js", "chunk en cache");
    const r = await sb.requete("/_next/static/chunks/abc123.js", "cors");
    expect(r?.corps).toBe("chunk en cache");
    expect(sb.reseau.appels).toEqual([]);
  });

  it("un fichier haché absent du cache est téléchargé puis gardé", async () => {
    sb.reseau.reponses.set(ORIGINE + "/_next/static/chunks/neuf.js", rep("chunk neuf"));
    const r = await sb.requete("/_next/static/chunks/neuf.js", "cors");
    expect(r?.corps).toBe("chunk neuf");
    expect(await sb.contenu(RUNTIME)).toContain(ORIGINE + "/_next/static/chunks/neuf.js");
  });

  it("une page (mode navigate) vient du réseau d'abord", async () => {
    await sb.precacher(RUNTIME, "/projets", "vieille page HTML");
    sb.reseau.reponses.set(ORIGINE + "/projets", rep("page HTML fraîche"));
    const r = await sb.requete("/projets", "navigate");
    expect(r?.corps).toBe("page HTML fraîche");
  });

  it("les API de lecture viennent du réseau d'abord ; les autres API ne passent pas par le SW", async () => {
    await sb.precacher("viking-v6-api", "/api/projets", "liste périmée");
    sb.reseau.reponses.set(ORIGINE + "/api/projets", rep("liste fraîche"));
    expect((await sb.requete("/api/projets"))?.corps).toBe("liste fraîche");
    expect(await sb.requete("/api/paies")).toBeUndefined();
    expect(await sb.requete("/login")).toBeUndefined();
  });

  it("le cache d'exécution est plafonné : les plus anciens fichiers partent", async () => {
    for (let i = 0; i < 305; i++) {
      const u = `/_next/static/chunks/c${i}.js`;
      sb.reseau.reponses.set(ORIGINE + u, rep(`c${i}`));
      await sb.requete(u);
    }
    const cles = await sb.contenu(RUNTIME);
    expect(cles.length).toBe(300);
    expect(cles).not.toContain(ORIGINE + "/_next/static/chunks/c0.js");
    expect(cles).toContain(ORIGINE + "/_next/static/chunks/c304.js");
  });
});
