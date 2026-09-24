# 3DEA

Bibliothèque de modèles 3D avec base de données Prisma, visionneuse STL/OBJ,
éditeur de modélisation et assistant d'impression. Interface bilingue FR/EN,
habillage façon panneau de commande d'imprimante 3D.

---

## Démarrage en local

```bash
cp .env.example .env
npm install
npm run setup        # prisma generate + migration + peuplement
npm run dev          # http://localhost:3000
```

`npm run setup` enchaîne la génération du client Prisma, la création de la
base SQLite et son peuplement avec les quatorze pièces du rayon.
Pour inspecter les données : `npm run db:studio`.

---

## Mise en ligne sur GitHub

```bash
git init
git add .
git commit -m "3DEA — bibliotheque 3D + IA"
git branch -M main
git remote add origin git@github.com:VOTRE-COMPTE/3dea.git
git push -u origin main
```

`.gitignore` exclut déjà `node_modules/`, `.env`, la base SQLite et le
contenu de `storage/`. Un workflow GitHub Actions (`.github/workflows/ci.yml`)
valide le schéma Prisma et la syntaxe du serveur à chaque poussée.

Pensez à ajouter un fichier `LICENSE` : je ne l'ai pas choisi à votre place,
c'est une décision qui vous appartient.

---

## Mise en ligne sur Netlify

Deux niveaux, au choix.

### Niveau 1 — interface seule, en deux minutes

Netlify sert `public/` et rien d'autre. L'application détecte l'absence d'API
et bascule sur le stockage du navigateur : bibliothèque locale, fichiers en
base64, tout fonctionne sauf le partage entre appareils.

Sur Netlify : **Add new site → Import from GitHub**, puis
*Publish directory* = `public`, *Build command* = vide. Terminé.

### Niveau 2 — avec la base de données

Netlify ne fait pas tourner de serveur Express permanent, et **le système de
fichiers d'une fonction est effacé à chaque appel** : SQLite n'y survit pas.
Il faut donc une base hébergée. Neon, Supabase ou Turso ont tous une offre
gratuite qui suffit largement ici.

1. Créez une base Postgres et récupérez son URL de connexion.
2. Basculez le provider et poussez :
   ```bash
   npm run use:postgres
   git add prisma/schema.prisma && git commit -m "base postgres" && git push
   ```
3. Sur Netlify, dans **Site configuration → Environment variables**, ajoutez :

   | Clé | Valeur |
   |-----|--------|
   | `DATABASE_URL` | l'URL Postgres, avec `?sslmode=require` |
   | `MAX_UPLOAD_MB` | `5` (voir la limite ci-dessous) |
   | `ANTHROPIC_API_KEY` | votre clé, pour les fonctions assistées |

4. Redéployez. `netlify.toml` fait le reste : il publie `public/`, construit
   le client Prisma, applique les migrations et réécrit `/api/*` vers la
   fonction serverless.

Les fichiers STL ne vont ni en base ni sur disque : ils passent par
**Netlify Blobs**, activé automatiquement dès que la fonction tourne.

### Les fonctions assistées ont besoin d'une clé

La recherche assistée, la lecture automatique des fiches et l'assistant
d'impression appellent un modèle de langage. En ligne, cet appel passe par
`/api/ai`, une route qui relaie la requête **avec la clé conservée côté
serveur** — le navigateur ne la voit jamais.

Sans `ANTHROPIC_API_KEY`, la route répond 503 et ces trois fonctions sont
indisponibles. Tout le reste — bibliothèque, visionneuse, mesures, estimation
de filament, éditeur, export STL — continue de fonctionner normalement.

**Limite à connaître** : une fonction Netlify plafonne la requête entrante à
environ 6 Mo. Un STL plus lourd sera refusé en ligne alors qu'il passe très
bien en local. Pour dépasser cela il faudrait un envoi direct vers un stockage
objet avec URL signée — c'est faisable, mais ce n'est pas dans ce dépôt.

---

## Base de données

| Table        | Rôle |
|--------------|------|
| `Model`      | Une pièce : fichier géométrique, ou fiche pointant vers une page dont le fichier n'est pas encore joint |
| `Tag`        | Étiquettes libres, partagées entre pièces |
| `TagOnModel` | Jointure explicite, pour enrichir la relation plus tard sans migration destructrice |
| `Note`       | Notes d'atelier attachées à une pièce |
| `PrintJob`   | Historique des estimations : matière, remplissage, grammes, coût, durée |
| `Setting`    | Préférences d'interface (langue, prix au kilo…) |

Les fichiers restent hors base : la ligne `Model` ne garde qu'un chemin. Une
base reste ainsi petite et rapide, et un fichier de 40 Mo ne bloque pas une
requête.

---

## API

| Méthode | Route | Effet |
|---------|-------|-------|
| `GET`    | `/api/health` | Sonde ; renvoie 503 si la base est injoignable |
| `GET`    | `/api/models?q=&kind=&platform=&category=` | Liste filtrée |
| `GET`    | `/api/models/:id` | Détail avec notes et historique |
| `POST`   | `/api/models` | Création — 409 si le lien existe déjà |
| `PATCH`  | `/api/models/:id` | Mise à jour partielle |
| `DELETE` | `/api/models/:id` | Suppression, fichier compris |
| `POST`   | `/api/models/:id/file` | Envoi du fichier et des cotes mesurées |
| `GET`    | `/api/models/:id/file` | Téléchargement |
| `POST`   | `/api/models/:id/notes` · `/jobs` | Note, estimation archivée |
| `GET`    | `/api/tags` · `POST /api/models/:id/tags` | Étiquettes |
| `GET`/`PUT` | `/api/settings/:key` | Préférences |
| `POST`   | `/api/ai` | Relais vers le modèle, clé côté serveur |

---

## Fonctionnement sans serveur

`public/index.html` est autonome. Au démarrage il appelle `/api/health` :

- **base joignable** → tout passe par Prisma, fichiers stockés côté serveur,
  estimations archivées ;
- **sinon** → repli silencieux sur le stockage du navigateur. Aucune
  fonctionnalité ne disparaît, mais la bibliothèque reste locale et les
  fichiers au-delà de 3,4 Mo ne sont pas conservés entre deux sessions.

Le basculement se fait aussi en cours de route : si le serveur tombe, la
couche de données repasse en mode navigateur sans interrompre l'utilisateur.

---

## Limite connue

Aucun site de modèles — Printables, Thingiverse, Cults3D — n'autorise le
téléchargement direct depuis une page tierce : leur politique CORS l'interdit.
Coller l'adresse d'une page enregistre donc une **fiche** : l'application lit
la page pour en extraire titre, auteur, licence et résumé, puis vous
téléchargez le fichier sur le site et le rattachez avec le bouton `+`.

Un lien direct vers un `.stl` sur un hébergeur permissif — GitHub raw, GitLab,
la plupart des CDN — est en revanche récupéré et mesuré automatiquement.

---

## Structure

```
3dea/
├── prisma/
│   ├── schema.prisma        six tables, relations et index
│   └── seed.js              peuplement initial
├── src/
│   ├── api.js               routeur Express partagé
│   ├── server.js            serveur local
│   └── storage.js           disque en local, Netlify Blobs en ligne
├── netlify/functions/api.js adaptateur serverless
├── scripts/use-db.js        bascule sqlite ⇄ postgresql
├── public/index.html        l'application entière, un seul fichier
└── netlify.toml             publication, build, réécritures
```
