# Yassdem AI Studio

Studio personnel de création de vidéos produits. Cette version implémente le socle des phases 1 et 2 : projets, médiathèque, paramètres, animation locale d'une photo, adaptateur Runway et export MP4. Le parcours local a été vérifié ; la génération Runway réelle reste à valider avec un compte configuré. L'interface propose le français et l'anglais.

L'animation locale est un mouvement de caméra sur une image fixe avec FFmpeg. Ce n'est pas une génération IA. L'intégration Runway est implémentée mais une génération réelle nécessite votre clé, votre budget et une confirmation ; aucun résultat Runway réel n'est fourni avec le projet.

## Installation rapide

Prérequis : Node.js 22.12 ou ultérieur dans les branches 22 à 24, npm, FFmpeg et FFprobe disponibles dans le `PATH`. Utilisez de préférence Node.js 24 LTS. FFmpeg doit disposer de `libx264` pour H.264 ; `libx265` est nécessaire pour H.265. Aucun GPU n'est nécessaire pour le parcours local.

Depuis le dossier du projet, sous Linux ou macOS :

```bash
[ -f .env ] || cp .env.example .env
npm ci
npm run db:deploy
npm run dev
```

La première commande conserve un éventuel `.env` existant. `npm ci` installe les versions du fichier de verrouillage. `npm install` convient lors d'une évolution volontaire des dépendances. Le script d'installation génère le client Prisma ; la commande `db:deploy` applique les migrations SQLite.

Sous Debian/Ubuntu, installez FFmpeg avec `sudo apt-get install ffmpeg`. Sous macOS avec Homebrew : `brew install ffmpeg`. Vérifiez ensuite `ffmpeg -version` et `ffprobe -version`. Le [guide Windows](docs/INSTALLATION_WINDOWS.md) décrit les équivalents PowerShell.

`npm run dev` lance le serveur Next.js et le worker vidéo ensemble. Ouvrez l'adresse affichée dans le terminal. Au premier lancement, créez un mot de passe privé d'au moins 12 caractères. Effectuez cette étape en local avant toute exposition publique. Les scripts écoutent sur l'interface de boucle locale par défaut.

Pour une exécution de production locale :

```bash
npm run build
npm start
```

Gardez le terminal actif : le worker traite les tâches persistées en base. `Ctrl+C` arrête les deux processus.

## Premier parcours

1. Créez un projet et importez une photo PNG, JPEG ou WebP.
2. Ouvrez Product Video Studio, sélectionnez cette image et choisissez le format, la durée et la résolution.
3. Choisissez l'animation locale pour produire une vraie vidéo sans frais d'API. Le fournisseur Runway se configure séparément dans les paramètres.
4. Consultez la tâche, prévisualisez le MP4 terminé puis téléchargez-le. Un logo de la médiathèque peut servir de filigrane.

Le budget mensuel est de **0 €** par défaut et Runway est désactivé. Le parcours local ne déclenche aucun appel payant.

## Données et configuration

Le fichier `.env.example` décrit les variables prises en charge. `DATABASE_URL="file:./studio.db"` crée la base dans `prisma/studio.db`. `STORAGE_DIR="./storage"` désigne les médias et la clé locale de session ; utilisez un chemin absolu pour partager un emplacement précis entre les processus. Les fichiers `.env`, la base et `storage/` sont exclus de Git.

`RUNWAY_API_KEY` reste exclusivement sur le serveur. Elle est facultative pour le fonctionnement local. Ne la placez jamais dans une variable `NEXT_PUBLIC_*`, un prompt, une capture d'écran ou un commit. `FFMPEG_PATH` et `FFPROBE_PATH` permettent de préciser les exécutables si nécessaire. Le [guide Runway](docs/RUNWAY.md) détaille la connexion, les coûts et les limites.

Cette version est destinée à un usage personnel sur une machine de confiance. Un déploiement distant demande un volume persistant pour la base et les médias, HTTPS, un contrôle des accès et une sauvegarde externe. Il ne faut pas utiliser un hébergement de fonctions éphémères pour le worker et les fichiers locaux.

## Vérification et documentation

```bash
npm run typecheck
npm test
npm run build
npm run test:smoke
```

Le test `test:smoke` nécessite le build ; il démarre sa propre instance avec une base et un stockage temporaires, importe une image puis produit de vrais MP4 avec FFmpeg. Les tests automatisés ne déclenchent pas d'appel Runway payant. Les validations réellement exécutées et leurs limites sont consignées dans [VALIDATION.md](docs/VALIDATION.md).

- [Architecture et exploitation](docs/ARCHITECTURE.md)
- [Installation Windows](docs/INSTALLATION_WINDOWS.md)
- [Configuration Runway et budget](docs/RUNWAY.md)
- [Fonctionnalités et limites](docs/FONCTIONNALITES.md)
- [Licences des composants](LICENSES.md)

Les phases 3 à 5 restent à développer : mannequins et virtual try-on, lookbooks, montage multipiste, SEO Pinterest et fournisseurs IA supplémentaires. Consultez l'inventaire avant de considérer un élément du cahier des charges comme livré.
