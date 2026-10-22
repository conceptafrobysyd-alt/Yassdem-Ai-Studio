# Sauvegarde Git et synchronisation GitHub

Les étapes validées sont enregistrées en commits locaux et repérées par les tags `phase-1-2`, `phase-3`, `phase-4`, `phase-5` puis `complement-*`. Les premiers compléments sont `31511b7` (aperçus), `144fd8d` (styles) et `ded55a5` (import autorisé) ; `git log` affiche aussi le complément du catalogue et les dernières vérifications.

Le **22 octobre 2026**, après vérification de l'accès par l'utilisateur, l'envoi de `main` et des huit tags de livraison vers [conceptafrobysyd-alt/Yassdem-Ai-Studio](https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio) a réussi. Une lecture des références distantes a confirmé leur correspondance avec les références locales. Le refus HTTP 403 rencontré auparavant est résolu pour cet envoi.

Cette sauvegarde GitHub conserve le code et son historique. Elle ne contient ni la base de projets, ni les médias personnels, ni la configuration secrète de l'instance. Leur sauvegarde reste distincte.

## Récupérer le code depuis GitHub

Ouvrez le dépôt avec le compte GitHub autorisé. Pour récupérer les sources sans installer Git, choisissez **Code → Download ZIP**, puis extrayez l'archive sur votre ordinateur. Sous Windows, ouvrez le dossier extrait qui contient `package.json` et suivez [INSTALLATION_WINDOWS.md](INSTALLATION_WINDOWS.md).

Pour conserver aussi l'historique, utilisez Git depuis une machine autorisée :

```bash
git clone https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio.git
cd Yassdem-Ai-Studio
git log --oneline --decorate -5
git tag --list
```

La récupération du code ne récupère pas les données privées d'une instance existante.

## Archives complémentaires de l'environnement

Deux artefacts sont préparés hors du dépôt dans l’environnement :

| Fichier                                   | Contenu                                                      |
| ----------------------------------------- | ------------------------------------------------------------ |
| `/workspace/yassdem-ai-studio.bundle`     | Historique Git, branche `main`, commits et tags de livraison |
| `/workspace/yassdem-ai-studio-source.zip` | Sources du dernier commit, sans historique Git               |

Téléchargez-les sur votre machine et conservez-les sur un support durable. Le bundle permet de reprendre le travail et de publier les commits. Le ZIP permet de consulter ou installer le code, mais ne remplace pas l’historique Git.

Ces artefacts ne contiennent ni `.env`, ni base SQLite, ni médias personnels, ni clé de session, ni dépendances ou builds locaux. Le fichier `.env.example` contient uniquement les noms de configuration et des valeurs non secrètes. Pour conserver les projets et médias d’une instance utilisée, effectuez également la sauvegarde de données décrite dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Envoyer depuis une machine autorisée

Avec Git installé et une connexion disposant des droits d’écriture au dépôt, clonez le bundle dans un nouveau dossier. Remplacez `/chemin/` par son emplacement réel :

```bash
git clone -b main /chemin/yassdem-ai-studio.bundle Yassdem-Ai-Studio
cd Yassdem-Ai-Studio
git bundle verify /chemin/yassdem-ai-studio.bundle
git log --oneline --decorate -5
git tag --list
git remote set-url origin https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio.git
git push -u origin main
git push origin --tags
```

Utilisez l’authentification GitHub habituelle de votre machine. N’insérez aucun jeton dans l’URL du dépôt. Un nouvel échec 403 exige de corriger les droits de la connexion ; répéter le même envoi ne les modifie pas.

Si GitHub signale que le dépôt contient déjà d’autres commits, récupérez et examinez cet historique avant de l’intégrer. N’utilisez pas `--force` et ne remplacez pas le travail distant pour résoudre un refus d’envoi.

## Reprendre dans l’environnement actuel

Les commits sont déjà dans le dépôt de travail. Pour envoyer une nouvelle étape validée avec la connexion autorisée :

```bash
cd /workspace/Yassdem-Ai-Studio
git status --short
git log --oneline --decorate -5
git push -u origin main
git push origin --tags
```

Un commit local, une sauvegarde bundle et un envoi GitHub réussi sont trois états distincts. La présence des deux premiers ne prouve pas la synchronisation distante.
