# 🎮 Gaby Hub Dev — mettre le site en ligne

Site perso néon : portfolio, CV, arcade de jeux (dont Snake multijoueur), GabyCodeHub (code des jeux débloqué par email) et une **page admin cachée** avec les statistiques.

| Brique | Rôle | Prix |
|---|---|---|
| **GitHub Pages** | héberge les fichiers du site | gratuit |
| **Supabase** | base de données, connexion par code email, multijoueur temps réel | gratuit (plan Free) |
| **Brevo** | envoie les emails (codes d'accès) | gratuit jusqu'à 300 emails/jour |
| **Nom de domaine** | ton adresse (ex. `gabyhub.fr`) | ~5 à 10 € la 1re année |

Durée totale : environ 1 h, plus l'attente DNS (jusqu'à 24 h).

---

## 📁 Contenu du projet

```
gaby-hub-dev/
├── index.html              ← le site
├── admin.html              ← ta page admin (cachée, protégée par connexion)
├── mentions-legales.html   ← mentions légales + confidentialité (à compléter)
├── CNAME                   ← ton nom de domaine (gabyhub.fr par défaut)
├── .nojekyll               ← dit à GitHub de servir les fichiers tels quels
├── assets/                 ← photo.jpg, poster.jpg
├── js/
│   ├── config.js           ← ⚠️ à remplir avec tes clés Supabase
│   └── gh.js               ← statistiques, GabyCodeHub, multijoueur
└── supabase/
    ├── schema.sql          ← à lancer une fois dans Supabase
    └── email-code.html     ← modèle de l'email avec le code
```

Tant que `js/config.js` n'est pas rempli, le site fonctionne quand même : seuls les stats, GabyCodeHub, le formulaire de contact en base et le Snake en ligne sont désactivés.

---

## Étape 1 — Acheter le nom de domaine

1. Vérifie que le nom est libre (ex. `gabyhub.fr`, `gabyhubdev.fr`, `gabyhub.dev`).
2. Recommandation : **un `.fr` chez OVHcloud** (entreprise française, offre multi-années autour de 4,99 € HT la 1re année, renouvellement 7,79 € HT/an, une boîte email incluse). Pour un `.com`, **Cloudflare Registrar** vend au prix coûtant, sans hausse au renouvellement.
3. Si tu prends un autre nom que `gabyhub.fr`, ouvre le fichier `CNAME` et remplace son contenu par ton domaine (une seule ligne, sans `https://`).

> 💡 Regarde toujours le **prix de renouvellement**, pas seulement la 1re année.

## Étape 2 — Créer la base Supabase

1. Crée un compte sur **supabase.com** → **New project**.
   - Nom : `gaby-hub-dev` · Région : **Europe (Paris ou Frankfurt)** · garde le mot de passe de la base quelque part.
2. Ouvre `supabase/schema.sql`, remplace **`ADMIN_EMAIL_ICI`** par **ton email** (celui avec lequel tu te connecteras à l'admin).
3. Dans Supabase : **SQL Editor → New query** → colle tout le fichier → **Run**. Tu dois voir « Success ».
4. **Project Settings → API** : copie
   - **Project URL** → dans `js/config.js`, champ `SUPABASE_URL`
   - **anon public key** → champ `SUPABASE_ANON_KEY`
   > ⚠️ Ne mets **jamais** la clé `service_role` dans le site.
5. **Authentication → Sign In / Providers → Email** : vérifie que *Email* est activé.
6. **Authentication → URL Configuration** :
   - Site URL : `https://gabyhub.fr` (ton domaine)
   - Redirect URLs : ajoute `https://gabyhub.fr/**` et `https://TON_PSEUDO.github.io/**`

## Étape 3 — Envoyer les emails avec Brevo (obligatoire)

Le serveur d'email intégré de Supabase n'envoie **qu'aux membres de ton équipe Supabase**, avec une limite très basse (environ 2 emails/heure). Pour que n'importe quel visiteur reçoive son code, il faut ton propre SMTP.

1. Crée un compte gratuit sur **brevo.com**.
2. **Senders, Domains & Dedicated IPs → Domains** : ajoute ton domaine et copie les enregistrements DNS qu'il te donne (TXT / CNAME) dans la zone DNS de ton domaine (étape 5). Puis crée un expéditeur, ex. `contact@gabyhub.fr`.
3. **SMTP & API → SMTP** : génère une **clé SMTP**. Note le serveur, le port et l'identifiant.
4. Dans Supabase : **Authentication → Emails → SMTP Settings → Enable custom SMTP** :
   - Sender email : `contact@gabyhub.fr` · Sender name : `GabyCodeHub`
   - Host : `smtp-relay.brevo.com` · Port : `587`
   - Username : l'identifiant SMTP Brevo · Password : la clé SMTP
5. **Authentication → Rate Limits** : monte « emails envoyés par heure » (ex. 60).
6. **Authentication → Emails → Templates** :
   - **Magic Link** *et* **Confirm signup** : objet `Ton code d'accès GabyCodeHub : {{ .Token }}` et contenu = le fichier `supabase/email-code.html`.
   - C'est le `{{ .Token }}` qui met le **code à 6 chiffres** dans l'email (au lieu d'un lien).

## Étape 4 — Mettre le code sur GitHub

1. Crée un compte sur **github.com**, puis **New repository** → nom `gaby-hub-dev` → **Public** → Create.
2. Envoie les fichiers :
   - **Sans ligne de commande** : bouton **Add file → Upload files**, glisse **tout le contenu** du dossier (y compris `.nojekyll` et `CNAME`), puis **Commit**.
   - **Avec Git** :
     ```bash
     cd gaby-hub-dev
     git init
     git add .
     git commit -m "Gaby Hub Dev"
     git branch -M main
     git remote add origin https://github.com/TON_PSEUDO/gaby-hub-dev.git
     git push -u origin main
     ```
3. Dans le dépôt : **Settings → Pages** :
   - Source : **Deploy from a branch** → Branch **main** / dossier **/(root)** → Save.
   - Custom domain : `gabyhub.fr` → Save.
4. Quelques minutes plus tard, le site répond déjà sur `https://TON_PSEUDO.github.io/gaby-hub-dev/`.

## Étape 5 — Relier le domaine (DNS)

Il n'y a **pas de serveur à toi** ni d'IP à louer : GitHub fournit ses adresses. Dans la zone DNS de ton domaine (chez OVH : *Web Cloud → Noms de domaine → ton domaine → Zone DNS*) :

1. **Supprime** l'enregistrement A « parking » existant sur `@` s'il y en a un.
2. Ajoute :

| Type | Sous-domaine | Cible |
|---|---|---|
| A | *(vide / @)* | `185.199.108.153` |
| A | *(vide / @)* | `185.199.109.153` |
| A | *(vide / @)* | `185.199.110.153` |
| A | *(vide / @)* | `185.199.111.153` |
| AAAA | *(vide / @)* | `2606:50c0:8000::153` |
| AAAA | *(vide / @)* | `2606:50c0:8001::153` |
| AAAA | *(vide / @)* | `2606:50c0:8002::153` |
| AAAA | *(vide / @)* | `2606:50c0:8003::153` |
| CNAME | `www` | `TON_PSEUDO.github.io.` |

3. Ajoute aussi les enregistrements donnés par **Brevo** (étape 3).
4. Attends la propagation (de quelques minutes à 24 h), puis dans **Settings → Pages**, coche **Enforce HTTPS**. Le certificat peut mettre environ 1 h à apparaître.
5. Conseillé : **Settings (de ton compte GitHub) → Pages → Add a domain** pour *vérifier* ton domaine (un enregistrement TXT) et éviter qu'on te le prenne.

## Étape 6 — Tester

1. Ouvre `https://gabyhub.fr`, clique **Accepter** sur le bandeau, joue une partie.
2. Gaming → 🔒 **Code du jeu** → inscris-toi avec un email → tu dois recevoir un code → entre-le → le code se débloque.
3. Ouvre **`https://gabyhub.fr/admin.html`** → ton email d'admin → code reçu → ton tableau de bord s'affiche.
4. Snake → 🌐 **En ligne** → Créer → ouvre le site sur un 2e appareil → Rejoindre avec le même code.

---

## 🔐 La page admin

- Adresse : **`/admin.html`**. Elle n'est liée nulle part et demande aux moteurs de recherche de ne pas l'indexer.
- Même si quelqu'un trouve l'adresse, il ne voit **rien** : les données sont protégées par la base (règles RLS). Seul un email présent dans la table `admins` peut les lire.
- Pour ajouter un autre admin : Supabase → SQL Editor → `insert into admins(email) values ('autre@email.fr');`

**Ce que tu y vois :**

| Onglet | Contenu |
|---|---|
| 📊 Vue d'ensemble | en ligne maintenant, visiteurs uniques, visites, temps moyen, parties, temps de jeu, emails envoyés, membres, messages non lus + graphiques |
| 👀 Visites | chaque visite : début, durée, pages vues, appareil, provenance, langue, membre connecté |
| 🎮 Jeux | chaque partie : jeu, mode, durée, score, joueur |
| 🔒 GabyCodeHub | emails de code envoyés (et erreurs), membres qui ont validé leur code, qui a consulté quel code |
| ✉️ Messages | formulaire de contact : répondre, marquer lu, supprimer |

Chaque tableau s'exporte en **CSV** (Excel). Filtres : 24 h · 7 j · 30 j · 90 j. Actualisation automatique toutes les minutes.

---

## ⚖️ Données personnelles (RGPD)

- Les statistiques ne démarrent **qu'après « Accepter »** sur le bandeau. Aucune adresse IP n'est enregistrée par le site.
- Complète l'**adresse** dans `mentions-legales.html` (obligatoire pour un entrepreneur individuel ; une adresse de domiciliation est possible).
- Pour respecter la durée de 13 mois, lance de temps en temps les 2 lignes de « NETTOYAGE » en bas de `schema.sql`.
- Je ne suis pas juriste : en cas de doute, vérifie sur **cnil.fr**.

## 📏 Limites des plans gratuits

- **Supabase Free** : projet **mis en pause après 1 semaine sans activité** (un clic pour le relancer). Base 500 Mo, largement suffisant. Le multijoueur consomme des « messages Realtime » : surveille **Reports → Usage** si beaucoup de monde joue en ligne.
- **Brevo Free** : 300 emails par jour, avec la mention « Sent with Brevo ».
- **GitHub Pages** : gratuit pour un dépôt public.

## ✏️ Modifier le contenu

Tout est dans `index.html`, en haut du `<script>` principal : `PROJECTS` (projets), `TIMELINE` (parcours), `SKILLS`, `TAGLINE`, `WORDS` (mots du Mot Mystère). Modifie, puis renvoie le fichier sur GitHub : le site se met à jour en 1 à 2 minutes.
