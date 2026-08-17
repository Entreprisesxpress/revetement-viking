import { useRef, useState, useCallback } from "react";

/** Verrou anti-double-soumission pour un bouton qui écrit.
 *
 *  Pourquoi un ref et pas seulement un état : `if (busy) return` avec un `useState` ne
 *  protège PAS de deux clics dans le même instant. Les deux gestionnaires s'exécutent
 *  avant que React n'ait re-rendu avec `busy = true`, et avant que l'attribut `disabled`
 *  du bouton ne s'applique — les deux passent donc la garde. Mesuré en direct : un
 *  double-clic sur « Ajouter la note » créait bien DEUX notes identiques en base.
 *  Un ref change tout de suite : le second clic est bloqué.
 *
 *  L'état `occupe` reste utile pour l'affichage (bouton grisé, libellé « … »).
 *
 *  Usage :
 *    const verrou = useVerrou();
 *    const envoyerFormulaire = () => verrou.executer(async () => { … });
 *    <button disabled={verrou.occupe}>…</button>
 */
export function useVerrou() {
  const enCours = useRef(false);
  const [occupe, setOccupe] = useState(false);

  /** Lance `action` si rien n'est déjà en cours. Retourne `false` si le geste a été
   *  ignoré parce qu'un envoi tournait déjà. */
  const executer = useCallback(async (action: () => Promise<void> | void): Promise<boolean> => {
    if (enCours.current) return false;
    enCours.current = true;
    setOccupe(true);
    try {
      await action();
      return true;
    } finally {
      enCours.current = false;
      setOccupe(false);
    }
  }, []);

  return { occupe, executer };
}
