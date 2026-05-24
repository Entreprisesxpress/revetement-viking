# 🚀 Mise en ligne — Revêtement Viking

Suis ces étapes dans l'ordre. Total ~30 min, 100% gratuit pour démarrer.

---

## ÉTAPE 1 — Créer la base de données Turso (5 min)

Turso = SQLite en cloud, gratuit jusqu'à 9 GB. C'est ta DB de production.

1. Va sur **https://turso.tech**
2. Clique **"Sign in"** → connecte-toi avec **GitHub**
3. Une fois dans le dashboard, clique **"+ Create Database"**
4. Nom : `revetement-viking`
5. Région : **iad** (US East — le plus proche du Québec)
6. Clique **Create**

Maintenant récupère les 2 valeurs importantes :

7. Dans la page de ta DB, clique **"Connect"** ou onglet **"Database details"**
8. Copie l'**URL** : `libsql://revetement-viking-tonusername.turso.io` (la garder)
9. Clique **"Generate token"** ou **"+ Token"** → nom : `vercel-prod` → durée : "Never expires"
10. Copie le **token** : `eyJhbGc...` (commence par eyJ)

**Garde ces 2 valeurs**, tu vas les coller dans Vercel à l'étape 3.

---

## ÉTAPE 2 — Pousser le code sur GitHub (10 min)

### 2.1 Créer un compte GitHub (si pas déjà fait)
https://github.com/signup

### 2.2 Créer le repo
1. Va sur **https://github.com/new**
2. Repository name : `revetement-viking`
3. **Privé** (important, ton code business)
4. **NE PAS** cocher README/gitignore/license
5. Clique **Create repository**
6. **Garde la page ouverte**, tu vas voir des commandes à copier

### 2.3 Pousser le code depuis ton PC

Ouvre **PowerShell** dans le dossier du projet :
```powershell
cd C:\Users\Utilisateur\soumissions-xpress

git init
git add .
git commit -m "Initial commit - Revêtement Viking"
git branch -M main
```

Ensuite, copie/colle les commandes de la page GitHub (tu remplaces `TONUSERNAME` par ton vrai username GitHub) :
```powershell
git remote add origin https://github.com/TONUSERNAME/revetement-viking.git
git push -u origin main
```

Si Git te demande de te connecter à GitHub :
- Username : ton username GitHub
- Password : un **Personal Access Token** (créé sur https://github.com/settings/tokens/new — coche `repo`)

---

## ÉTAPE 3 — Déployer sur Vercel (10 min)

1. Va sur **https://vercel.com**
2. **Sign up** avec GitHub
3. Clique **"Add New..."** → **"Project"**
4. Trouve `revetement-viking` dans la liste → clique **Import**

### 3.1 Configuration

Tu vas voir un écran "Configure Project". Avant de cliquer Deploy :

5. Déplie **"Environment Variables"**
6. Ajoute ces **4 variables** (clic "+ Add" après chacune) :

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (ta clé Anthropic actuelle) |
| `APP_PASSWORD` | `viking2026!` (ou un mot de passe à toi - **garde-le secret**) |
| `TURSO_URL` | `libsql://revetement-viking-tonusername.turso.io` (de l'étape 1) |
| `TURSO_AUTH_TOKEN` | `eyJhbGc...` (de l'étape 1) |

7. Clique **"Deploy"**
8. Attends ~2-3 min, regarde le log

---

## ÉTAPE 4 — Tester (3 min)

Une fois "Deployment ready" :

1. Clique sur le lien généré : `https://revetement-viking-xxx.vercel.app`
2. Tu arrives sur la **page de login** → entre le mot de passe que tu as choisi (`viking2026!` ou autre)
3. Tu es dans le dashboard !
4. Clique **"✨ Charger les données démo"** pour avoir des soumissions/projets de test

---

## ÉTAPE 5 — Partager avec ton associé

Envoie-lui :
- **URL** : `https://revetement-viking-xxx.vercel.app`
- **Mot de passe** : `viking2026!` (celui de l'étape 3)

Il pourra ajouter ses heures, dépenses, projets — **tout est partagé en temps réel** sur la DB Turso.

---

## ÉTAPE 6 (optionnel) — Custom domain `revetementviking.ca`

Si tu as déjà acheté un domaine :
1. Vercel → ton projet → **Settings** → **Domains**
2. Tape ton domaine (ex: `app.revetementviking.ca`)
3. Vercel te dit quels enregistrements DNS ajouter (CNAME ou A)
4. Ajoute-les chez ton registraire (GoDaddy, Namecheap, Cloudflare...)
5. Propagation 1-24h

---

## Si quelque chose cloche

### Build qui échoue
- Regarde l'onglet **Build Logs** dans Vercel
- 99% des cas : variable d'env oubliée ou faute de frappe dans `TURSO_URL`

### "Mot de passe incorrect"
- Vérifie que tu utilises EXACTEMENT le même `APP_PASSWORD` que dans Vercel
- Casse-sensible

### Page blanche / erreur 500
- Vercel → Logs en temps réel → cherche les erreurs en rouge
- Cause fréquente : `TURSO_AUTH_TOKEN` manque ou expire

### Mettre à jour le code après modifs locales
```powershell
cd C:\Users\Utilisateur\soumissions-xpress
git add .
git commit -m "Description de tes changements"
git push
```
Vercel redéploie automatiquement en ~1 min.

---

## Coûts mensuels

| Service | Coût |
|---|---|
| **Vercel Hobby** | 0 $ (jusqu'à 100 GB de trafic) |
| **Turso** | 0 $ (9 GB, des milliards de lectures) |
| **Anthropic API** | ~5-15 $ selon usage (10-30 soumissions IA) |
| **GitHub privé** | 0 $ |
| **Domaine custom** | 15 $/an (optionnel) |

**Total : 5-15 $/mois** pour faire tourner ton entreprise dessus.

---

## Backup régulier (à faire 1×/semaine)

Pour télécharger une copie de ta DB :
1. Installe la CLI Turso : https://docs.turso.tech/cli/installation
2. `turso db shell revetement-viking ".dump" > backup-2026-05-15.sql`
3. Garde le fichier `.sql` quelque part en sécurité (Drive, disque externe)
