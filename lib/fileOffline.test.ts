import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorage minimal : le module cible tourne dans le navigateur, les tests en Node.
function installerStockage() {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
  };
  return mem;
}

async function chargerModule() {
  vi.resetModules();
  return await import("./fileOffline");
}

describe("postOuFile", () => {
  beforeEach(() => { installerStockage(); });

  it("file la saisie quand le réseau est coupé", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    const r = await m.postOuFile("/api/heures", { heures: 8 });
    expect(r).toMatchObject({ ok: true, offline: true });
    expect(m.nbActionsEnAttente()).toBe(1);
  });

  it("ne file PAS et signale l'échec quand le serveur refuse", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "date invalide" }) });
    const r = await m.postOuFile("/api/heures", { heures: 8 });
    expect(r.ok).toBe(false);
    expect(r.erreur).toBe("date invalide");
    // Un refus de validation ne doit pas encombrer la file : il ne passera jamais.
    expect(m.nbActionsEnAttente()).toBe(0);
  });
});

describe("viderFile", () => {
  beforeEach(() => { installerStockage(); });

  it("envoie les saisies en attente et vide la file", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    await m.postOuFile("/api/heures", { heures: 8 });
    await m.postOuFile("/api/depenses", { montant: 120 });
    expect(m.nbActionsEnAttente()).toBe(2);

    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const r = await m.viderFile();
    expect(r).toMatchObject({ envoyees: 2, restantes: 0, abandonnees: 0 });
    expect(m.nbActionsEnAttente()).toBe(0);
  });

  it("abandonne un refus définitif au lieu de le rejouer pour l'éternité", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    await m.postOuFile("/api/heures", { heures: 8 });

    // 400 : la saisie ne passera jamais, on ne la remet pas en file.
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    const r = await m.viderFile();
    expect(r).toMatchObject({ envoyees: 0, restantes: 0, abandonnees: 1 });
    expect(m.nbActionsEnAttente()).toBe(0);
  });

  it("garde en file une panne serveur passagère (500)", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    await m.postOuFile("/api/heures", { heures: 8 });

    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const r = await m.viderFile();
    expect(r).toMatchObject({ envoyees: 0, restantes: 1, abandonnees: 0 });
    expect(m.nbActionsEnAttente()).toBe(1);
  });

  it("abandonne après 10 essais infructueux", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    await m.postOuFile("/api/heures", { heures: 8 });

    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    for (let i = 0; i < 9; i++) await m.viderFile();
    expect(m.nbActionsEnAttente()).toBe(1);
    const r = await m.viderFile();
    expect(r.abandonnees).toBe(1);
    expect(m.nbActionsEnAttente()).toBe(0);
  });

  it("deux vidages simultanés n'envoient PAS la saisie deux fois", async () => {
    const m = await chargerModule();
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    await m.postOuFile("/api/heures", { heures: 8 });

    let appels = 0;
    (globalThis as any).fetch = vi.fn().mockImplementation(async () => {
      appels++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    // C'est le scénario réel : l'événement « online » et la minuterie partent ensemble.
    const [a, b] = await Promise.all([m.viderFile(), m.viderFile()]);
    expect(appels).toBe(1);
    expect(a.envoyees + b.envoyees).toBe(1);
    expect(m.nbActionsEnAttente()).toBe(0);
  });
});

describe("activerMoniteurOffline", () => {
  beforeEach(() => { installerStockage(); });

  it("un seul moniteur par onglet, et il s'arrête proprement", async () => {
    const m = await chargerModule();
    const ecouteurs: any[] = [];
    (globalThis as any).window = {
      addEventListener: (n: string, f: any) => ecouteurs.push([n, f]),
      removeEventListener: (n: string, f: any) => {
        const i = ecouteurs.findIndex(([a, b]) => a === n && b === f);
        if (i >= 0) ecouteurs.splice(i, 1);
      },
    };
    // `navigator` n'est pas réassignable en Node : on le redéfinit.
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

    // Navigation se remonte à chaque navigation : 3 montages ne doivent poser qu'un
    // moniteur, sinon chaque saisie hors-ligne partait autant de fois qu'il y en avait.
    const stop1 = m.activerMoniteurOffline();
    m.activerMoniteurOffline();
    m.activerMoniteurOffline();
    expect(ecouteurs.length).toBe(1);

    stop1();
    expect(ecouteurs.length).toBe(0);
    // Après l'arrêt, un nouveau montage repose bien un moniteur.
    const stop2 = m.activerMoniteurOffline();
    expect(ecouteurs.length).toBe(1);
    stop2();
  });
});
