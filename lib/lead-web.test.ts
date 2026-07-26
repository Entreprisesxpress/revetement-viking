import { describe, it, expect } from "vitest";
import { parserTexteFormulaire } from "./lead-web";

describe("parserTexteFormulaire (courriels de formulaire web)", () => {
  it("format GoDaddy « Étiquette: valeur »", () => {
    const r = parserTexteFormulaire(`
Nom: Julie Arsenault
Courriel: julie@exemple.ca
Téléphone: 450-555-1234
Message: J'aimerais une soumission pour du Maibec.
Merci beaucoup!
`);
    expect(r.nom).toBe("Julie Arsenault");
    expect(r.courriel).toBe("julie@exemple.ca");
    expect(r.telephone).toBe("450-555-1234");
    expect(r.message).toContain("soumission pour du Maibec");
    expect(r.message).toContain("Merci beaucoup!");
  });

  it("format anglais + étiquette sur sa propre ligne", () => {
    const r = parserTexteFormulaire(`Name: John Smith
Email
john@ex.com

Phone Number: (514) 555-9999
Comments
Need new siding
on a 2-storey house`);
    expect(r.nom).toBe("John Smith");
    expect(r.courriel).toBe("john@ex.com");
    expect(r.telephone).toBe("(514) 555-9999");
    expect(r.message).toBe("Need new siding\non a 2-storey house");
  });

  it("filets : courriel et téléphone trouvés dans du texte libre", () => {
    const r = parserTexteFormulaire("Bonjour, rappelez-moi au 514.555.0000 ou écrivez à marc+web@site.qc.ca svp");
    expect(r.courriel).toBe("marc+web@site.qc.ca");
    expect(r.telephone).toBe("514.555.0000");
  });

  it("texte vide → objet vide (pas de plantage)", () => {
    expect(parserTexteFormulaire("")).toEqual({});
  });

  it("courriel TRANSFÉRÉ : ne prend JAMAIS la signature de l'entreprise (cas réel)", () => {
    const r = parserTexteFormulaire(`*Francis Quinchon*
*Entreprises Xpress Inc.*
*T : **438-407-8890 *| info@entreprisesxpress.ca
---------- Message transféré ---------
De : Julie Ares <julie@murmurinterieurs.com>
Objet : Demande de soumission-Projet SDB
Elizabeth Lockhart Lamontagne elizabethlockhartlamontagne@gmail.com
Élizabeth Lockhart Lamontagne 514-433-5237`);
    expect(r.courriel).toBe("julie@murmurinterieurs.com"); // premier courriel EXTERNE
    expect(r.telephone).toBe("514-433-5237");              // premier téléphone EXTERNE
  });
});
