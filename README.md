# Yassdem AI Studio

Studio personnel de création de vidéos produits et de collections fashion. Les phases 1 à 3 apportent les projets, la médiathèque, les paramètres, l'animation locale d'une photo, l'adaptateur Runway, les exports MP4, les profils de mannequins et la composition de looks. L'interface propose le français et l'anglais.

Le parcours local produit de vrais fichiers : vidéo par zoom FFmpeg d'une image fixe et planche de vêtements par assemblage Sharp. Ces deux modes sont sans IA. Les intégrations Runway et ComfyUI sont implémentées ; aucune génération Runway, image éditoriale IA ou véritable inférence d'essayage virtuel n'a été validée avec un fournisseur réel pour cette livraison.

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

Pour une collection fashion, choisissez Fashion Studio ou Lookbook Creator, importez de 1 à 8 vêtements, enregistrez un profil de mannequin facultatif puis composez un look. Le mode **Planche de collection** crée un PNG de vos photos originales, sans les faire porter au mannequin. Vous pouvez créer des variantes, comparer les originaux et le résultat, télécharger la planche puis l'ouvrir dans le studio vidéo. Le [guide de phase 3](docs/PHASE_3.md) détaille ce parcours et les workflows IA optionnels.

## Données et configuration

Le fichier `.env.example` décrit les variables prises en charge. `DATABASE_URL="file:./studio.db"` crée la base dans `prisma/studio.db`. `STORAGE_DIR="./storage"` désigne les médias et la clé locale de session ; utilisez un chemin absolu pour partager un emplacement précis entre les processus. Les fichiers `.env`, la base et `storage/` sont exclus de Git.

`RUNWAY_API_KEY` reste exclusivement sur le serveur. Elle est facultative pour le fonctionnement local. Ne la placez jamais dans une variable `NEXT_PUBLIC_*`, un prompt, une capture d'écran ou un commit. `FFMPEG_PATH` et `FFPROBE_PATH` permettent de préciser les exécutables si nécessaire. Le [guide Runway](docs/RUNWAY.md) détaille la connexion, les coûts et les limites.

ComfyUI est facultatif. Les modes Fashion IA demandent un service séparé, ses modèles et des graphes API adaptés, configurés avec `COMFYUI_URL`, `COMFYUI_FASHION_WORKFLOW` et `COMFYUI_TRYON_WORKFLOW`. Aucun GPU ni poids de modèle n'est installé automatiquement. Le guide de phase 3 décrit le contrat des fichiers JSON et distingue la validité de leur configuration d'une inférence réellement réussie.

Cette version est destinée à un usage personnel sur une machine de confiance. Un déploiement distant demande un volume persistant pour la base et les médias, HTTPS, un contrôle des accès et une sauvegarde externe. Il ne faut pas utiliser un hébergement de fonctions éphémères pour le worker et les fichiers locaux.

## Vérification et documentation

```bash
npm run typecheck
npm test
npm run build
npm run test:smoke
npm run test:smoke:fashion
```

Les tests HTTP nécessitent le build et démarrent leur propre instance avec une base et un stockage temporaires. `test:smoke` produit de vrais MP4 avec FFmpeg ; `test:smoke:fashion` vérifie les profils, les looks, les archives et une vraie planche PNG. Les tests d'adaptateurs IA utilisent des réponses simulées et ne déclenchent pas d'appel payant. Les validations réellement exécutées et leurs limites sont consignées dans [VALIDATION.md](docs/VALIDATION.md).

- [Architecture et exploitation](docs/ARCHITECTURE.md)
- [Installation Windows](docs/INSTALLATION_WINDOWS.md)
- [Configuration Runway et budget](docs/RUNWAY.md)
- [Fashion, lookbooks et configuration ComfyUI](docs/PHASE_3.md)
- [Fonctionnalités et limites](docs/FONCTIONNALITES.md)
- [Licences des composants](LICENSES.md)

Les phases 4 et 5 restent à valider et livrer séparément : montage de plusieurs clips, SEO Pinterest et fournisseurs IA supplémentaires. Les modes Fashion IA restent conditionnés à une installation ComfyUI compatible et à sa validation réelle. Consultez l'inventaire avant de considérer un élément du cahier des charges comme livré.
