# Sauvegarde Git et synchronisation GitHub

Les étapes validées sont enregistrées en commits locaux et repérées par les tags `phase-1-2`, `phase-3`, `phase-4` et `phase-5`. Les commits des premières étapes sont `43c40c9` (phases 1–2), `74b79d6` (phase 3) et `fbebbff` (phase 4) ; `git log` affiche aussi le commit final de phase 5.

Lors de cette livraison, GitHub refuse les envois vers `conceptafrobysyd-alt/Yassdem-Ai-Studio` avec une erreur **403 — accès en écriture refusé**. Les commits restent disponibles localement. Une mise à niveau d’abonnement ne modifie pas les autorisations de ce dépôt. Vérifiez les droits du compte et de la connexion GitHub utilisée pour ce dépôt ; aucun jeton ne doit être envoyé dans le chat ou ajouté aux fichiers.

## Récupérer les sauvegardes

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
git tag --list 'phase-*'
git remote set-url origin https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio.git
git push -u origin main
git push origin phase-1-2 phase-3 phase-4 phase-5
```

Utilisez l’authentification GitHub habituelle de votre machine. N’insérez aucun jeton dans l’URL du dépôt. Un nouvel échec 403 exige de corriger les droits de la connexion ; répéter le même envoi ne les modifie pas.

Si GitHub signale que le dépôt contient déjà d’autres commits, récupérez et examinez cet historique avant de l’intégrer. N’utilisez pas `--force` et ne remplacez pas le travail distant pour résoudre un refus d’envoi.

## Reprendre dans l’environnement actuel

Une fois les droits corrigés pour la connexion utilisée par cet environnement, les commits sont déjà dans le dépôt de travail :

```bash
cd /workspace/Yassdem-Ai-Studio
git status --short
git log --oneline --decorate -5
git push -u origin main
git push origin phase-1-2 phase-3 phase-4 phase-5
```

Un commit local, une sauvegarde bundle et un envoi GitHub réussi sont trois états distincts. La présence des deux premiers ne prouve pas la synchronisation distante.
