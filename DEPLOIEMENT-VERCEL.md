# 🚀 Déploiement Vercel + Turso (DB cloud) + Auth

## Vue d'ensemble
- **Hébergement** : Vercel (gratuit, déploiement Git automatique)
- **Base de données** : Turso (SQLite distribué, gratuit jusqu'à 9 GB)
- **Auth** : Mot de passe partagé via variable d'environnement
- **Coût total estimé** : 0 $ pour usage normal (Vercel Hobby + Turso free tier)

---

## Étape 1 — Préparer le code (déjà fait)

✅ `middleware.ts` — protège toutes les routes derrière le mot de passe
✅ `app/login/page.tsx` — page de login
✅ `app/api/login/route.ts` — API de login avec cookie

Le code marche **localement sans mot de passe** (laisse passer) et **avec mot de passe en prod** (variable env).

---

## Étape 2 — Migrer SQLite vers Turso (DB cloud)

### Pourquoi ?
Vercel est serverless : le fichier SQLite local serait perdu à chaque déploiement. Il faut une DB hébergée. Turso = SQLite dans le cloud, quasi-identique au code actuel.

### Setup Turso

1. Crée un compte : https://turso.tech (login GitHub)
2. Crée une base de données :
   ```
   turso db create soumissions-xpress
   ```
3. Génère un token :
   ```
   turso db tokens create soumissions-xpress
   ```
4. Récupère l'URL :
   ```
   turso db show soumissions-xpress --url
   ```

Tu auras 2 valeurs :
- `TURSO_URL` = `libsql://soumissions-xpress-xxxx.turso.io`
- `TURSO_AUTH_TOKEN` = `eyJhbGc...`

### Adapter le code (3 lignes à changer)

Installe le client Turso :
```
npm install @libsql/client
```

Dans `lib/db.ts`, remplace l'import et la connexion par :
```typescript
import { createClient } from "@libsql/client";

const client = process.env.TURSO_URL
  ? createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : null;
```

**OU plus simple pour démarrer** : garde better-sqlite3 et accepte que les données ne soient pas persistées en prod (utile pour tester le déploiement, perfait pour la démo). On migrera vers Turso plus tard.

---

## Étape 3 — Pousser sur GitHub

```bash
cd C:\Users\Utilisateur\soumissions-xpress
git init
git add .
git commit -m "Initial commit"
```

Crée un repo privé sur https://github.com/new (nom : `soumissions-xpress`), puis :
```bash
git remote add origin https://github.com/TON_USER/soumissions-xpress.git
git branch -M main
git push -u origin main
```

⚠️ **Vérifie que `.env.local` est dans `.gitignore`** (sinon ta clé Anthropic part dans GitHub) :
```
cat .gitignore | grep env
```
Si `.env*.local` n'apparaît pas, ajoute-le.

---

## Étape 4 — Déployer sur Vercel

1. Va sur https://vercel.com → "Add New Project"
2. Importe `soumissions-xpress`
3. Dans **Environment Variables**, ajoute :
   - `ANTHROPIC_API_KEY` = `sk-ant-api03-...` (ta clé actuelle)
   - `APP_PASSWORD` = `xpress2026` (ou ce que tu veux comme mot de passe d'équipe)
   - `TURSO_URL` = (si tu as migré) `libsql://...turso.io`
   - `TURSO_AUTH_TOKEN` = (si tu as migré) `eyJhbGc...`
4. Clique "Deploy"

URL finale : `https://soumissions-xpress.vercel.app` (ou custom domain plus tard)

---

## Étape 5 — Partager avec ton associé

Envoie-lui :
- **URL** : `https://soumissions-xpress.vercel.app`
- **Mot de passe** : celui de `APP_PASSWORD`

C'est tout. Le cookie reste valide 30 jours par appareil.

---

## Custom domain (optionnel)

Si tu veux `soumissions.entreprisesxpress.ca` :
1. Vercel → Settings → Domains → "Add"
2. Tape ton domaine
3. Vercel te donne les enregistrements DNS à ajouter chez ton fournisseur (GoDaddy, Namecheap, etc.)
4. Propagation 1-24h

---

## Coûts

| Service | Free tier | Quand tu paies |
|---|---|---|
| **Vercel Hobby** | 100 GB bandwidth/mois | Si >100 GB ou usage commercial = Pro 20$/mois |
| **Turso** | 9 GB stockage, 1 milliard reads/mois | Bien au-delà des besoins normaux |
| **Anthropic API** | Pas de free tier | ~5-15¢ par soumission, ~50¢ par mois de chat normal |
| **Domain** | — | ~15$/an si custom domain |

**Pour 30 soumissions/mois** : ~5-10$ d'API + 0$ d'hébergement = **~10$/mois total**.

---

## Maintenance

- **Mettre à jour le code** : `git push` → Vercel redéploie automatiquement (≤1 min)
- **Voir les logs** : Vercel → ton projet → "Logs" tab
- **Backup DB Turso** : `turso db shell soumissions-xpress ".dump" > backup.sql`
- **Revenir en arrière** : Vercel → Deployments → clic ancienne version → "Promote to Production"

---

## Sécurité

- `.env.local` JAMAIS commité (vérifie `.gitignore`)
- `APP_PASSWORD` longueur min 12 caractères, idéalement aléatoire
- Cookie HttpOnly + Secure + SameSite=Lax (déjà configuré)
- Pour vraie sécurité multi-utilisateurs : migrer vers NextAuth + comptes individuels (v2)
