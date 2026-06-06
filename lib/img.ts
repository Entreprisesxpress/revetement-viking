// Compression image côté client avant upload
// Réduit drastiquement taille + temps d'upload (5MB → ~300-500 ko)
//
// Robuste iOS : sur iPhone (photos HEIC/12MP), l'ancien chemin <img> + toDataURL
// produisait souvent une image BLANCHE (canvas pas prêt / limite mémoire iOS) et
// toDataURL pouvait échouer. On décode désormais via createImageBitmap (gère les
// gros fichiers + l'orientation EXIF) avec repli <img> + img.decode(), et on exporte
// via canvas.toBlob (bien plus fiable que toDataURL sur iOS Safari).

const MAX_DIMENSION = 1600; // largeur ou hauteur max
const QUALITE = 0.82; // JPEG quality 0-1
const MAX_OCTETS = 250_000; // 250 KB cible — si > on baisse la qualité progressivement

function lireDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/** Décode une image de façon robuste. createImageBitmap d'abord (rapide, peu de
 *  mémoire, applique l'orientation EXIF) ; repli <img>+decode() si indisponible
 *  ou si le format n'est pas géré par createImageBitmap (ex. HEIC sur certains iOS). */
async function decoderImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; fermer?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
      return { src: bmp, w: bmp.width, h: bmp.height, fermer: () => bmp.close?.() };
    } catch {
      // createImageBitmap a échoué (format non géré) → on tombe sur <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("decode")); });
    }
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("dimensions nulles");
    return { src: img, w, h, fermer: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error(
      `Image illisible (${file.type || "format inconnu"}). ` +
      "Si c'est une photo iPhone (HEIC), règle l'iPhone sur Réglages → Appareil photo → Formats → « Le plus compatible », ou convertis-la en JPEG avant de l'ajouter."
    );
  }
}

function dimensionsReduites(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (w <= maxDim && h <= maxDim) return { w, h };
  return w > h
    ? { w: maxDim, h: Math.round(h * (maxDim / w)) }
    : { w: Math.round(w * (maxDim / h)), h: maxDim };
}

function blobVersDataURL(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function canvasVersBlob(canvas: HTMLCanvasElement, mime: string, q: number): Promise<Blob | null> {
  return new Promise((res) => {
    if (canvas.toBlob) canvas.toBlob((b) => res(b), mime, q);
    else {
      // Très vieux navigateurs sans toBlob : repli toDataURL → Blob
      try {
        const url = canvas.toDataURL(mime, q);
        const bin = atob(url.split(",")[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res(new Blob([arr], { type: mime }));
      } catch { res(null); }
    }
  });
}

export async function compresserImage(file: File): Promise<string> {
  // PDF : on retourne tel quel en base64 (pas de compression)
  if (file.type === "application/pdf") return await lireDataURL(file);

  const { src, w, h, fermer } = await decoderImage(file);
  try {
    const dim = dimensionsReduites(w, h, MAX_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = dim.w; canvas.height = dim.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponible");
    ctx.drawImage(src, 0, 0, dim.w, dim.h);

    let q = QUALITE;
    let blob = await canvasVersBlob(canvas, "image/jpeg", q);
    while (blob && blob.size > MAX_OCTETS && q > 0.4) {
      q -= 0.1;
      blob = await canvasVersBlob(canvas, "image/jpeg", q);
    }
    if (!blob) throw new Error("Compression impossible");
    return await blobVersDataURL(blob);
  } finally {
    fermer?.();
  }
}

/** Détecte le support WebP du navigateur (encodage canvas). Mémoïsé. */
let _webpOk: boolean | null = null;
function supporteWebp(): boolean {
  if (_webpOk !== null) return _webpOk;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    _webpOk = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { _webpOk = false; }
  return _webpOk;
}

/** Génère une VIGNETTE (max 400px) — WebP si supporté (~40% plus léger que JPEG),
 *  sinon JPEG. Retourne null pour PDF/vidéos ou en cas d'échec (best-effort). */
export async function genererVignette(file: File, maxDim = 400, qualite = 0.6): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const { src, w, h, fermer } = await decoderImage(file);
    try {
      const dim = dimensionsReduites(w, h, maxDim);
      const canvas = document.createElement("canvas");
      canvas.width = dim.w; canvas.height = dim.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, dim.w, dim.h);
      const mime = supporteWebp() ? "image/webp" : "image/jpeg";
      const blob = await canvasVersBlob(canvas, mime, qualite);
      return blob ? await blobVersDataURL(blob) : null;
    } finally {
      fermer?.();
    }
  } catch {
    return null;
  }
}

/** Retourne la taille en ko d'une string base64 dataURL */
export function tailleBase64Ko(dataUrl: string): number {
  return Math.round((dataUrl.length * 0.75) / 1024);
}
