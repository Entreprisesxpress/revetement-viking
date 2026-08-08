// Certificat d'authentification de signature électronique — l'équivalent maison du
// « Certificate of Completion » de DocuSign. Rassemble en une pièce unique la preuve de
// transmission (envoi, consultation), la preuve de consentement (signature, IP, horodatage)
// et la preuve d'intégrité (empreinte SHA-256 scellée à la signature puis recalculée).
import { Document, Page, Text, View, StyleSheet, pdf, Image } from "@react-pdf/renderer";
import { ENTREPRISE, LogoSvg } from "@/lib/pdf-contrat";

export type VerdictIntegrite = "CONFORME" | "DIVERGENCE" | "NON_SCELLE";

export interface CertificatData {
  numero: string;
  token: string;
  client_nom?: string;
  client_courriel?: string;
  // Signature
  signature_nom?: string;
  signature_date?: string;
  signature_ip?: string;
  signature_user_agent?: string;
  signature_image?: string;
  // Chronologie
  date_creation?: string;
  cree_par?: string;
  date_envoye?: string;
  courriel_destinataire?: string;
  courriel_message_id?: string;
  date_vue?: string;
  ip_vue?: string;
  date_signe_envoye?: string;
  signe_destinataire?: string;
  // Intégrité
  empreinte_scellee?: string;
  empreinte_actuelle?: string;
  verdict: VerdictIntegrite;
  genere_le: string;
}

const BLEU = "#1e3a5f";
const TEXTE = "#1e293b";
const GRIS = "#64748b";
const GRIS_CLAIR = "#94a3b8";
const VERT = "#047857";
const ROUGE = "#b91c1c";
const AMBRE = "#b45309";

const s = StyleSheet.create({
  page: { paddingTop: 68, paddingBottom: 62, paddingHorizontal: 46, fontSize: 9.5, fontFamily: "Helvetica", color: TEXTE, lineHeight: 1.45 },

  enTete: { position: "absolute", top: 24, left: 46, right: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 7, borderBottom: "1.5pt solid " + BLEU },
  enTeteLogo: { flexDirection: "row", alignItems: "center", gap: 8 },
  enTeteTitre: { fontSize: 10.5, fontWeight: 700, color: BLEU },
  enTeteSous: { fontSize: 7.5, color: GRIS },

  titre: { fontSize: 17, fontWeight: 700, color: BLEU, marginBottom: 2 },
  sousTitre: { fontSize: 9, color: GRIS, marginBottom: 14 },

  h2: { fontSize: 10.5, fontWeight: 700, color: TEXTE, marginTop: 13, marginBottom: 6, paddingBottom: 3, borderBottom: "0.75pt solid " + TEXTE },

  ligne: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5pt solid #e2e8f0" },
  cle: { width: 132, fontSize: 8.5, color: GRIS },
  val: { flex: 1, fontSize: 9.5 },
  valGras: { flex: 1, fontSize: 9.5, fontWeight: 700 },

  // Bandeau du verdict d'intégrité
  verdictBoite: { padding: 10, borderRadius: 3, marginTop: 6, marginBottom: 4 },
  verdictTitre: { fontSize: 12, fontWeight: 700 },
  verdictTexte: { fontSize: 8.5, marginTop: 3, lineHeight: 1.5 },

  mono: { fontFamily: "Courier", fontSize: 8.5, letterSpacing: 0.4 },
  monoBloc: { backgroundColor: "#f1f5f9", padding: 6, marginTop: 3, marginBottom: 2 },

  // Chronologie
  evt: { flexDirection: "row", marginTop: 7 },
  evtPuce: { width: 15, fontSize: 10 },
  evtCorps: { flex: 1, borderLeft: "1.5pt solid #cbd5e1", paddingLeft: 9, paddingBottom: 4 },
  evtNom: { fontSize: 9.5, fontWeight: 700 },
  evtQuand: { fontSize: 8.5, color: TEXTE, marginTop: 1 },
  evtDetail: { fontSize: 8, color: GRIS, marginTop: 1 },
  evtAbsent: { fontSize: 8.5, color: GRIS_CLAIR, fontStyle: "italic", marginTop: 1 },

  sigCadre: { borderTop: "1pt solid " + BLEU, marginTop: 6, paddingTop: 5, width: 250 },

  avis: { marginTop: 14, padding: 9, backgroundColor: "#f8fafc", borderLeft: "3pt solid " + BLEU },
  avisTitre: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
  avisTexte: { fontSize: 7.5, color: "#475569", lineHeight: 1.55 },

  pied: { position: "absolute", bottom: 24, left: 46, right: 46, paddingTop: 7, borderTop: "0.5pt solid #e2e8f0", flexDirection: "row", justifyContent: "space-between" },
  piedTxt: { fontSize: 6.5, color: GRIS_CLAIR },
});

/** Horodatage complet en heure de l'Est (Montréal) — un certificat doit être sans ambiguïté
 *  sur le fuseau, les dates sont stockées en UTC. */
export function horodatage(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  try {
    const s = d.toLocaleString("fr-CA", {
      timeZone: "America/Toronto",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    return `${s} (heure de l'Est)`;
  } catch { return d.toISOString(); }
}

/** Coupe l'empreinte en blocs lisibles (64 hex d'un bloc est illisible et intransposable). */
function empreinteLisible(hex?: string): string {
  if (!hex) return "—";
  return (hex.match(/.{1,8}/g) || [hex]).join(" ");
}

const Ligne = ({ k, v, gras }: { k: string; v?: string; gras?: boolean }) => (
  <View style={s.ligne}>
    <Text style={s.cle}>{k}</Text>
    <Text style={gras ? s.valGras : s.val}>{v || "—"}</Text>
  </View>
);

const Evenement = ({ puce, nom, quand, details, absent }: {
  puce: string; nom: string; quand?: string; details?: (string | undefined)[]; absent?: string;
}) => (
  <View style={s.evt} wrap={false}>
    <Text style={s.evtPuce}>{puce}</Text>
    <View style={s.evtCorps}>
      <Text style={s.evtNom}>{nom}</Text>
      {quand ? <Text style={s.evtQuand}>{quand}</Text> : <Text style={s.evtAbsent}>{absent || "Non enregistré"}</Text>}
      {quand && (details || []).filter(Boolean).map((d, i) => <Text key={i} style={s.evtDetail}>{d}</Text>)}
    </View>
  </View>
);

export function CertificatPDF({ c }: { c: CertificatData }) {
  const conforme = c.verdict === "CONFORME";
  const divergent = c.verdict === "DIVERGENCE";
  const couleurVerdict = conforme ? VERT : divergent ? ROUGE : AMBRE;
  const fondVerdict = conforme ? "#ecfdf5" : divergent ? "#fef2f2" : "#fffbeb";
  const titreVerdict = conforme ? "DOCUMENT CONFORME" : divergent ? "DIVERGENCE DÉTECTÉE" : "EMPREINTE NON SCELLÉE";
  const texteVerdict = conforme
    ? "L'empreinte numérique recalculée sur le document archivé est identique à celle scellée au moment de la signature. Le contrat signé n'a subi aucune modification, même d'un seul octet, depuis sa signature."
    : divergent
      ? "L'empreinte recalculée NE correspond PAS à celle scellée lors de la signature. Le document archivé a été modifié après la signature. Ce certificat ne peut pas attester de son intégrité."
      : "Ce contrat a été signé avant la mise en place du scellement d'empreinte. La chronologie ci-dessous reste valide, mais l'intégrité du fichier ne peut pas être vérifiée automatiquement.";

  const EnTete = () => (
    <View style={s.enTete} fixed>
      <View style={s.enTeteLogo}>
        <LogoSvg size={24} />
        <View>
          <Text style={s.enTeteTitre}>REVÊTEMENT VIKING INC.</Text>
          <Text style={s.enTeteSous}>Certificat d'authentification — contrat n° {c.numero}</Text>
        </View>
      </View>
      <Text style={s.enTeteSous} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );

  const Pied = () => (
    <View style={s.pied} fixed>
      <Text style={s.piedTxt}>{ENTREPRISE.nom} · RBQ {ENTREPRISE.rbq} · {ENTREPRISE.courriel}</Text>
      <Text style={s.piedTxt}>Certificat émis le {horodatage(c.genere_le)}</Text>
    </View>
  );

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <EnTete />

        <Text style={s.titre}>Certificat d'authentification</Text>
        <Text style={s.sousTitre}>Signature électronique — preuve de transmission, de consentement et d'intégrité</Text>

        {/* ===== 1. DOSSIER ===== */}
        <Text style={s.h2}>1. Dossier</Text>
        <Ligne k="Contrat" v={`N° ${c.numero}`} gras />
        <Ligne k="Client" v={c.client_nom} />
        <Ligne k="Identifiant du dossier" v={c.token} />
        <Ligne k="Certificat émis le" v={horodatage(c.genere_le)} />

        {/* ===== 2. INTÉGRITÉ ===== */}
        <Text style={s.h2}>2. Intégrité du document signé</Text>
        <View style={[s.verdictBoite, { backgroundColor: fondVerdict, border: `1pt solid ${couleurVerdict}` }]}>
          <Text style={[s.verdictTitre, { color: couleurVerdict }]}>{titreVerdict}</Text>
          <Text style={s.verdictTexte}>{texteVerdict}</Text>
        </View>
        <Text style={{ fontSize: 8, color: GRIS, marginTop: 6 }}>Empreinte SHA-256 scellée au moment de la signature</Text>
        <View style={s.monoBloc}><Text style={s.mono}>{empreinteLisible(c.empreinte_scellee)}</Text></View>
        <Text style={{ fontSize: 8, color: GRIS, marginTop: 4 }}>Empreinte SHA-256 recalculée sur la pièce archivée, à l'émission de ce certificat</Text>
        <View style={s.monoBloc}><Text style={s.mono}>{empreinteLisible(c.empreinte_actuelle)}</Text></View>

        {/* ===== 3. PARTIES ===== */}
        <Text style={s.h2}>3. Parties</Text>
        <Ligne k="Entrepreneur" v={ENTREPRISE.nom} gras />
        <Ligne k="Licence RBQ" v={ENTREPRISE.rbq} />
        <Ligne k="Adresse" v={`${ENTREPRISE.adresse}, ${ENTREPRISE.ville} ${ENTREPRISE.code_postal}`} />
        <Ligne k="Courriel" v={ENTREPRISE.courriel} />
        <View style={{ height: 6 }} />
        <Ligne k="Signataire" v={c.signature_nom} gras />
        <Ligne k="Courriel du client" v={c.client_courriel} />
        <Ligne k="Adresse IP à la signature" v={c.signature_ip} />
        <Ligne k="Navigateur utilisé" v={c.signature_user_agent} />

        <Pied />
      </Page>

      {/* ===== PAGE 2 : CHRONOLOGIE + SIGNATURE ===== */}
      <Page size="LETTER" style={s.page}>
        <EnTete />

        <Text style={s.h2}>4. Chronologie des événements</Text>
        <Text style={{ fontSize: 8, color: GRIS, marginBottom: 2 }}>
          Tous les horodatages sont enregistrés automatiquement par le serveur au moment où l'événement se produit.
        </Text>

        <Evenement
          puce="1."
          nom="Contrat créé"
          quand={c.date_creation ? horodatage(c.date_creation) : undefined}
          details={[c.cree_par ? `Créé par : ${c.cree_par}` : undefined]}
        />
        <Evenement
          puce="2."
          nom="Contrat transmis au client par courriel"
          quand={c.date_envoye ? horodatage(c.date_envoye) : undefined}
          details={[
            c.courriel_destinataire ? `Destinataire : ${c.courriel_destinataire}` : undefined,
            c.courriel_message_id ? `Identifiant du message : ${c.courriel_message_id}` : undefined,
          ]}
          absent="Aucun envoi par courriel enregistré (lien possiblement transmis autrement)"
        />
        <Evenement
          puce="3."
          nom="Contrat consulté par le client"
          quand={c.date_vue ? horodatage(c.date_vue) : undefined}
          details={[c.ip_vue ? `Adresse IP : ${c.ip_vue}` : undefined, "Première ouverture du lien sécurisé"]}
          absent="Aucune consultation enregistrée avant la signature"
        />
        <Evenement
          puce="4."
          nom="Contrat signé électroniquement"
          quand={c.signature_date ? horodatage(c.signature_date) : undefined}
          details={[
            c.signature_nom ? `Signé par : ${c.signature_nom}` : undefined,
            c.signature_ip ? `Adresse IP : ${c.signature_ip}` : undefined,
            "Document PDF scellé par empreinte SHA-256 immédiatement après la signature",
          ]}
          absent="Contrat non signé à ce jour"
        />
        <Evenement
          puce="5."
          nom="Dossier signé transmis au client"
          quand={c.date_signe_envoye ? horodatage(c.date_signe_envoye) : undefined}
          details={[c.signe_destinataire ? `Destinataire : ${c.signe_destinataire}` : undefined, "Contrat signé + présent certificat"]}
          absent="Pas encore transmis"
        />

        {/* ===== 5. SIGNATURE ===== */}
        <Text style={s.h2}>5. Signature recueillie</Text>
        {c.signature_image ? (
          <View wrap={false}>
            <Image src={c.signature_image} style={{ width: 210, height: 62, marginTop: 4 }} />
            <View style={s.sigCadre}>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: BLEU }}>{c.signature_nom || "—"}</Text>
              <Text style={{ fontSize: 8.5, color: GRIS, marginTop: 1 }}>Signé le {horodatage(c.signature_date)}</Text>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 9, color: GRIS_CLAIR, fontStyle: "italic" }}>Aucune signature enregistrée.</Text>
        )}

        {/* ===== AVIS ===== */}
        <View style={s.avis}>
          <Text style={s.avisTitre}>Portée du présent certificat</Text>
          <Text style={s.avisTexte}>
            Ce certificat atteste des éléments techniques consignés automatiquement par le système de {ENTREPRISE.nom} lors
            de la transmission et de la signature du contrat n° {c.numero} : horodatages serveur, adresses IP, identité déclarée
            du signataire et empreinte cryptographique du document.
            {"\n\n"}
            L'empreinte SHA-256 est calculée sur le fichier PDF signé au moment exact de la signature, puis conservée séparément
            du fichier. Recalculer cette empreinte sur la pièce archivée et la comparer à celle scellée permet de démontrer que
            le document n'a pas été altéré depuis : toute modification, même d'un seul caractère, produit une empreinte
            entièrement différente.
            {"\n\n"}
            La signature est recueillie dans le cadre de la Loi concernant le cadre juridique des technologies de l'information
            (RLRQ, c. C-1.1). Le présent document est un relevé technique et ne constitue pas un avis juridique.
          </Text>
        </View>

        <Pied />
      </Page>
    </Document>
  );
}

export async function genererCertificatBuffer(c: CertificatData): Promise<Buffer> {
  const blob = await pdf(<CertificatPDF c={c} />).toBlob();
  return Buffer.from(await blob.arrayBuffer());
}
