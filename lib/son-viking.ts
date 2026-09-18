// Corne viking synthétisée (Web Audio) — aucun fichier à charger, marche hors ligne.
// Deux notes : un appel grave qui enfle, puis la quinte au-dessus. ~2,2 s, volume modéré.
//
// Autoplay : les navigateurs bloquent le son tant que l'utilisateur n'a pas touché la page
// (iOS toujours ; Chrome tant que le site n'a pas d'« engagement », sauf PWA installée).
// `jouerCorneViking()` renvoie false si le son a été bloqué — l'appelant peut alors rejouer
// au premier toucher.

let contexte: AudioContext | null = null;

function obtenirContexte(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!contexte) contexte = new Ctor();
  return contexte;
}

function note(ctx: AudioContext, sortie: AudioNode, debut: number, duree: number, frequence: number, volume: number) {
  const filtre = ctx.createBiquadFilter();
  filtre.type = "lowpass";
  filtre.Q.value = 1.5;
  filtre.frequency.setValueAtTime(frequence * 3, debut);
  filtre.frequency.exponentialRampToValueAtTime(frequence * 9, debut + duree * 0.4);
  filtre.frequency.exponentialRampToValueAtTime(frequence * 4, debut + duree);
  filtre.connect(sortie);

  const enveloppe = ctx.createGain();
  enveloppe.gain.setValueAtTime(0.0001, debut);
  enveloppe.gain.exponentialRampToValueAtTime(volume, debut + duree * 0.22);   // enfle
  enveloppe.gain.setValueAtTime(volume, debut + duree * 0.7);
  enveloppe.gain.exponentialRampToValueAtTime(0.0001, debut + duree);           // s'éteint
  enveloppe.connect(filtre);

  // Trois oscillateurs légèrement désaccordés = timbre de cuivre rugueux, pas de bip.
  const couches: [OscillatorType, number, number][] = [["sawtooth", 1, 0.55], ["sawtooth", 1.003, 0.45], ["square", 0.5, 0.35]];
  for (const [type, mult, gain] of couches) {
    const osc = ctx.createOscillator();
    osc.type = type;
    // Léger glissando vers le haut au départ, comme un souffle qui prend.
    osc.frequency.setValueAtTime(frequence * mult * 0.96, debut);
    osc.frequency.exponentialRampToValueAtTime(frequence * mult, debut + duree * 0.25);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(enveloppe);
    osc.start(debut);
    osc.stop(debut + duree + 0.05);
  }
}

/** Joue la corne. Résout true si le son est parti, false s'il a été bloqué ou indisponible. */
export async function jouerCorneViking(): Promise<boolean> {
  const ctx = obtenirContexte();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch { /* on vérifie l'état juste après */ }
  if (ctx.state !== "running") return false;

  const t = ctx.currentTime + 0.02;
  const maitre = ctx.createGain();
  maitre.gain.value = 0.28;
  maitre.connect(ctx.destination);

  note(ctx, maitre, t, 1.15, 98, 1);          // sol grave (G2) : l'appel
  note(ctx, maitre, t + 0.95, 1.3, 147, 0.9); // ré (D3), la quinte : la réponse
  return true;
}
