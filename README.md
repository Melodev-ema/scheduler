# Scheduler

Planificateur hebdomadaire : vous décrivez vos activités récurrentes, un modèle de langage les répartit sur
la semaine.

## Fonctionnement

1. **Définir ses activités** (page *Activités*) : nom, description, priorité, temps à y consacrer, jours
   autorisés et, si besoin, un créneau fixe (heure de début et heure de fin).
2. **Générer le planning** (page d'accueil, bouton *Générer*) : l'application calcule une plage horaire pour
   chaque jour, envoie les activités et ces plages au modèle, valide sa réponse puis enregistre le planning.
3. **Suivre sa semaine** : un clic sur un créneau le marque comme fait, un second le remet à faire. La
   colonne *Déjà passé (min)* de la page *Activités* additionne les créneaux faits du planning le plus
   récent. Elle n'est pas enregistrée mais recalculée à chaque lecture, en rapprochant créneaux et activités
   par leur nom. Elle repart donc de 0 à chaque nouvelle génération.

Les règles imposées au modèle :

- une activité qui a une heure de début **et** une heure de fin est un bloc fixe, jamais découpé ;
- une activité n'est placée que sur ses jours autorisés (aucun jour coché : n'importe quel jour) ;
- la priorité va de `1` (la plus importante) à `3` (la moins importante) et guide les arbitrages quand tout
  ne tient pas ;
- une journée va de 09:00 à 18:00 par défaut. Un bloc fixe qui déborde l'élargit, rien ne la réduit.

Chaque génération crée un nouveau planning, et l'accueil affiche le plus récent. Les précédents restent en
base comme instantanés : modifier une activité ne réécrit pas les plannings passés.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router et Route Handlers), React 19, TypeScript 6
- MongoDB via Mongoose 9
- Tailwind CSS 4, react-toastify
- Zod 4 pour valider les entrées de l'API
- Vitest 4 pour les tests
- LLM : tout endpoint *chat completions* compatible avec l'API OpenAI, appelé en `fetch` direct, sans SDK.
  [Groq](https://groq.com) par défaut.

## Prérequis

- Node.js 20.9 ou plus récent
- Une instance MongoDB accessible, par défaut `mongodb://localhost:27017/scheduler`
- Une clé d'API chez un fournisseur compatible OpenAI

## Installation

```bash
npm install
```

```bash
cp .env.example .env.local
```

Renseignez `LLM_API_KEY` dans `.env.local`, démarrez MongoDB, puis :

```bash
npm run dev
```

L'application répond sur <http://localhost:3000>. MongoDB doit tourner avant toute requête : chaque route de
l'API commence par s'y connecter.

## Docker

Un `Makefile` regroupe les commandes ; `make` seul les liste.

- **Développement** : `make dev` lance `npm run dev` sur la machine, avec le MongoDB local habituel (27017).
- **Production** : `make prod` construit l'image (`Dockerfile`, sortie *standalone* de Next) et lance
  l'application et son propre MongoDB sur <http://localhost:3000>. `make logs` suit ses logs, `make stop`
  l'arrête, `make down` arrête tous les conteneurs sans perdre les données.

Le MongoDB de Docker est une base **distincte** du MongoDB local : volume `mongo-data`, publié sur
`127.0.0.1:27018` pour ne pas entrer en conflit avec lui. Les deux ports ne sont publiés que sur `127.0.0.1` :
l'API n'a pas encore d'authentification. Le conteneur lit `.env` et `.env.local` au démarrage, jamais au
build, et se connecte au MongoDB de compose quelle que soit la valeur de `MONGODB_URI`.

## Configuration

Les variables sont lues depuis `.env` et `.env.local` (`.env.local` l'emporte). Seul `.env.example` est
versionné.

| Variable       | Obligatoire | Valeur par défaut                     | Rôle                              |
|----------------|-------------|---------------------------------------|-----------------------------------|
| `LLM_API_KEY`  | oui         | —                                     | Clé du fournisseur LLM            |
| `MONGODB_URI`  | non         | `mongodb://localhost:27017/scheduler` | Base MongoDB                      |
| `LLM_BASE_URL` | non         | `https://api.groq.com/openai/v1`      | Endpoint compatible OpenAI        |
| `LLM_MODEL`    | non         | `openai/gpt-oss-120b`                 | Modèle utilisé pour la génération |

Sans `LLM_API_KEY`, aucune route ne répond, pas seulement la génération : la connexion à la base lit toute la
configuration et échoue sur la variable manquante.

Une valeur définie dans un fichier `.env*` l'emporte sur la valeur par défaut du code. Changer le modèle par
défaut dans `src/server/config/env.ts` reste donc sans effet si `LLM_MODEL` est défini.

### Confidentialité

Le prompt contient votre routine hebdomadaire. Choisissez un fournisseur qui n'entraîne pas ses modèles sur
les données qu'on lui envoie : c'est ce qui a motivé le choix de Groq, qui sert des modèles à poids ouverts
sans réutiliser les requêtes.

### Changer de modèle

Le catalogue de Groq change souvent, et des modèles sont retirés sans long préavis. Si la génération échoue
avec une erreur `404 model_not_found`, listez les modèles disponibles :

```bash
node --env-file=.env.local -e "fetch((process.env.LLM_BASE_URL??'https://api.groq.com/openai/v1')+'/models',{headers:{Authorization:'Bearer '+process.env.LLM_API_KEY}}).then(r=>r.json()).then(d=>console.log(d.data.map(m=>m.id).sort().join('\n')))"
```

puis définissez `LLM_MODEL` dans `.env.local`.

## Scripts

| Commande             | Effet                                          |
|----------------------|------------------------------------------------|
| `npm run dev`        | Serveur de développement (Turbopack)           |
| `npm run build`      | Build de production                            |
| `npm run start`      | Sert le build de production                    |
| `npm run lint`       | ESLint (`next build` ne le lance plus)         |
| `npm test`           | Lance les tests une fois                       |
| `npm run test:watch` | Tests en mode watch                            |
| `npm test -- days`   | Tests d'un seul module, par fragment de nom    |

Ne lancez pas `npm run build` pendant que `npm run dev` tourne : les deux partagent le dossier `.next`, et le
serveur de développement répond ensuite 500 sur toutes les routes jusqu'à son redémarrage.

## API

Toutes les routes sont sous `/api` et échangent du JSON.

| Méthode  | Route                           | Rôle                                                          |
|----------|---------------------------------|---------------------------------------------------------------|
| `GET`    | `/api/activity`                 | Liste des activités, sous la forme `{data}`                   |
| `POST`   | `/api/activity`                 | Crée une activité                                             |
| `DELETE` | `/api/activity`                 | Supprime l'activité dont l'identifiant est passé dans `index` |
| `GET`    | `/api/activity/[id]`            | Une activité                                                  |
| `POST`   | `/api/activity/[id]`            | Met à jour une activité                                       |
| `GET`    | `/api/generate_weekly_planning` | Le planning le plus récent                                    |
| `POST`   | `/api/generate_weekly_planning` | Génère un nouveau planning                                    |
| `POST`   | `/api/schedule/status`          | Passe un créneau à `pending` ou à `done`                      |

Les erreurs répondent toutes `{error}` :

- **400** — entrée invalide. La réponse liste aussi les champs fautifs.
- **404** — document introuvable.
- **429** — plus de 5 générations en 15 minutes. L'en-tête `Retry-After` indique quand réessayer.
- **502** — le modèle a renvoyé une réponse inexploitable deux fois de suite.
- **500** — toute autre erreur. Le détail est journalisé côté serveur, jamais renvoyé au client.

## Architecture

```
src/
├── app/                   pages et Route Handlers : l'interface et l'API
├── components/            composants React
├── models/                schémas Mongoose : Activity, Planning, Schedule
├── proxy.ts               CSP à nonce, calculée à chaque requête
├── server/
│   ├── config/            variables d'environnement typées
│   ├── domain/planning/   logique de planification, pure et testée
│   ├── http/              schémas Zod, réponses d'erreur, limitation de débit
│   └── infrastructure/db/ connexion MongoDB
└── services/              client HTTP du navigateur et appel au LLM
```

Une génération suit toujours le même chemin :

```
Activity (MongoDB)
  → activityToPlannable   normalise chaque activité
  → buildDayWindows       calcule la plage horaire de chaque jour
  → generateWeeklyPlanning  appelle le modèle
  → parseSchedule         valide la réponse, la rejette si elle est mal formée
  → Planning (MongoDB)    enregistre le planning et l'instantané des activités
```

Le code sous `src/server/domain/planning/` ne dépend ni de Mongoose, ni de Next, ni du LLM : il prend des
données et en rend. C'est ce qui permet de le tester sans base ni réseau.

## Tests

```bash
npm test
```

Les tests couvrent le domaine de planification, les helpers de la couche HTTP et la logique de reprise des
appels au LLM. Il n'y a pas de tests d'interface, d'intégration de l'API ou de bout en bout.

`src/server/domain/planning/__fixtures__/openai-response.json` est une vraie réponse de modèle capturée. Elle
sert de test de bout en bout à `parseSchedule` et de référence pour le format de sortie attendu.

## Conventions

- Les jours sont des chaînes françaises en minuscules (`"lundi"` … `"dimanche"`), définies une seule fois
  dans `src/server/domain/planning/days.ts`.
- Les heures sont des chaînes `"HH:MM"` complétées par des zéros : `"09:30"`, jamais `"9:30"`.
- Les textes affichés, les commentaires, les noms de tests et les messages d'erreur sont en français ; les
  identifiants sont en anglais.

## Limites connues

- **Aucune authentification.** Toutes les routes sont ouvertes, et la taille des corps de requête n'est pas
  bornée. L'application ne doit pas être exposée sur un réseau public en l'état.
- **L'unité de `timeToSpend` est incohérente.** Les activités l'enregistrent en minutes, mais le prompt
  annonce des heures au modèle : 90 minutes lui arrivent comme 90 heures. La corriger demande de migrer les
  données existantes et la durée par défaut des tâches externes en même temps.
- **La réponse du modèle n'est validée que sur sa forme.** Rien ne vérifie qu'un créneau tombe bien sur un
  jour autorisé pour son activité.
- **La limitation de débit vit en mémoire.** Le compteur est propre à chaque processus et se remet à zéro au
  redémarrage.
