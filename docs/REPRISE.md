# Point de reprise

Dernière mise à jour : 27 octobre 2026.

## Consigne de continuité

L'utilisateur souhaite reprendre le travail dès que le service le permet, conserver chaque étape validée dans Git et poursuivre les fonctions restantes. Une interruption ne remet pas en cause les actions déjà autorisées. À chaque reprise, consulter ce fichier, `AGENTS.md`, `git status --short` et `git log` avant de modifier le projet.

Cette consigne s'applique lorsqu'une session de travail reprend. Elle ne programme pas de nouvelle session et ne garantit ni une exécution en arrière-plan ni un redémarrage automatique après une limite du service.

## État conservé

- Les phases 1 à 5 et quatre compléments sont enregistrés dans Git. `3eb9d66` correspond au catalogue des modèles et fournisseurs vidéo compatibles. Le correctif fonctionnel du 23 octobre porte sur les adresses locales de première connexion ; `git log` donne les derniers commits. Les tags `phase-*` et `complement-*` repèrent les étapes de livraison initiales.
- La dernière suite complète compte 269 tests réussis dans 20 fichiers, TypeScript et le build réexécutés le 27 octobre après l'optimisation de l'accueil. Le parcours HTTP produit du 23 octobre avait repassé dix contrôles sans `APP_ORIGIN` explicite ; les résultats Fashion et montage/Pinterest datent des étapes précédentes. Chromium avait aussi validé la création du compte via l'IP locale et la connexion via localhost. Les preuves et limites sont dans [VALIDATION.md](VALIDATION.md) ; ne pas présenter les résultats historiques comme une nouvelle exécution après une réinitialisation.
- Aucun appel IA payant n'a été validé. Le budget par défaut est nul. Les modes ComfyUI et Ollama nécessitent encore leurs services et modèles ; les essais réels Runway et Replicate nécessitent une configuration et une confirmation de dépense.
- L'import produit est implémenté et testé avec transport simulé ; l'accès à une boutique réelle reste à valider dans un environnement réseau compatible.
- Après la réponse « accès GitHub vérifié » du 22 octobre 2026, l'envoi de `main` et des huit tags a réussi. Les références distantes ont été comparées aux références locales. Le refus HTTP 403 est résolu pour cet envoi ; conserver les prochains commits avec des pushes normaux, sans modifier l'authentification gérée par la plateforme.

## Accueil allégé et installation Windows du 27 octobre

L'utilisateur signale une page lente et l'absence des fonctions UGC dans sa copie Windows. Les quatre parcours sont déjà présents sur GitHub ; sa copie locale doit être mise à jour. Les derniers journaux Windows montrent web et worker prêts sur le port 3000, avec un avertissement d'accès aux fichiers lent en mode développement. L'avertissement ne prouve pas que son dossier est un lecteur réseau.

L'accueil charge désormais les ateliers à la demande ; l'atelier de contenus n'est monté qu'à sa première ouverture puis conserve ses brouillons. Le suivi des tâches ne superpose plus les requêtes lentes. La mesure Chromium en production passe de 253 091 à 191 058 octets JavaScript encodés à l'accueil (24,5 % de moins). Le suivi avec des réponses retardées de 3,7 secondes reste séquentiel. Le parcours complet des quatre objectifs, les montages et les téléchargements sont revérifiés sans erreur ni appel payant. Cette étape est sauvegardée dans `56d7404`.

Le lanceur **Ouvrir-Yassdem.cmd** prépare ensuite la version de production et réutilise son build, pour éviter le coût de compilation du mode développement. Il conserve `.env`, base et médias, applique les migrations sans reset, refuse les conflits de port/worker sans arrêter de processus inconnu et ouvre le navigateur seulement après disponibilité web/worker/HTTP. Les cinq tests Node de `npm run test:launcher` passent : préservation, cache, changements et interruptions, configuration locale, port HTTP occupé et disponibilité. Les tâches npm de préparation sont simulées ; le `.cmd` et les commandes Windows restent à confirmer sur le PC réel. Le [guide Windows](INSTALLATION_WINDOWS.md) est réorganisé autour de la mise à jour ZIP puis du double-clic. Les modifications GitHub ne remplacent toujours pas automatiquement la copie Windows.

## Création de contenus livrée

L'utilisateur a approuvé les quatre objectifs : UGC, affiliation, histoires/dramas fictifs et YouTube. Le moteur prépare des scénarios FR/EN modifiables, les persiste avec contrôle de révision et validation humaine, puis traite de vrais montages de scènes avec fichiers importés ou cartons texte, voix facultative, musique, logo, couverture et SRT. Les épisodes réutilisent une bible de personnages ; une déclinaison YouTube prépare un nouveau projet vertical abrégé. Les tests et le build sont validés, y compris un vrai aperçu de 130 secondes et une narration anglaise locale. Aucun moteur de personnages IA n'a été installé.

L'interface des quatre parcours est validée dans Chromium en production : brouillons conservés, approbation, réponse perdue puis reprise de création/enregistrement/rendu sans doublon, vrais exports MP4/JPEG/SRT, épisodes suivants, version courte YouTube, langues, thèmes et mobile. Le moteur et l'interface sont livrés en deux étapes Git. Le [guide utilisateur](CREATION_CONTENUS.md) inclut une capture avec des données fictives ; la [note de positionnement](POSITIONNEMENT_COMMERCIAL.md) précise les travaux futurs avant une vente comme service. Les contrôles n'ont pas modifié l'instance existante ; leurs services et données temporaires sont nettoyés.

L'utilisateur demande aussi si le produit est vendable et comparable à d'autres. La réponse : se spécialiser d'abord sur les créatrices et affiliées francophones ; valider la demande avec des utilisatrices. La version actuelle est personnelle, pas un SaaS multi-clients : comptes, isolation des données, facturation et maîtrise des coûts sont des développements futurs, pas des fonctions livrées.

## Parcours simplifié et outils gratuits

L'utilisateur trouve le studio peu intuitif et souhaite importer une photo puis choisir un résultat en un clic. L'accueil présente désormais **Créer ma vidéo**, **Préparer ma photo** et **Photo avec mannequin**. Le projet vidéo est créé automatiquement ; la photo cadrée rejoint la bibliothèque. Les ateliers détaillés restent facultatifs. Les clés de reprise empêchent les doublons de projet et de tâche après une réponse perdue pour les raccourcis vidéo et mannequin. La création vidéo rapide reste locale même si un fournisseur payant est préféré dans les réglages avancés.

La [création rapide](CREATION_RAPIDE.md) décrit le nouveau parcours. La [recherche GitHub](OUTILS_GRATUITS.md) compare huit outils avec leurs licences, leurs modèles et leurs besoins matériels ; elle examine aussi les projets Adobe et d'essayage dont les conditions commerciales empêchent une activation par défaut. Aucune nouvelle dépendance ni modèle n'a été installé. Le bouton mannequin exige un service et un workflow ComfyUI compatibles ; il ne prouve pas une inférence réelle ni un essayage fidèle.

Le parcours Chromium en production a validé l'import puis le clic unique, le vrai MP4 et son téléchargement, la réponse perdue après acceptation et sa reprise sans doublon, le PNG dans la bibliothèque, les sources préexistantes conservées, les langues, la navigation, les thèmes et le mobile. La [capture du nouvel accueil](media/creation-rapide.png) utilise des données fictives. Les bases, stockages et processus de contrôle isolés ont été nettoyés ; l'instance existante a été conservée.

L'utilisateur ne connaît pas sa carte graphique. Le document explique comment en relever le nom sur Windows. Le choix et l'installation d'un modèle utilisable restent à faire selon son matériel et les licences de toute la chaîne. Les modifications GitHub ne mettent pas automatiquement à jour sa copie Windows ; conserver `.env`, la base et `storage/` lors de cette mise à jour.

## Démonstration des quatre parcours du 27 octobre

À la demande de l'utilisateur, une [nouvelle visite vidéo](DEMO_CONTENUS.md) présente UGC, affiliation, histoires/dramas et YouTube en environ 2 min 28 s. Elle montre la préparation du scénario, l'import, la validation et les véritables aperçu et montage UGC, puis les mentions d'affiliation, l'épisode suivant et la version courte YouTube. Les légendes sont en français, avec une musique originale et sans voix off. Un MP4 produit d'environ dix secondes et son SRT sont fournis séparément.

Les exemples sont fictifs et les résultats sont calculés par les fonctions locales sur une instance isolée. L'application et les données personnelles restent inchangées. La fiction et YouTube montrent la préparation des scénarios, sans génération d'acteurs ni de personnages IA. Les fichiers sont volontairement versionnés dans `docs/media/`. La visite des huit ateliers du 23 octobre reste disponible séparément.

## Démonstration des huit ateliers du 23 octobre

La visite est disponible dans [DEMONSTRATION.md](DEMONSTRATION.md), avec une [vidéo de 2 min 37 s](media/demo-yassdem.mp4), neuf captures et un [pack d'exemples](media/exemples-yassdem.zip). Les huit écrans sont présentés en français. Le guide accompagne un premier parcours avec vidéo produit, planche Fashion, montage, Pinterest et sauvegarde. Les fichiers du pack sont des illustrations et une musique originales ; ses résultats ont été réellement produits par les fonctions locales, sans appel IA ni dépense.

L'enregistrement et les téléchargements ont été vérifiés dans Chromium sur une instance séparée, sans toucher aux données personnelles. Voir [VALIDATION.md](VALIDATION.md). Ces fichiers de démonstration sont volontairement versionnés sous `docs/media/` ; les médias personnels restent exclus. Pour livrer les fichiers à l'utilisateur, utiliser les liens du dépôt GitHub plutôt qu'un chemin `/workspace` inaccessible depuis Windows. Les projets filmés ne sont pas automatiquement installés sur son ordinateur : extraire le pack et suivre le guide.

## Installation Windows à confirmer

Le code et l'historique sont sauvegardés sur GitHub. L'utilisateur a récupéré et extrait le ZIP sur Windows. Node.js 24.22.1 et npm 11.19.1 sont reconnus ; FFprobe 9.0.2 a aussi été confirmé après installation de FFmpeg. Le dossier du projet a été retrouvé dans le sous-dossier homonyme issu de l'extraction. Le serveur web et le worker ont démarré sur sa machine.

La création du mot de passe sur l'adresse IP locale a ensuite échoué avec HTTP 403 et le message générique « Vérifiez les champs renseignés ». Le défaut a été reproduit : NextRequest normalise l'IP locale en `localhost` tout en conservant les en-têtes Origin/Host du navigateur. Le contournement communiqué est d'utiliser `localhost` avec le même port dans le navigateur Windows. Le succès de la création du mot de passe et le premier parcours sur son ordinateur restent à confirmer. Le correctif durable, ses limites et les données à préserver sont décrits dans [INSTALLATION_WINDOWS.md](INSTALLATION_WINDOWS.md).

Deux archives du code sont présentes hors du dépôt :

- `/workspace/yassdem-ai-studio.bundle` : historique Git, branche `main` et tags ; restauration déjà vérifiée dans une copie isolée.
- `/workspace/yassdem-ai-studio-source.zip` : sources du commit archivé, sans historique Git.

Elles excluent les secrets, la base, les médias personnels et les dépendances. Leur présence dans le cloud ne prouve pas que l'utilisateur les a téléchargées. Ne pas inventer de lien public ni de bouton de téléchargement de l'interface. Après une modification du dépôt, régénérer les archives depuis le commit validé et vérifier leur contenu.

Pour les projets et médias, le parcours existant est **Paramètres → Sauvegarde → nom du projet**. Il produit un ZIP individuel ; il ne sauvegarde pas le code ni l'instance entière. Les procédures distinctes sont dans [GIT_SYNCHRONISATION.md](GIT_SYNCHRONISATION.md) et [ARCHITECTURE.md](ARCHITECTURE.md).

## Maintenance de sécurité ajoutée

L'utilisateur souhaite prévenir les futurs problèmes de sécurité et ne dispose pas d'une alerte PHP précise. Aucun PHP n'est utilisé par le projet. Les audits npm de production et complets du 22 octobre 2026 n'ont signalé aucune vulnérabilité connue. La commande prévue pour GitHub, `npm audit --package-lock-only --ignore-scripts --audit-level=low`, a aussi réussi localement.

La configuration Dependabot hebdomadaire et le workflow GitHub de contrôle des dépendances sont ajoutés au dépôt ; voir [SECURITE.md](SECURITE.md). Ils ne fusionnent aucune mise à jour et ne mettent pas à jour automatiquement l'installation Windows. L'exécution distante du workflow et les paramètres d'alertes du compte ne sont pas encore vérifiés. Ne pas promettre une sécurité absolue ni prétendre que l'hébergement est audité.

## Reprendre sans perdre de données

Vérifier les fichiers et services présents avant toute installation ou relance. Conserver `.env`, la base et `storage/`. Ne pas lancer de second worker sur le même stockage. Ne pas supposer que les processus précédents ont survécu à l'interruption. Les réglages cloud préparés doivent encore être enregistrés ou publiés depuis l'interface de configuration ; leur présence en brouillon n'est pas une validation d'une nouvelle tâche.
