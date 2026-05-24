# 🎬 Script de démo — Soumissions Xpress

## Avant la présentation (5 min de prep)

1. **Démarrer le serveur** dans une fenêtre PowerShell :
   ```
   cd C:\Users\Utilisateur\soumissions-xpress
   npm run dev
   ```
   Attends que tu voies `Ready in X.Xs`

2. **Ouvrir Chrome ou Edge** (pas Safari/Firefox, pour la reconnaissance vocale)

3. **Aller à http://localhost:3000/dashboard**

4. **Cliquer "✨ Charger les données démo"** → toast vert confirme 5 soumissions + 4 jobs biblio

5. **Vérifier** : KPIs remplis, pipeline visible, dashboard vivant

6. **Avoir un PDF Hover prêt** sur le bureau pour la démo (ton vrai PDF Hover idéalement)

7. **Avoir 2-3 photos d'une maison** prêtes pour l'agent vision

---

## Démo (15-20 min)

### Acte 1 — Le problème (1 min)
> *"Je fais des soumissions de revêtement extérieur. Aujourd'hui, je passe 2-3h par soumission entre mesurer, choisir les matériaux, calculer les prix, écrire le contrat. Et chaque erreur d'estimation = perte. J'ai bâti une app qui fait ça en 10 minutes."*

### Acte 2 — Dashboard d'accueil (2 min)
**Ouvre `/dashboard`**
- **"Voici ma vue d'ensemble"** → pointer KPIs
- **"5 soumissions ce mois, 142 000$ soumissionnés, 24 500$ acceptés"**
- **"Mon taux de conversion : pointer le %"**
- **"Pipeline par statut : 1 brouillon, 1 envoyée, 1 acceptée, 1 refusée, 1 facturée"**
- **Cliquer "Acceptée" dans le pipeline** → bascule vers liste filtrée
- **Revenir dashboard avec ←**

### Acte 3 — Nouvelle soumission (3 min)
**Cliquer ➕ Nouvelle**
- **"Je commence avec un client : nom, adresse, téléphone"** → tape rapidement
- **Section "Type de revêtement"** : *"7 presets — clic sur 'Vinyle - Complet'"*
- **9 matériaux apparaissent en bas** → pointer
- **Entre 2400 dans le 1er** (parement) → *"sommaire à droite calcule en temps réel : 25 000$"*
- **Encadré "✓ Auto-sauvé"** apparaît → *"si je ferme l'onglet, je perds rien"*

### Acte 4 — Agent vision multi-photos (3 min) ⭐ WOW
**Scroller à la section 📸 1bis cyan**
- **"Pas de rapport Hover ? Pas de problème"**
- **Référence d'échelle** : tape `Porte de garage double 16'`
- **Upload 2-3 photos** d'une maison
- **Description** : `Maison 2 étages avec fronton avant, parement vinyle à remplacer`
- **Clic "🔍 Analyser"** → attendre 30-60 sec en parlant : *"L'IA regarde, identifie les matériaux, compte les fenêtres, mesure par proportions avec ma référence"*
- **Résultat** → pointer mesures + confiance + recommandations
- **"Précision ~85% — assez pour estimer au téléphone. Pour la commande finale, j'utilise Hover."**

### Acte 5 — Auto-estimateur ⭐ WOW (3 min)
**Toujours dans la même soumission, cliquer "✨ Construire automatiquement"**
- **"L'IA va choisir les matériaux exacts du catalogue, calculer les quantités, et même aller vérifier les prix sur Internet pour les items incertains"**
- **Attendre ~20-40 sec**
- **Résultat affiche** : stratégie, 11 lignes générées, heures estimées, vérifications web
- **"Tout est rempli automatiquement. Je n'ai rien fait."**

### Acte 6 — Notes vocales ⭐ WOW (3 min)
**Clic bouton micro violet flottant bas droite**
- **Démarrer** → parle clairement :
  > *"Le pignon avant est plus complexe que prévu, ajoute 5 heures de plus. Et pas d'espace pour l'échafaudage, va falloir le déplacer 4 fois, mets 6 heures de plus."*
- **Arrêter** → texte transcrit visible
- **"✨ Analyser et appliquer"**
- **"L'IA a compris : 2 ajustements appliqués automatiquement"**
- **Le sommaire à droite a augmenté** → pointer

### Acte 7 — PDF + sauvegarde + suivi (2 min)
**Bouton 📄 PDF** → télécharge le PDF Xpress formaté → *"prêt à envoyer au client"*
**Bouton 🛒 Commande** → *"bon de commande matériaux par fournisseur, pour envoyer à mes reps Gentek, MAC, Maibec"*
**Bouton ✉️ Email** → ouvre Outlook/Gmail avec message pré-rédigé → *"un clic pour envoyer au client"*
**Bouton 💾 Sauver** → toast confirme numéro XP-AAAAMMJJ-XXX
**Aller à /soumissions** → la nouvelle est dans la liste avec statut "Brouillon" → *"change le statut quand le client signe"*

### Acte 8 — Bibliothèque + apprentissage (2 min)
**Aller à /bibliotheque**
- **"4 jobs déjà passées en référence. Chaque fois que je fais une nouvelle estimation, l'IA compare aux jobs similaires"**
- **Pointer notes chantier** : *"Pignon complexe", "Accès difficile"* — *"l'IA apprend mes patterns"*
- **"Plus j'en mets, plus c'est précis. Sur 6 mois je vais avoir 50+ jobs de référence"*

### Acte 9 — Mobile (1 min) 
**Sortir le téléphone OU réduire la fenêtre du navigateur**
- **"L'app est responsive — je peux soumissionner depuis le chantier"**
- **Pointer bottom nav 4 icônes + menu hamburger + bouton actions**

### Conclusion (1 min)
> *"En résumé : 15 minutes au lieu de 2-3 heures par soumission. L'IA fait le gros du travail. Je polis et j'envoie. À 5-10 soumissions par mois, c'est 50-100h économisées."*

---

## Points faibles à ne PAS pointer
- ⚠️ La précision de l'agent vision est ~85% (mentionner SEULEMENT si question posée)
- ⚠️ Hover reste payant (~$25-50 US par rapport) — *positive spin* : "complémentaire"
- ⚠️ Maibec : prix au catalogue sont indicatifs, à confirmer avec rep
- ⚠️ Pas encore déployé sur Vercel — *positive spin* : "version 1 locale, déploiement mobile prévu"

## Si on me demande...

**Q : Combien ça a coûté à bâtir ?**
> "Bâti avec Claude (IA d'Anthropic), pas une équipe. Coût : ~50$ d'API la première semaine. Le coût marginal par soumission : 5-15 cents en API."

**Q : C'est compatible avec mon comptable / QuickBooks ?**
> "Pas encore, mais c'est dans le plan v2 — intégration QuickBooks pour générer la facture automatiquement quand le client accepte."

**Q : Est-ce que je peux l'utiliser sur Mac / iPad ?**
> "Pour l'instant c'est sur PC. Une fois déployé sur Vercel, ça marche partout (téléphone, tablette, Mac). On y arrive bientôt."

**Q : Tes prix Gentek/MAC sont à jour ?**
> "Mai 2026 — je peux uploader un nouveau PDF du fournisseur n'importe quand, l'app le met à jour. La vérification web confirme en temps réel."

**Q : Qu'est-ce qui empêche un compétiteur de copier ?**
> "Le catalogue spécifique à mon business, mes rendements MO réels, ma bibliothèque de jobs passées. Plus j'en accumule, plus l'IA estime juste pour MOI. C'est un avantage cumulatif."

---

## En cas de pépin

**Le serveur crashe** :
```
Ctrl+C
npm run dev
```

**L'IA répond pas** :
- Vérifie internet
- Vérifie la clé Anthropic dans `.env.local`
- Console.anthropic.com → vérifie le solde de crédits

**Tout est cassé** :
- Reset les données : aller dashboard → "🗑 Effacer toutes les données" (en bas)
- Recharger démo : "✨ Charger les données démo"
- Refresh la page

**Le micro marche pas** :
- Utiliser Chrome ou Edge (pas Safari/Firefox)
- Donner permission au micro dans le navigateur
- Vérifier que le langage est `fr-CA`
