// Compression d'images côté navigateur AVANT upload (réduit 4 MB → 200 KB typique)
// Réencode en JPEG q=0.82, redimensionne au maximum 1600px côté le plus long.

export async function compresserImage(file: File, opts: { maxDim?: number; quality?: number; maxBytes?: number } = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;
  const maxBytes = opts.maxBytes ?? 250_000;
  if (!file.type.startsWith("image/")) return file;
  // Si déjà sous le seuil, ne touche pas
  if (file.size <= maxBytes) return file;

  const bitmap = await createImageBitmap(file).catch(async () => {
    // Fallback navigateurs sans createImageBitmap : passe par <img>
    return await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img as any);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  });

  const w = (bitmap as any).width || (bitmap as any).naturalWidth;
  const h = (bitmap as any).height || (bitmap as any).naturalHeight;
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  const nw = Math.round(w * ratio);
  const nh = Math.round(h * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap as any, 0, 0, nw, nh);

  let q = quality;
  let blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", q));
  // Si encore trop gros, réduit quality progressivement
  while (blob.size > maxBytes && q > 0.4) {
    q -= 0.1;
    blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", q));
  }
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() });
}

/** Compresse en parallèle une liste de fichiers. Ignore les non-images. */
export async function compresserListe(files: File[] | FileList): Promise<File[]> {
  const arr = Array.from(files);
  return Promise.all(arr.map((f) => compresserImage(f).catch(() => f)));
}
