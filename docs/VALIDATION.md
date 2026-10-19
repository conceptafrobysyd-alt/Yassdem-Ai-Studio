# Validation

Résultats constatés le **19 octobre 2026** dans l'environnement Linux cloud, avec vérification dans un navigateur réel. Les tests payants Runway n'ont pas été exécutés. L'installation sous Windows et macOS n'a pas été testée.

## Environnement

| Outil | Version vérifiée |
| --- | --- |
| Node.js | 24.19.0 |
| npm | 11.9.0 |
| FFmpeg / FFprobe | 7.1.5 |
| Prisma | 6.19.0, moteur JavaScript et adaptateur SQLite officiel |
| better-sqlite3 / SQLite | 12.11.1 / 3.53.2 |

## Contrôles exécutés

| Contrôle | Résultat |
| --- | --- |
| Installation figée `npm ci` | Réussie, y compris la génération du client Prisma par `postinstall` |
| Migrations | `prisma migrate deploy` exécuté deux fois ; aucune migration en attente au second passage |
| Vérification TypeScript | `npm run typecheck` réussi |
| Tests unitaires du backend | 12 tests réussis |
| Tests adaptateur Runway et budget | 16 tests réussis ; les appels au fournisseur sont simulés |
| Suite automatisée complète | 28 tests réussis avec `better-sqlite3` 12.11.1 |
| Parcours HTTP réel en mode développement | 9 contrôles réussis avec `SMOKE_DEV=1 npm run test:smoke` |
| Build de production | `npm run build` réussi |
| Parcours HTTP réel en mode production | 9 contrôles réussis avec le pilote 12.11.1 |
| Démarrage standard de développement | `npm run dev` avec Turbopack ; page HTTP 200 et état initial de configuration correct |
| Audit des dépendances | Aucune vulnérabilité signalée par `npm audit` avec le verrouillage final |
| Parcours dans un navigateur | Authentification initiale, projets, langues, import, vidéo, paramètres et affichage mobile vérifiés |

Le parcours HTTP utilise une base et un stockage temporaires. Il vérifie les migrations répétables, la création du mot de passe, les sessions privées et le refus d'une origine étrangère ; l'import réel d'images et de plusieurs logos ainsi que le refus d'une fausse image et d'un SVG ; la duplication et l'archive ZIP ; le blocage d'une génération payante avec les valeurs par défaut ; la production par le worker d'un vrai MP4 H.264 de cinq secondes, le téléchargement partiel HTTP 206 et l'absence de doublon avec une même clé d'idempotence ; un export réel **3840 × 2160** ; la persistance des projets, des préférences, des médias et de l'authentification après redémarrage ; la déconnexion puis la reconnexion.

Le contrôle du filigrane ne se limite pas à l'existence du fichier : une image est extraite de la vidéo encodée et un pixel situé dans le logo attendu est contrôlé. FFprobe vérifie le codec, la durée et les dimensions. Ces vidéos proviennent de l'animation locale d'une image fixe ; ce ne sont pas des générations IA.

Un contrôle d'export complémentaire a produit une vidéo H.265 en 720p à partir d'une source de test d'une seconde, avec conservation d'une piste AAC et fondu du logo. FFprobe a vérifié la sortie ; des pixels blancs au début puis rouges au milieu confirment l'apparition du logo. Les encodeurs `libx264` et `libx265` sont disponibles dans cette installation de FFmpeg.

## Parcours dans le navigateur

Le parcours vérifié couvre la création du mot de passe, la création d'un projet puis le changement FR/EN sans perte de ce projet, l'import d'une image et la création d'une vidéo locale. Le lecteur lit la vraie vidéo et son temps de lecture avance ; le rafraîchissement de l'état des tâches fonctionne.

Les paramètres sont enregistrés : langue d'interface française, langue de contenu anglaise et thème sombre. Leur persistance a été contrôlée. À une largeur de 390 pixels, la navigation reste utilisable et aucun débordement horizontal n'a été observé. La console du navigateur ne présente plus d'erreur après ajout de l'icône de l'application. Ces contrôles portent sur les parcours exercés, pas sur une certification exhaustive d'accessibilité ou de compatibilité de tous les navigateurs.

## Vérification du budget et des reprises

Les tests Runway incluent dix scénarios financiers exécutés avec une vraie base SQLite dans un processus Node.js dédié : budget nul ; activation, confirmation et prix attendus ; animation locale gratuite de quinze secondes ; plafond face aux soumissions concurrentes et idempotence ; nouvelle vérification du budget par le worker ; envoi ambigu jamais soumis une seconde fois ; prise en compte d'un coût déclaré de zéro dans une réponse simulée ; taux de conversion conservé pour le coût déclaré ; annulation en file ; reprise dans un nouveau processus sans nouvelle requête payante.

Le pilote initial `better-sqlite3` 11.10.0 présentait un arrêt natif non déterministe, également reproduit dans un processus Node.js ordinaire. Il a été remplacé par la version officielle 12.11.1 avec un remplacement ciblé dans le verrouillage des dépendances. La suite complète passe avec cette version ; dix processus Node.js distincts ont aussi exécuté chacun les dix scénarios budgétaires sans reproduire le crash. Le processus de test dédié vérifie le même runtime que le worker avec une vraie base. Il conserve toutes les assertions ; aucun échec n'est masqué en désactivant une assertion ou la vérification du code de sortie.

## Commandes reproductibles

```bash
npm ci
npm run db:deploy
npm run typecheck
npm test
npm run build
npm run test:smoke
```

Le test `test:smoke` utilise le serveur compilé par défaut : exécutez d'abord le build. Il démarre sa propre instance, sans toucher aux projets de votre instance. Il nécessite FFmpeg/FFprobe et un port libre (`SMOKE_PORT` permet de modifier le port utilisé). Pour le contrôle avec le serveur de développement exécuté ci-dessus :

```bash
SMOKE_DEV=1 npm run test:smoke
```

Équivalent PowerShell : `$env:SMOKE_DEV="1"; npm.cmd run test:smoke`. Retirez ensuite cette variable avec `Remove-Item Env:SMOKE_DEV` pour revenir au mode compilé.

Une génération Runway réelle reste un contrôle séparé, payant, qui nécessite une clé valide, un fournisseur activé, un budget suffisant et une confirmation explicite. Les réponses Runway simulées ne valident ni les tarifs du compte, ni l'accès au modèle, ni le téléchargement depuis son CDN en conditions réelles. Aucun résultat de génération IA réelle n'est revendiqué.
