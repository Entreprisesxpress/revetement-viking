# Guide : Photos pour l'agent vision

## Précision attendue

| # Photos | Référence | Précision |
|---|---|---|
| 1 photo (façade avant) | Porte standard | ~70% |
| 3-4 photos (avant + côtés) | Porte de garage 9'/16' | ~85% |
| 5-6 photos (toutes faces) | Mètre ruban visible | ~90% |
| Photos angles obliques | Aucune ref claire | ~50% (à éviter) |

**Pour soumission préliminaire : OK.**
**Pour commande matériaux finale : utilise Hover.**

## Comment prendre les photos

### Règle d'or : une référence d'échelle dans chaque photo
- Porte de garage visible (tu donnes la largeur exacte 9' ou 16')
- Toi ou un assistant debout devant la maison (6 pi standard)
- Mètre ruban tendu sur 4 ou 8 pi sur la façade
- Voiture stationnée à côté (longueur ~15 pi)

### Angles à capturer
1. **Façade avant** — vue de face, pas en biais, dégager le terrain
2. **Côté gauche** — vue de face complète
3. **Côté droit** — vue de face complète
4. **Arrière** — si accessible
5. **Détail toiture/soffite** — pour voir la largeur du soffite et l'état
6. **Bonus** : zoom sur un coin avec mètre ruban

### Ce qu'il faut éviter
- Photos prises de très loin (perdues les détails)
- Photos en contre-jour (silhouettes)
- Angles très obliques (déforme les proportions)
- Photos avec véhicules/objets devant cachant le bas
- Photos pendant pluie/neige

## Comment utiliser l'agent dans l'app

1. Ouvre http://localhost:3000
2. Va dans la section **📸 1bis. Agent vision multi-photos** (encadré cyan)
3. **Référence d'échelle** : tape ta référence connue
   - Exemple : `Porte de garage double 16'`
   - Ou : `Façade avant exactement 38 pi`
   - Ou : `Hauteur étage 9'`
4. **Photos** : sélectionne 3-5 photos depuis ton téléphone/ordi
5. **Description** (optionnel) : ajoute du contexte
   - Exemple : `Maison 2 étages, garage à droite, fronton arrière, parement vinyle existant à remplacer`
6. Clique **🔍 Analyser les photos**
7. L'IA retourne :
   - Analyse visuelle (nb étages, type toit, garage, etc.)
   - Mesures par façade avec confiance
   - Totaux estimés (parement, fascia, soffite, etc.)
   - Limitations + photos manquantes recommandées
8. Choisis un préset (Vinyle/Maibec/MAC/Alu) → quantités auto-remplies
9. Clique **✨ Construire automatiquement** pour la soumission complète

## Si la confiance est <70%

L'IA va te suggérer quelles photos manquent. Ajoute-les et relance l'analyse. Ou utilise Hover pour cette job.
