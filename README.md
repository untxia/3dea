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

## Déploiement sur Vercel

Version en production : <https://3dea-dusky.vercel.app>.

Vercel sert le contenu statique de `public/`, comme indiqué dans `vercel.json`.
Le projet Vercel est relié au dépôt GitHub et se redéploie lors des nouvelles
versions poussées sur le dépôt. Pour lancer un déploiement manuellement :

```bash
npx vercel --prod
```

Le site publié n'inclut pas de serveur Express ni de fonction `/api`. La
bibliothèque est conservée dans `localStorage` sur le navigateur utilisé ; elle
n'est pas synchronisée entre appareils. Les fichiers restent soumis au quota du
navigateur. La base Prisma/SQLite et les fonctions assistées par IA sont
disponibles uniquement avec le serveur local décrit ci-dessous.

---

## Base de données locale

Prisma utilise SQLite par défaut. `npm run setup` génère le client Prisma,
crée la base locale et la peuple avec les modèles de démonstration. Cette base
est utilisée par le serveur local, pas par le site Vercel.

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

## API locale

Les routes ci-dessous sont servies par le serveur Express lancé avec
`npm run dev`. Elles ne sont pas exposées par le déploiement Vercel statique.

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

## Fonctionnement sur Vercel

La page appelle `/api/health` au démarrage. Sur Vercel, cette route n'existe
pas : l'application passe donc en mode navigateur et conserve la bibliothèque
dans `localStorage`. Ces données restent propres au navigateur et à l'appareil
utilisés. Le quota disponible dépend du navigateur ; les fichiers volumineux
peuvent ne pas être enregistrés.

La base de données, l'archivage des estimations, le stockage serveur des
fichiers et le relais IA (`/api/ai`) nécessitent un backend et ne sont pas
disponibles sur le site actuellement déployé. En local, ils utilisent le
serveur Express, Prisma/SQLite et, pour l'IA, la variable `ANTHROPIC_API_KEY`.

---

## Limite connue

Aucun site de modèles — Printables, Thingiverse, Cults3D — n'autorise le
téléchargement direct depuis une page tierce : leur politique CORS l'interdit.
Avec le serveur local, coller l'adresse d'une page enregistre une **fiche** :
le serveur lit la page pour en extraire titre, auteur, licence et résumé, puis
vous téléchargez le fichier sur le site et le rattachez avec le bouton `+`.
Cette lecture de page n'est pas disponible sur le déploiement Vercel statique.

Un lien direct vers un `.stl` sur un hébergeur permissif — GitHub raw, GitLab,
la plupart des CDN — peut être récupéré et mesuré automatiquement lorsque le
serveur local est utilisé.

---

## Fichiers principaux

```
3dea/
├── prisma/
│   ├── schema.prisma        six tables, relations et index
│   └── seed.js              peuplement initial
├── src/
│   ├── api.js               routeur Express partagé
│   ├── server.js            serveur local
│   └── storage.js           stockage local des fichiers
├── scripts/use-db.js        bascule sqlite ⇄ postgresql
├── public/index.html        l'application entière, un seul fichier
└── vercel.json              publication statique de public/
```
