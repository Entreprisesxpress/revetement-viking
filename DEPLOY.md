# 🚀 Déploiement Vercel — Revêtement Viking

## Variables d'environnement

À configurer dans **Vercel → Project → Settings → Environment Variables** (Production + Preview).

| Variable | Requis | Rôle | Comment générer |
|---|---|---|---|
| `APP_PASSWORD` | **OBLIGATOIRE** | Mot de passe d'accès (cookie HMAC) + signe les liens publics de soumission | Choisir un mot de passe fort |
| `CRON_SECRET` | **OBLIGATOIRE en prod** | Protège `/api/backup`. Sans lui, le backup automatique est **désactivé** (route → 503) | `openssl rand -hex 32` (ou 32+ caractères aléatoires) |
| `TURSO_URL` | **OBLIGATOIRE** | URL base de données libsql | Console Turso |
| `TURSO_AUTH_TOKEN` | **OBLIGATOIRE** | Token base de données | Console Turso |
| `LIEN_PUBLIC_SECRET` | Optionnel | Secret dédié aux liens publics (sinon `APP_PASSWORD` est utilisé). En prod, l'un des deux DOIT exister sinon la génération de liens échoue (pas de fallback devinable) | `openssl rand -hex 32` |
| `GOOGLE_OAUTH_CLIENT_ID` | Optionnel | Sync Google Drive | Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Optionnel | Sync Google Drive | Google Cloud Console |
| `GOOGLE_DRIVE_FOLDER_ID` | Optionnel | Dossier Drive cible | — |

## Cron de backup — mécanisme Vercel

`vercel.json` déclare :
```json
{ "crons": [ { "path": "/api/backup", "schedule": "0 8 * * *" } ] }
```

**Comment l'authentification fonctionne (important) :**
Vercel Cron **n'utilise PAS de header custom dans `vercel.json`**. À la place, **quand la variable `CRON_SECRET` existe**, Vercel injecte automatiquement l'en-tête `Authorization: Bearer <CRON_SECRET>` sur les requêtes déclenchées par le cron. C'est le mécanisme officiel et documenté de Vercel.

Notre route `/api/backup` (GET) :
1. Si `CRON_SECRET` absent → `503` (route fermée, aucun backup public possible).
2. Si `Authorization` ≠ `Bearer <CRON_SECRET>` → `401`.
3. Sinon → exécute le backup.

➡️ **Donc : il suffit de définir `CRON_SECRET` dans Vercel.** Aucune config de header manuelle. Le cron quotidien (8h UTC ≈ 3-4h du matin à Montréal) s'authentifiera tout seul.

**Vérifier manuellement** (depuis ta machine, avec le vrai secret) :
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://app.revetementviking.com/api/backup
# → { ok: true, nom: "backup-...json", ... }
```

## Checklist post-déploiement

- [ ] `CRON_SECRET` défini → tester `/api/backup` sans header = `503`, avec bon header = backup.
- [ ] `/login` accessible, logo visible (`/logo-viking.svg` = 200).
- [ ] `/manifest.json` = 200 (PWA installable).
- [ ] `/api/clients` sans cookie = redirige vers `/login`.
- [ ] `npm test` = 21/21, `npm run build` = OK sans warning de config.

## Repos

- Principal : `github.com/Entreprisesxpress/revetement-viking`
- Miroir déployé Vercel : `github.com/revetementviking-spec/revetement-viking-app`
- Push sur les deux : `git push && git push vercel-clone main`
