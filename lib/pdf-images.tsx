import { Document, Page, Image, StyleSheet, pdf } from "@react-pdf/renderer";

// Combine plusieurs images (dataURL) en un seul PDF — une page par photo.
// Sert aux factures trop grandes photographiées en plusieurs morceaux.
const styles = StyleSheet.create({
  page: { padding: 14, backgroundColor: "#ffffff" },
  img: { objectFit: "contain", width: "100%", height: "100%" },
});

function ImagesDoc({ images }: { images: string[] }) {
  return (
    <Document>
      {images.map((src, i) => (
        <Page key={i} size="A4" style={styles.page}>
          <Image src={src} style={styles.img} />
        </Page>
      ))}
    </Document>
  );
}

/** Génère un PDF (dataURL) à partir d'une liste d'images dataURL. */
export async function imagesVersPdfDataUrl(images: string[]): Promise<string> {
  const blob = await pdf(<ImagesDoc images={images} />).toBlob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Lecture du PDF échouée"));
    r.readAsDataURL(blob);
  });
}
