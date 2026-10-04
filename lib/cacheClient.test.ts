// fetchInstantane (lib/cacheClient.ts) : ce que l'écran reçoit selon que le serveur
// répond, ne répond pas, ou que le service worker sert une copie hors ligne.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function fauxLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _m: m,
  };
}

function reponse(corps: any, entetes: Record<string, string> = {}, status = 200) {
  const h = new Map(Object.entries(entetes).map(([k, v]) => [k.toLowerCase(), v]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null }, json: async () => corps };
}

let ls: ReturnType<typeof fauxLocalStorage>;
beforeEach(() => {
  ls = fauxLocalStorage();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("localStorage", ls);
  vi.resetModules();
});
afterEach(() => { vi.unstubAllGlobals(); });

const charger = () => import("./cacheClient");

describe("fetchInstantane — cache instantané puis réseau", () => {
  it("réponse fraîche : appliquée sans « périmé » et mémorisée AVEC sa date", async () => {
    const { fetchInstantane, lireCacheLocalAvecDate } = await charger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse({ n: 1 })));
    const vu: any[] = [];
    await fetchInstantane("/api/x", (d, meta) => vu.push([d, meta]), { cle: "k" });
    expect(vu).toEqual([[{ n: 1 }, { perime: false }]]);
    const e = lireCacheLocalAvecDate("k");
    expect(e?.v).toEqual({ n: 1 });
    expect(typeof e?.t).toBe("number");
  });

  it("réseau coupé : le cache est affiché PUIS re-signalé comme périmé avec sa date (V-41)", async () => {
    const { fetchInstantane, ecrireCacheLocal } = await charger();
    ecrireCacheLocal("k", { n: 7 }, 1_700_000_000_000);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const vu: any[] = [];
    await fetchInstantane("/api/x", (d, meta) => vu.push([d, meta]), { cle: "k" });
    expect(vu).toEqual([
      [{ n: 7 }, { perime: false, date: 1_700_000_000_000 }],
      [{ n: 7 }, { perime: true, date: 1_700_000_000_000 }],
    ]);
  });

  it("copie hors ligne du service worker (X-Viking-Cache: stale) : périmée, et PAS réécrite dans le cache (V-42)", async () => {
    const { fetchInstantane, ecrireCacheLocal, lireCacheLocalAvecDate } = await charger();
    ecrireCacheLocal("k", { n: 7 }, 1_700_000_000_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse({ n: 8 }, { "X-Viking-Cache": "stale", Date: "Thu, 01 Jan 2026 12:00:00 GMT" })));
    const vu: any[] = [];
    await fetchInstantane("/api/x", (d, meta) => vu.push([d, meta]), { cle: "k" });
    expect(vu[1]).toEqual([{ n: 8 }, { perime: true, date: Date.parse("Thu, 01 Jan 2026 12:00:00 GMT") }]);
    // Le cache local garde la version qu'il avait : la copie du SW n'est pas plus fraîche.
    expect(lireCacheLocalAvecDate("k")).toEqual({ v: { n: 7 }, t: 1_700_000_000_000 });
  });

  it("un 401 ne réécrit rien et ne signale rien de plus sans cache", async () => {
    const { fetchInstantane, lireCacheLocalAvecDate } = await charger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse({ error: "non authentifié" }, {}, 401)));
    const vu: any[] = [];
    await fetchInstantane("/api/x", (d, meta) => vu.push([d, meta]), { cle: "k" });
    expect(vu).toEqual([]);
    expect(lireCacheLocalAvecDate("k")).toBeNull();
  });

  it("les entrées des anciennes versions (vk:, vkc2:) sont purgées au chargement", async () => {
    ls.setItem("vkc2:dash:stats", JSON.stringify({ x: 1 }));
    ls.setItem("vk:truc", "1");
    ls.setItem("vk-theme", "sombre");
    await charger();
    expect(ls.getItem("vkc2:dash:stats")).toBeNull();
    expect(ls.getItem("vk:truc")).toBeNull();
    expect(ls.getItem("vk-theme")).toBe("sombre");
  });
});
