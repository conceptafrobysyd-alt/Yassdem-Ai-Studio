# Installation sous Windows

Le studio s'utilise dans votre navigateur, sur le même ordinateur Windows que celui qui le démarre. Le fichier **`Ouvrir-Yassdem.cmd`** prépare puis lance la version compilée : les pages n'ont plus besoin d'être compilées à leur première visite comme avec `npm run dev`.

## Mettre à jour pour retrouver UGC, Affiliation, Histoires et YouTube

Les modifications envoyées sur GitHub ne mettent pas automatiquement à jour votre ordinateur. Si ces quatre choix sont absents, mettez à jour votre dossier habituel :

1. Arrêtez le studio avec **Ctrl+C** dans sa fenêtre PowerShell. Arrêtez aussi les autres fenêtres que vous avez ouvertes pour Yassdem.
2. **Sauvegardez votre dossier d'installation complet** dans un autre emplacement. Sauvegardez aussi les données situées ailleurs si vous avez configuré des chemins personnalisés.
3. Ouvrez [le dépôt GitHub](https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio) avec votre compte autorisé, puis choisissez **Code → Download ZIP**.
4. Faites un clic droit sur le nouveau ZIP → **Extraire tout**, dans un **nouveau dossier distinct**. Ouvrez le sous-dossier qui contient `package.json`, `package-lock.json` et `Ouvrir-Yassdem.cmd`.
5. Copiez **le contenu** de ce dossier dans votre **dossier d'installation habituel**, en remplaçant les fichiers de code. Pour l'installation déjà utilisée, il s'agit de `C:\Users\diall\Downloads\Yassdem-Ai-Studio-main\Yassdem-Ai-Studio-main`. **Conservez votre `.env`, votre base `prisma/studio.db` et votre dossier `storage/`** ; ils ne sont pas fournis dans le ZIP de sources. `.env.example` reste un exemple de configuration.
6. Dans votre dossier habituel ainsi mis à jour, double-cliquez sur **`Ouvrir-Yassdem.cmd`**. Le premier lancement prépare les dépendances, applique les migrations et compile l'application. Cela peut prendre plusieurs minutes ; laissez la fenêtre ouverte pendant les étapes affichées.
7. Lorsque le studio est prêt, ouvrez l'adresse locale annoncée si le navigateur ne s'est pas ouvert. Par défaut : **[http://localhost:3000/](http://localhost:3000/)**. Actualisez la page avec **Ctrl+F5**.

L'accueil doit proposer **UGC produit**, **Affiliation**, **Histoires et dramas** et **YouTube**, puis le raccourci **« Une photo. À vous de choisir la suite. »**. Le menu contient aussi **Création de contenus**. Consultez le [guide des quatre parcours](CREATION_CONTENUS.md).

Vos projets restent ceux de votre installation habituelle. Les projets filmés dans les vidéos de démonstration ne sont pas importés automatiquement. Si l'ancien accueil reste affiché, vérifiez que vous avez lancé le fichier `Ouvrir-Yassdem.cmd` du dossier que vous venez de mettre à jour.

## Prérequis pour une nouvelle installation

Installez Node.js 24 LTS depuis [nodejs.org](https://nodejs.org/), puis fermez et rouvrez PowerShell. Les versions prises en charge sont Node.js 22 à partir de 22.12, ainsi que 23 et 24 ; les versions 25 et suivantes ne sont pas couvertes par la plage du projet.

Installez FFmpeg et FFprobe à partir d'un distributeur référencé par [ffmpeg.org](https://ffmpeg.org/download.html). Avec Windows Package Manager :

```powershell
winget install --id Gyan.FFmpeg --exact
```

Rouvrez PowerShell et vérifiez :

```powershell
node --version
npm.cmd --version
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -encoders | Select-String 'libx264|libx265'
```

H.264 nécessite `libx264`. H.265 nécessite `libx265` et dépend de la compilation de FFmpeg installée. Vérifiez sa licence avant de redistribuer ses exécutables.

## Première installation de l'application

Ouvrez [le dépôt GitHub](https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio) avec le compte autorisé, puis choisissez **Code → Download ZIP**. Faites un clic droit sur le ZIP → **Extraire tout** et ouvrez le dossier contenant `package.json` et `Ouvrir-Yassdem.cmd`.

Double-cliquez sur **`Ouvrir-Yassdem.cmd`**. Il crée `.env` à partir de `.env.example` uniquement si votre configuration n'existe pas déjà, puis prépare et démarre le studio. N'ajoutez aucune clé pour essayer le mode local. Gardez la fenêtre ouverte pendant l'utilisation ; **Ctrl+C** arrête l'application.

Ouvrez l'adresse annoncée sur ce même ordinateur. À la première ouverture, créez le mot de passe du studio avec **au moins 12 caractères**. Ce compte est personnel ; l'application ne gère pas plusieurs utilisateurs. Ne communiquez pas votre `.env` ni votre mot de passe.

Le téléchargement contient le code. Les projets et médias personnels d'une autre installation, s'ils existent, nécessitent une sauvegarde distincte.

### Préparation manuelle si nécessaire

Pour ouvrir PowerShell dans le dossier du projet, saisissez `powershell` dans la barre d'adresse de l'Explorateur puis appuyez sur Entrée. Vérifiez que `Test-Path .\package-lock.json` donne `True`, puis exécutez ces commandes **une à la fois**, en attendant leur réussite :

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

```powershell
npm.cmd ci
```

```powershell
npm.cmd run db:deploy
```

```powershell
npm.cmd run build
```

```powershell
npm.cmd start
```

Arrêtez la procédure si une commande échoue et relevez son message. Les commandes `.cmd` évitent les restrictions sur `npm.ps1` sans modifier la stratégie d'exécution Windows. Si `.env` existe déjà, conservez-le et complétez uniquement les variables manquantes.

Le pilote `better-sqlite3` contient un module natif. Si aucun binaire précompilé compatible n'est disponible pour votre version de Node.js, npm peut demander une compilation locale. Dans ce cas, suivez les prérequis Windows de [node-gyp](https://github.com/nodejs/node-gyp#on-windows) : Python et Visual Studio Build Tools avec les outils C++. Relancez ensuite `npm.cmd ci` ; ne désactivez pas la vérification TLS pour contourner un problème de téléchargement.

## Chemins personnalisés

Si les exécutables ne sont pas dans le `PATH`, indiquez leurs chemins dans `.env`. Les barres obliques fonctionnent sous Windows et évitent les ambiguïtés d'échappement :

```dotenv
FFMPEG_PATH="C:/Outils/ffmpeg/bin/ffmpeg.exe"
FFPROBE_PATH="C:/Outils/ffmpeg/bin/ffprobe.exe"
STORAGE_DIR="C:/YassdemDonnees/storage"
# Facultatif pour les textes du montage si la police n'est pas trouvée.
FFMPEG_FONT_PATH="C:/Windows/Fonts/arial.ttf"
```

Conservez un dossier de stockage accessible en écriture. Ne synchronisez pas une base SQLite ouverte entre plusieurs machines via un lecteur réseau ou un logiciel de synchronisation.

## Utilisation et dépannage

### Page lente ou avertissement « Slow filesystem »

`npm run dev` utilise un serveur de développement qui compile les pages et surveille les fichiers. Sur l'ordinateur concerné, Next.js a signalé des accès aux fichiers lents. Cet avertissement ne démontre pas que le dossier est un lecteur réseau.

Utilisez **`Ouvrir-Yassdem.cmd`** pour les essais et l'utilisation courante. Il prépare la version de production puis réutilise la compilation tant que ses sources n'ont pas changé. Cette préparation initiale prend du temps ; les ouvertures suivantes évitent la compilation de développement. Une mise à jour du code demande une nouvelle préparation.

Les accès au disque, la puissance de l'ordinateur et les traitements vidéo peuvent encore influer sur la vitesse. Le parcours complet de ce lanceur reste à confirmer sur votre ordinateur Windows ; aucune durée de chargement n'y est garantie.

### Port déjà occupé ou serveur qui s'arrête

Une ancienne instance de Yassdem peut occuper le port ou faire refuser le démarrage d'un second worker. Fermez les anciennes fenêtres identifiées comme Yassdem avec **Ctrl+C**, puis relancez le studio. Le lanceur ne ferme pas un processus inconnu.

Si le serveur affiche `Ready` puis `exited with code 1`, copiez les lignes d'erreur précédentes, notamment celles marquées `[worker]`. Le changement automatique de port en mode développement ne suffit pas à identifier la cause d'un arrêt.

### Création du mot de passe refusée avec HTTP 403

Les versions antérieures au correctif du 23 octobre 2026 pouvaient afficher « Vérifiez les champs renseignés » en ouvrant le studio avec l'adresse IP locale `127.0.0.1`. Next.js normalisait cette adresse en `localhost` dans son URL interne, ce qui déclenchait à tort le contrôle d'origine.

Pour continuer avec une copie ancienne, remplacez `127.0.0.1` par `localhost` dans l'adresse du navigateur, en conservant le port annoncé par le terminal. Réessayez ensuite la création du mot de passe. Ce contournement suppose la configuration locale par défaut, sans `APP_ORIGIN` explicite.

La version corrigée accepte les adresses locales autorisées lorsqu'Origin et Host correspondent exactement, avec le même protocole et le même port. Elle affiche un message propre aux erreurs d'adresse. Une éventuelle valeur `APP_ORIGIN` reste stricte et doit correspondre à l'adresse réellement utilisée. La première création du mot de passe reste locale.

Conservez votre `.env`, la base `prisma/studio.db` et le dossier `storage/` lors d'une mise à jour du code. Ne supprimez pas les données pour résoudre une erreur d'adresse.

### Exports et données

Les processus web et worker démarrent ensemble. Gardez la fenêtre du studio ouverte pendant les générations et les exports. Après un redémarrage de Windows, double-cliquez de nouveau sur `Ouvrir-Yassdem.cmd`. Vos projets restent dans la base SQLite et les fichiers dans le stockage local.

Si l'encodage échoue, vérifiez d'abord FFmpeg, FFprobe et l'encodeur demandé. Essayez 720p H.264 pour vérifier le parcours sur une machine peu puissante. Le 2160p et H.265 demandent davantage de temps CPU et de mémoire. Aucun GPU dédié ni modèle IA local n'est requis pour l'animation d'une image fixe, le montage vidéo ou la rédaction Pinterest par modèles de texte. Les textes du montage nécessitent le filtre `drawtext` de FFmpeg et une police locale accessible.

Si une migration échoue, vérifiez `DATABASE_URL` et les droits du dossier avant de relancer `npm.cmd run db:deploy`. Ne supprimez pas une base contenant vos projets pour résoudre un simple problème d'installation.

Pour Runway, suivez le [guide de configuration](RUNWAY.md). Une génération réelle nécessite une connexion Internet et peut être facturée par le fournisseur.
