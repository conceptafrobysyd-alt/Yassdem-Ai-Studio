# Installation sous Windows

## Prérequis

Installez Node.js 24 LTS depuis [nodejs.org](https://nodejs.org/), puis fermez et rouvrez PowerShell. Node.js 22.12 ou ultérieur est également pris en charge ; les versions 25 et suivantes ne sont pas couvertes par la plage du projet.

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

## Récupérer le code

Ouvrez [le dépôt GitHub](https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio) avec le compte autorisé, puis choisissez **Code → Download ZIP**. Le code et les tags de livraison y ont été envoyés le 22 octobre 2026.

Dans l'Explorateur Windows, faites un clic droit sur le ZIP et choisissez **Extraire tout**. Ouvrez le dossier extrait qui contient `package.json` et `.env.example` : c'est le dossier du projet. Son nom peut être `Yassdem-Ai-Studio-main`. Pour ouvrir PowerShell dans ce dossier, saisissez `powershell` dans la barre d'adresse de l'Explorateur puis appuyez sur Entrée.

Le téléchargement contient le code. Les projets et médias personnels d'une autre installation, s'ils existent, nécessitent une sauvegarde distincte.

## Installation de l'application

Ouvrez PowerShell dans le dossier du projet. Les commandes `.cmd` évitent les restrictions PowerShell portant sur les scripts `npm.ps1` sans changer la stratégie d'exécution Windows.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
npm.cmd run db:deploy
npm.cmd run dev
```

Si `.env` existe déjà, conservez-le et complétez uniquement les variables manquantes. Le fichier n'est jamais à partager. N'ajoutez aucune clé pour essayer le mode local.

Le pilote `better-sqlite3` contient un module natif. Si aucun binaire précompilé compatible n'est disponible pour votre version de Node.js, npm peut demander une compilation locale. Dans ce cas, suivez les prérequis Windows de [node-gyp](https://github.com/nodejs/node-gyp#on-windows) : Python et Visual Studio Build Tools avec les outils C++. Relancez ensuite `npm.cmd ci` ; ne désactivez pas la vérification TLS pour contourner un problème de téléchargement.

Ouvrez l'adresse indiquée dans le terminal et créez le mot de passe du studio avant toute publication de l'adresse à d'autres personnes. Ce compte est personnel ; l'application ne gère pas plusieurs utilisateurs.

Les processus web et worker démarrent ensemble. Laissez PowerShell ouvert pendant les générations et exports ; `Ctrl+C` arrête l'application.

## Chemins personnalisés

Si les exécutables ne sont pas dans le `PATH`, indiquez leurs chemins dans `.env`. Les barres obliques fonctionnent sous Windows et évitent les ambiguïtés d'échappement :

```dotenv
FFMPEG_PATH="C:/Outils/ffmpeg/bin/ffmpeg.exe"
FFPROBE_PATH="C:/Outils/ffmpeg/bin/ffprobe.exe"
STORAGE_DIR="C:/YassdemDonnees/storage"
# Facultatif pour les textes du montage si la police n’est pas trouvée.
FFMPEG_FONT_PATH="C:/Windows/Fonts/arial.ttf"
```

Conservez un dossier de stockage accessible en écriture. Ne synchronisez pas une base SQLite ouverte entre plusieurs machines via un lecteur réseau ou un logiciel de synchronisation.

## Utilisation et dépannage

Pour démarrer une version compilée : `npm.cmd run build`, puis `npm.cmd start`. Après un redémarrage de Windows, revenez dans le dossier du projet et relancez la commande souhaitée. Vos projets restent dans la base SQLite et les fichiers dans le stockage local.

Si l'encodage échoue, vérifiez d'abord FFmpeg, FFprobe et l'encodeur demandé. Essayez 720p H.264 pour vérifier le parcours sur une machine peu puissante. Le 2160p et H.265 demandent davantage de temps CPU et de mémoire. Aucun GPU dédié ni modèle IA local n'est requis pour l'animation d'une image fixe, le montage vidéo ou la rédaction Pinterest par modèles de texte. Les textes du montage nécessitent le filtre `drawtext` de FFmpeg et une police locale accessible.

Si un port est déjà occupé, fermez l'ancienne instance du studio. Si une migration échoue, vérifiez `DATABASE_URL` et les droits du dossier avant de relancer `npm.cmd run db:deploy`. Ne supprimez pas une base contenant vos projets pour résoudre un simple problème d'installation.

Pour Runway, suivez le [guide de configuration](RUNWAY.md). Une génération réelle nécessite une connexion Internet et peut être facturée par le fournisseur.
