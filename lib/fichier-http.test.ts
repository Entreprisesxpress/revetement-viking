import { describe, it, expect } from "vitest";
import { reponseFichier, typeAffichable, extensionDe } from "./fichier-http";

const octets = Buffer.from("<html><script>alert(1)</script></html>");

describe("fichiers servis : le type déclaré au dépôt ne décide jamais seul", () => {
  it("HTML et SVG ne sont JAMAIS rendus inline — téléchargés en octet-stream", () => {
    for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", "application/javascript"]) {
      const r = reponseFichier(octets, { type, nom: "piege.html" });
      expect(r.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(r.headers.get("Content-Disposition")).toMatch(/^attachment;/);
      expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });

  it("les photos, PDF et vidéos s'affichent inline avec leur vrai type", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"]) {
      const r = reponseFichier(octets, { type, nom: "x" });
      expect(r.headers.get("Content-Type")).toBe(type);
      expect(r.headers.get("Content-Disposition")).toMatch(/^inline;/);
    }
  });

  it("ignore les paramètres et la casse du type (« IMAGE/JPEG; charset=… »)", () => {
    expect(typeAffichable("IMAGE/JPEG; charset=binary")).toBe(true);
    expect(typeAffichable("text/HTML; charset=utf-8")).toBe(false);
    expect(typeAffichable(null)).toBe(false);
  });

  it("le cache est toujours privé (jamais un cache partagé)", () => {
    const r = reponseFichier(octets, { type: "image/png", nom: "x", cacheSecondes: 60 });
    expect(r.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(r.headers.get("Content-Length")).toBe(String(octets.length));
  });

  it("assainit le nom de fichier de l'en-tête (pas de guillemet ni de retour à la ligne)", () => {
    const r = reponseFichier(octets, { type: "application/pdf", nom: 'fac"ture\r\nX-Injecte: oui.pdf' });
    const cd = r.headers.get("Content-Disposition") || "";
    expect(cd).not.toContain('"fac"');
    expect(cd).not.toMatch(/[\r\n]/);
  });

  it("extensionDe : plausible et sans caractère spécial", () => {
    expect(extensionDe("image/jpeg")).toBe("jpeg");
    expect(extensionDe("image/svg+xml")).toBe("svg");
    expect(extensionDe("application/octet-stream")).toBe("octetstream");
    expect(extensionDe("")).toBe("bin");
    expect(extensionDe(null)).toBe("bin");
  });
});
