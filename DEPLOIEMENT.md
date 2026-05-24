# Déploiement Soumissions Xpress

## Local (déjà fonctionnel)

```bash
cd C:/Users/Utilisateur/soumissions-xpress
npm run dev
```

Ouvre http://localhost:3000

## Configuration requise pour IA Vision + Vérif prix web

1. Crée un fichier `.env.local` à la racine du projet
2. Ajoute ta clé API Anthropic :
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-XXXXX
   ```
3. Obtiens-la sur https://console.anthropic.com/

Sans cette clé, seuls le calculateur, le PDF et la sauvegarde locale fonctionnent.

## Déploiement sur Vercel (accès mobile/chantier)

### Étape 1 — GitHub
1. Crée un compte GitHub si pas déjà fait
2. Crée un repo privé `soumissions-xpress`
3. Pousse le code :
   ```bash
   cd C:/Users/Utilisateur/soumissions-xpress
   git init
   git add .
   git commit -m "Initial"
   git branch -M main
   git remote add origin https://github.com/TON_USER/soumissions-xpress.git
   git push -u origin main
   ```

### Étape 2 — Vercel
1. Va sur https://vercel.com et connecte-toi avec GitHub
2. Clique "Add New Project" → importe `soumissions-xpress`
3. Dans **Environment Variables**, ajoute :
   - `ANTHROPIC_API_KEY` = ta clé
4. Clique "Deploy"

Tu auras une URL `https://soumissions-xpress.vercel.app` accessible de n'importe quel téléphone/PC.

### ⚠️ Important : SQLite et Vercel

Vercel est **serverless** — le fichier SQLite local ne persiste pas entre les requêtes. Pour la production cloud, il faut migrer vers une vraie base de données. Options :

- **Turso** (SQLite distribué, gratuit jusqu'à 9 GB) — quasi le même code, recommandé
- **Vercel Postgres** (intégré, gratuit petit usage)
- **Supabase** (Postgres gratuit + bonus auth)

Quand tu veux faire ce switch, dis-le-moi — je migre le code en 10 minutes.

**En attendant**, tu peux :
- Utiliser l'app en local depuis ton PC du bureau (sauvegarde fonctionne)
- Déployer sur Vercel pour l'usage chantier en **mode calculateur seulement** (sans persistance — chaque soumission est créée, calculée, PDF téléchargé, mais pas sauvegardée côté serveur)

## Structure du projet

```
soumissions-xpress/
├── app/
│   ├── page.tsx                  # UI principale (nouvelle soumission)
│   ├── soumissions/page.tsx      # Liste sauvegardées
│   └── api/
│       ├── soumissions/route.ts  # CRUD SQLite
│       ├── vision/route.ts       # IA Claude analyse images
│       └── prix-web/route.ts     # IA + web search vérif prix
├── data/
│   ├── materiaux-gentek.ts       # Catalogue Gentek (~60 items)
│   ├── materiaux-mac.ts          # Catalogue MAC (~50 items)
│   ├── materiaux.ts              # Catalogue unifié
│   ├── main-oeuvre.ts            # Taux 90$/h, rendements, surplus
│   └── soumissions.db            # Base SQLite (créée au runtime)
└── lib/
    ├── calculateur.ts            # Moteur de calcul
    ├── pdf-soumission.tsx        # Génération PDF format Xpress
    └── db.ts                     # Accès SQLite
```

## Prochaines étapes possibles

- [ ] Migration SQLite → Turso pour production
- [ ] Édition d'une soumission existante (chargement depuis liste)
- [ ] Templates de soumissions récurrentes
- [ ] Import direct depuis catalogues fournisseurs (Patrick Morin, etc.)
- [ ] Envoi PDF par courriel directement depuis l'app (Gmail MCP)
- [ ] Signature numérique du client sur la soumission
- [ ] Dashboard : revenus mensuels, taux de conversion soumission→contrat
