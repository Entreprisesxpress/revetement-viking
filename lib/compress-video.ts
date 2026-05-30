// Compression vidéo côté navigateur via MediaRecorder + Canvas.
// Réencode la vidéo à plus basse résolution (720p max), bitrate réduit.
// Marche sur Chrome/Edge desktop + Android (iOS Safari limité).
//
// Stratégie :
// 1. <video> joue la source en mémoire (muet, hidden)
// 2. À chaque frame on copie sur un canvas réduit
// 3. canvas.captureStream() → MediaRecorder → Blob webm/mp4

interface OptsVideo {
  maxDim?: number;           // 720 par défaut (côté le plus long)
  bitrateBps?: number;       // 1.5 Mbps par défaut (vs ~30 Mbps en 4K)
  onProgress?: (pct: number) => void;
}

export async function compresserVideo(file: File, opts: OptsVideo = {}): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  const maxDim = opts.maxDim ?? 720;
  const bitrate = opts.bitrateBps ?? 1_500_000;

  // Vérif support navigateur
  const mimeSortie =
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" :
    MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" :
    MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
  if (!mimeSortie || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder non supporté — utilise Chrome/Edge");
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Lecture vidéo impossible"));
  });

  const ratio = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round(video.videoWidth * ratio) & ~1;  // pair
  const h = Math.round(video.videoHeight * ratio) & ~1;
  const duree = video.duration;

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Stream depuis canvas
  const stream = (canvas as any).captureStream(30) as MediaStream;
  // Audio
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(dest); src.connect(audioCtx.destination);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch {}

  const chunks: BlobPart[] = [];
  const rec = new MediaRecorder(stream, { mimeType: mimeSortie, videoBitsPerSecond: bitrate });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  return await new Promise<File>((resolve, reject) => {
    rec.onstop = () => {
      URL.revokeObjectURL(url);
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(new File([blob], file.name.replace(/\.\w+$/, ".webm"), { type: "video/webm", lastModified: Date.now() }));
    };
    rec.onerror = (e: any) => reject(e?.error || new Error("Erreur compression"));
    rec.start(1000);

    video.play().catch(reject);

    let dernierTick = 0;
    const tick = () => {
      if (video.ended || video.paused) { rec.stop(); return; }
      ctx.drawImage(video, 0, 0, w, h);
      const t = video.currentTime;
      if (opts.onProgress && t - dernierTick > 0.5) {
        dernierTick = t;
        opts.onProgress(Math.min(99, Math.round((t / duree) * 100)));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
