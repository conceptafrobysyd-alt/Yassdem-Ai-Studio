# Validation

Résultats constatés les **19, 20, 23 et 26 octobre 2026** dans l'environnement Linux cloud, avec vérification dans un navigateur réel. Les tests payants Runway n'ont pas été exécutés. Le premier démarrage Windows a été rapporté par l'utilisateur ; le parcours complet sur sa machine et l'installation macOS ne sont pas encore validés.

## État actuel

La suite complète compte **269 tests réussis dans 20 fichiers** après l'ajout du moteur de création de contenus du 26 octobre. TypeScript, la génération des types Next.js et le build de production passent. Le parcours HTTP produit du 23 octobre avait réussi **dix contrôles** sans `APP_ORIGIN` explicite, dont les adresses locales et les protections d'origine. Ces contrôles HTTP et les parcours Fashion et montage/Pinterest des étapes précédentes ne sont pas présentés comme une nouvelle exécution le 26 octobre.

## Moteur de contenus UGC, affiliation, fiction et YouTube

Les nouveaux contrôles ajoutent 23 tests Vitest : 12 pour les scénarios, cinq pour les voix, quatre pour le rendu et deux tests pilotant respectivement neuf groupes SQLite/API et dix groupes de traitement persistant. Ces groupes ne sont pas ajoutés au nombre de tests Vitest.

Les scénarios FR/EN, les faits produits, les mentions d'affiliation, les personnages et épisodes, les limites de scènes et les durées jusqu'à dix minutes sont validés. Les créations et versions courtes utilisent des clés de reprise ; les modifications contrôlent les révisions, et la validation humaine est exigée avant rendu. Une répétition d'enregistrement identique après réponse perdue retrouve la même révision. Les autres ateliers, sources existantes, duplications et archives ZIP sont conservés. Les routes restent privées et contrôlent l'origine.

FFmpeg a réellement produit des montages de plusieurs scènes à partir d'images, vidéos, cartons texte, voix et musique, avec logo, mention publicitaire permanente, couverture et SRT. Les contrôles vérifient les pixels, l'audio décodé, les durées, l'intégrité des sources, les limites et le nettoyage après échec. L'aperçu est en 360p et l'export en 720p ; un aperçu YouTube de **130 secondes en 640 × 360** a été encodé, au-delà de l'ancienne limite de deux minutes de l'éditeur. Les sous-titres proviennent du scénario approuvé, sans reconnaissance vocale. Un SRT sans texte reste téléchargeable correctement, y compris le refus d'une plage impossible sur ce fichier vide.

Le traitement persistant vérifie la concurrence, les conflits de clé, les droits musicaux, le scénario figé malgré une modification ultérieure du projet, la reprise d'une tâche interrompue et l'annulation en file. Les coûts et réservations sont nuls, sans appel payant. La déclinaison YouTube prépare un projet vertical indépendant de 30 à 60 secondes à relire et valider ; elle ne prétend pas extraire automatiquement les meilleurs moments d'une vidéo.

Une véritable voix anglaise FFmpeg/flite est générée et son audibilité vérifiée. Le français ne bascule jamais silencieusement sur une voix anglaise. Windows et Piper sont vérifiés par contrats simulés ; aucune synthèse native Windows ou inférence Piper/Ollama réelle n'est revendiquée. Aucun modèle ni dépendance supplémentaire n'a été téléchargé. Les avatars et visuels de personnages récurrents ne sont pas générés par ce moteur de montage.

## Création rapide et sélection GitHub du 26 octobre

L'accueil permet d'importer une seule photo puis de lancer une vidéo locale ou un export d'image avec les réglages prêts à l'emploi. Le raccourci vidéo crée et nomme son projet automatiquement et force le moteur local, quelle que soit la préférence avancée. Les paramètres de marque proviennent des préférences enregistrées. La photo avec mannequin est un raccourci d'image éditoriale ComfyUI, disponible uniquement si un workflow compatible avec une seule photo et sans portrait obligatoire est configuré et joignable.

Le nouveau test Vitest pilote **huit groupes d'assertions** avec une vraie base SQLite et FFmpeg. Il couvre l'authentification et les origines, les entrées refusées sans effet sur les projets, les réglages locaux gratuits malgré des fournisseurs payants activés, les doubles soumissions et conflits de clé, la reprise d'une préparation persistée sans tâche, un vrai MP4 de cinq secondes en 720 × 1280 avec pixels du logo vérifiés, les workflows ou services indisponibles sans projet orphelin, et la reprise d'une tâche mannequin déjà acceptée après arrêt du service. Dépense, réservation et budget engagé restent nuls ; les préférences existantes et le rattachement des médias à leurs anciens projets sont conservés.

Le contrat ComfyUI utilise un serveur simulé : seuls les appels de statut sont autorisés pendant la mise en file. Il ne prouve aucune génération mannequin réelle. L'export de photo reprend le moteur d'image existant ; une réponse réseau perdue doit être vérifiée dans la bibliothèque avant de relancer cet export synchrone.

Dans Chromium en production, l'import suivi d'un seul clic et d'un seul POST crée un vrai MP4 H.264 de cinq secondes en 720 × 1280, lu et téléchargé depuis l'accueil sans modal de projet. Une réponse perdue après une vraie acceptation HTTP 202 a été simulée : la relance conserve la même clé et retrouve le même projet et la même tâche, sans doublon. Un vrai PNG de 1000 × 1250 rejoint la bibliothèque. Le contenu, les paramètres et le rattachement d'une source préexistante sont conservés ; les changements FR/EN, de navigation et de thème gardent la photo et le résultat. Le mannequin indisponible affiche son explication et mène aux réglages ; l'absence de workflow affiche bien le message d'installation/configuration. À 390 pixels, aucun débordement horizontal ni exception JavaScript n'a été observé. Ces essais utilisent une base et un stockage temporaires, sans appel IA ni dépense ; ils ne valident pas l'installation Windows de l'utilisateur.

La [sélection GitHub](OUTILS_GRATUITS.md) compare huit outils, puis examine les limitations de plusieurs projets Adobe et d'essayage. Les README et licences consultés sont référencés par commit. Aucune nouvelle dépendance ni poids de modèle n'a été installé pour cette recherche. Les conditions des modèles non confirmées et les ressources du PC Windows restent à vérifier avant activation.

## Démonstration guidée du 23 octobre

La [visite en français](DEMONSTRATION.md) utilise une instance séparée avec une base et un stockage temporaires. Les illustrations du sac, des vêtements et du logo ainsi que la musique sont des exemples originaux créés pour cette visite. Les projets personnels, la configuration et les données de l'installation existante n'ont pas été modifiés.

Le parcours Chromium couvre les huit écrans : vue d'ensemble, Studio produit, Bibliothèque, Fashion Studio, Lookbook, Éditeur vidéo, Pinterest SEO et Paramètres. La lecture des véritables MP4, l'aperçu d'image avec logo, les profils et variantes, le calcul d'un nouvel aperçu de montage, les contenus FR/EN, les changements de langue et de thème et les téléchargements JSON, CSV et ZIP ont été exercés sans erreur JavaScript observée.

Les fichiers fournis incluent une vidéo produit H.264 de cinq secondes en 720 × 1280, une planche PNG de 1600 × 794, un montage H.264/AAC d'environ six secondes avec texte, musique et logo, sa couverture, les textes Pinterest et une archive de projet. Ce sont des résultats des fonctions locales du studio ; aucune inférence IA réelle n'est revendiquée. Le budget est resté nul, sans demande payante.

La vidéo de visite dure **2 min 37 s**, en 1440 × 1120, avec des légendes françaises, 22 chapitres et une musique originale, sans voix off. Les captures proviennent de l'application réelle. Le pack d'exemples et l'archive de projet passent le contrôle d'intégrité ZIP et ne contiennent ni secret d'instance, ni base SQLite, ni session. Les 15 liens relatifs du guide existent. Cette livraison ajoute uniquement de la documentation et des médias de démonstration ; elle ne réexécute pas la suite de tests ni le build et ne valide pas le parcours Windows de l'utilisateur.

Le MP4 final se lit réellement dans Chromium : durée décodée de 156,684 secondes, progression initiale puis reprise après recherche à 80 et 140 secondes, sans erreur média ni JavaScript. L'état final de l'instance compte deux projets, 16 médias et six tâches réussies, sans échec ni tâche en attente ; dépense et réservation API sont nulles, les fournisseurs payants sont désactivés et aucune génération externe n'a été demandée.

## Correctif du 23 octobre — Création du compte en local

Le problème Windows a été reproduit avec la vraie classe `NextRequest` : son URL remplace les IP de boucle locale par `localhost`, alors que les en-têtes du navigateur gardent l'IP. Le garde d'origine rejetait donc à tort la création du mot de passe sur `127.0.0.1` sans configuration explicite. Les anciens tests HTTP imposaient `APP_ORIGIN`, ce qui masquait ce cas de première installation.

Avant correction, le parcours HTTP sans cette variable échouait réellement avec HTTP 403 sur l'IP locale, et cinq des nouveaux tests ciblés étaient en échec. Après correction, les **42 tests backend**, dont **29 régressions ajoutées**, réussissent. Ils couvrent les IP et noms locaux normalisés, les ports et protocoles, les hôtes malformés ou étrangers, les origines absentes, la configuration explicite stricte et le refus d'une première configuration publique même derrière une URL serveur locale.

Le parcours HTTP complet réussit ses dix contrôles avec la configuration locale par défaut, y compris création du mot de passe, session, écritures privées, export réel 3840 × 2160 et redémarrage. Les sondes d'en-têtes utilisent le transport natif `node:http` : le `fetch` de Node ignore une surcharge de Host et ne permettait pas de simuler fidèlement ces requêtes. Les hôtes étrangers et mélanges d'origine, port ou protocole restent refusés.

Dans Chromium, une vraie création de compte en français via `127.0.0.1` puis une vraie connexion en anglais via `localhost` réussissent, avec cookie HttpOnly/SameSite strict et sans erreur JavaScript. Les nouveaux messages d'adresse FR/EN ont été vérifiés avec une réponse 403 contrôlée ; le refus réel des requêtes non autorisées est vérifié séparément par les tests HTTP. Ces essais utilisent une base et un stockage temporaires, sans appel payant. Ils ne constituent pas une validation sur l'ordinateur Windows de l'utilisateur.

## Vérifications antérieures des compléments

Une copie des sources sans `.next` ni `next-env.d.ts` a aussi passé `npm run typecheck`, en réutilisant les dépendances verrouillées installées. La commande a régénéré les déclarations Next.js nécessaires. Ce contrôle ne constitue pas une publication du cloud ni une restauration dans une nouvelle tâche.

Le catalogue ajoute cinq tests ciblés, dont un sous-processus pilotant quatre groupes SQLite pour la préférence d’un fournisseur compatible. Dans Chromium, un modèle vidéo Replicate configuré avec des valeurs de test a été choisi dans le studio, sa version et sa réservation affichées, et sa préférence conservée sans activation ni augmentation du budget. Avec un plafond nul, aucune génération payante n’a été envoyée. Le passage FR/EN et le mobile sont vérifiés ; revenir au fournisseur local produit un vrai MP4. Aucune erreur du navigateur n’a été observée.

Ces preuves s’ajoutent aux vérifications détaillées ci-dessous. Elles ne valident aucune génération IA réelle ni l’accès réseau à une boutique distante.

## Environnement

| Outil                   | Version vérifiée                                        |
| ----------------------- | ------------------------------------------------------- |
| Node.js                 | 24.19.0                                                 |
| npm                     | 11.9.0                                                  |
| FFmpeg / FFprobe        | 7.1.5                                                   |
| Prisma                  | 6.19.0, moteur JavaScript et adaptateur SQLite officiel |
| better-sqlite3 / SQLite | 12.11.1 / 3.53.2                                        |

## Compléments — Aperçus et sauvegarde des ateliers

Les 24 tests ciblés passent : 12 pour le montage, 10 pour l’export d’image et 2 pour la sauvegarde des réglages produit. Ils contrôlent les vrais pixels et le son des aperçus, leurs dimensions, la conservation des réglages finaux, l’authentification, l’absence d’écriture pour l’aperçu d’image et la conservation des paramètres récents des autres ateliers lors d’un enregistrement produit.

Le build de production et `npm run typecheck` avec génération des types Next.js réussissent. Le parcours `npm run test:smoke:editor` passe désormais quatre groupes, dont un aperçu composé 360p produit avant toute tâche d’export final.

Dans Chromium, la vidéo d’aperçu se lit réellement avant un export définitif, en conservant les réglages finaux 1080p/H.265/CRF18. L’aperçu d’image montre les vrais pixels rouges du logo, ne crée pas de média enregistré et disparaît lorsque son opacité est modifiée. Aucune erreur du navigateur n’a été observée dans ces parcours.

## Compléments — Styles réutilisables

Les 31 tests ciblés StylePreset, Fashion et ComfyUI passent. Le nouveau test pilote cinq groupes avec une vraie SQLite : accès privé et origine, entrées strictes, combinaison des styles, indépendance du profil et du hijab, conservation des valeurs des looks et tâches après modification ou suppression d’un style. Les anciens looks restent compatibles et un enregistrement sans changement conserve leur résultat.

Le build et TypeScript passent. Dans Chromium, un style avec coupe ample, longueur, couleurs, superposition et décor a été créé puis appliqué et enregistré dans un look. Le rendu réel de planche, les variantes, le passage FR/EN, la conservation du résultat après sauvegarde et l’affichage mobile ont aussi été vérifiés sans erreur du navigateur.

## Compléments — Import autorisé

Les 49 tests d’import passent : protocole Shopify et JSON, adresses privées et métadonnées cloud, DNS public épinglé, validation TLS, refus des redirections et en-têtes sensibles, limites, décodage de vrais pixels, SQLite, idempotence, références et nettoyage transactionnel. Le transport distant est simulé. Le build et TypeScript passent.

Dans Chromium, le formulaire bloque la soumission sans confirmation des droits, affiche le refus réel d’une adresse privée sans créer de média, conserve le brouillon au passage FR/EN et reste utilisable à 390 pixels. Un ancien brouillon produit a aussi été enregistré après modification récente du montage et du SEO : ces données sont conservées. Aucun import depuis une boutique réelle n’a été validé, la résolution DNS externe directe ayant échoué sur cette machine.

## Phase 5 — Fournisseurs et finitions

| Contrôle                                   | Résultat                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suite complète                             | 154 tests réussis dans 10 fichiers après intégration des phases 1 à 5                                                                                                                      |
| Installation figée après ajout de Saxes    | `npm ci` réussi avec génération automatique du client Prisma                                                                                                                               |
| Migrations SQLite                          | Quatre migrations appliquées ; `db:deploy` répété deux fois sans migration restante                                                                                                        |
| Vérification TypeScript                    | `npm run typecheck` réussi après intégration                                                                                                                                               |
| Build final de production                  | `npm run build` réussi après les réglages de compression et les corrections finales                                                                                                       |
| Audit des dépendances de production        | `npm audit --omit=dev` : aucune vulnérabilité signalée                                                                                                                                     |
| Export d’image                             | 7 tests réussis avec Sharp et SQLite : vrai PNG 3840 × 2160, transparence et opacité du logo, JPEG sur fond blanc, orientation EXIF, références ZIP/duplication et nettoyage après échec   |
| Identités de marque                        | 1 test pilotant 5 groupes SQLite : identités persistantes, validation, références de logo, préférences appliquées et conservation des projets                                              |
| SVG et import                              | 43 tests backend + SVG réussis (13 backend et 30 SVG) ; formes réellement rasterisées en PNG, limites de complexité et contenus interdits vérifiés                                         |
| Logo vidéo au début/à la fin               | 10 tests montage + 16 Runway réussis ; contrôles de pixels réels dans les deux moteurs, fondu et fenêtre ajustée à la durée réelle du média                                                |
| Compression vidéo réelle                   | Test FFmpeg sur une source détaillée : CRF 28 produit un fichier au moins 15 % plus petit que CRF 18 dans le studio produit et le montage ; validation et persistance du réglage vérifiées |
| Sélection des fournisseurs supplémentaires | 21 tests réussis avec `tests/additional-providers.test.ts`                                                                                                                                 |
| Registre et Ollama                         | Métadonnées sans secret et absence d'appel lors de la simple lecture ; contrat JSON, modèle installé et limites réseau vérifiés avec réponses simulées                                     |
| Persistance et budget Replicate            | Sous-processus Node.js avec vraie base SQLite, pilotant 13 groupes de scénarios financiers et de reprise                                                                                   |
| Import de médias                           | Vrais PNG et MP4 validés ; fichiers vides, corrompus et vidéo de plus de 30 minutes refusés ; téléchargement réseau simulé                                                                 |
| Navigateur fournisseurs                    | Cinq fournisseurs affichés, budget nul et génération Replicate bloquée ; aucun POST payant observé                                                                                         |
| Navigateur identités et images             | Identité créée, appliquée et conservée ; SVG converti en PNG puis vrai export 3840 × 2400 avec pixels rouges du logo vérifiés                                                              |
| Préférences et langues                     | Résultat conservé au changement FR/EN ; réglages de logo début/fin enregistrés ; nouveau profil reprenant hijab et styles indépendants                                                     |
| Affichage mobile                           | Paramètres et bibliothèque à 390 pixels sans débordement ni erreur du navigateur observée                                                                                                  |
| Régression HTTP produit et Fashion         | 9 contrôles produit et 3 groupes Fashion réussis après intégration des fonctionnalités de phase 5                                                                                          |
| Régression HTTP montage et Pinterest       | 3 groupes réussis après les nouveaux réglages : vrai MP4 H.264/AAC, musique audible, logo, couverture et exports SEO                                                                          |
| Navigateur compression                     | Choix CRF 18/21/28, tâche produit CRF 28 produisant un vrai MP4 de cinq secondes, réglage de montage CRF 18 persistant ; prix Replicate non configuré affiché sans montant inventé               |
| Génération Replicate réelle                | Non exécutée ; aucun appel payant                                                                                                                                                          |
| Inférences Ollama et ComfyUI réelles       | Non exécutées ; services et poids non installés                                                                                                                                            |

Les scénarios financiers vérifient le budget nul, l'activation, la confirmation du montant et de la version immuable du modèle, le refus d’un modèle changé au même prix, le registre partagé avec Runway, l'idempotence et l'annulation avant envoi, la nouvelle vérification du budget par le worker, la conservation d'un envoi ambigu sans second POST, l'annulation après soumission avec réservation conservée, le refus d'inventer un coût à partir du temps de calcul, le refus d'une configuration changée, l'isolement des autres familles de tâches et l'enregistrement d'un vrai résultat sans supprimer sa réservation. Les treize groupes sont contenus dans un test Vitest et ne s'ajoutent pas au total de 21.

```bash
npx vitest run tests/additional-providers.test.ts
```

Les totaux ciblés se recouvrent avec la suite complète et ne doivent pas être additionnés. Les groupes SQLite pilotés au sein d’un test ne sont pas comptés comme des tests Vitest supplémentaires. Ces résultats ne valident ni la facturation réelle du compte, ni les modèles auxquels il a accès, ni une inférence distante ou locale réelle.

## Phase 4 — Montage et Pinterest

Contrôles exécutés le 20 octobre 2026 :

| Contrôle                    | Résultat                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests ciblés montage et SEO | 32 tests réussis : 6 montage et 26 SEO                                                                                                       |
| Vérification TypeScript     | `npm run typecheck` réussi après intégration                                                                                                 |
| Build de production         | `npm run build` réussi après intégration                                                                                                     |
| Parcours HTTP en production | 3 groupes réussis avec `npm run test:smoke:editor` et une base et un stockage temporaires                                                    |
| Navigateur montage          | Import MP4 et WAV, blocage sans confirmation musicale, coupe, texte, sauvegarde, changement FR/EN sans perte du brouillon et export vérifiés |
| Lecture et téléchargement   | Lecture de la vraie vidéo avec progression du temps et téléchargement de la couverture vérifiés                                              |
| Navigateur Pinterest        | Rédaction locale FR/EN, titre modifié et conservé, exports CSV/JSON vérifiés                                                                 |
| Affichage mobile et console | À 390 pixels, aucun débordement horizontal dans les deux ateliers et aucune erreur du navigateur observée                                    |
| Inférence Ollama réelle     | Non exécutée ; tests du contrat avec réponses simulées                                                                                       |

Les trois groupes HTTP vérifient l'accès privé aux API, l'import d'une vraie piste WAV et le refus d'un faux fichier, la sauvegarde de coupes ordonnées, la protection des médias référencés, la confirmation des droits musicaux et l'idempotence ; la préparation SEO FR/EN avec mention d'affiliation, les modifications humaines, les exports CSV/JSON et la conservation des paramètres du montage ; le traitement persistant par le worker d'un vrai MP4 H.264/AAC avec fondu, musique audible, logo, couverture JPEG et archive ZIP, sans aucune génération payante.

La vérification du rendu porte sur la durée et les codecs via FFprobe, les couleurs des clips ordonnés, le mélange des couleurs pendant le fondu, les pixels du logo et le niveau sonore décodé. Les tests ciblés vérifient aussi les textes UTF-8, le nettoyage des fichiers temporaires et la séquence figée lors de la mise en file. Les tests SEO contrôlent notamment les variantes distinctes, les limites de longueur, les liens de destination, les mentions conservées et la protection contre les formules de tableur.

Commande de la sélection ciblée :

```bash
npx vitest run tests/editor.test.ts tests/seo.test.ts
```

## Phase 3 — Contrôles actuels

| Contrôle                            | Résultat                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sélection de tests des phases 1 à 3 | 58 tests réussis : 12 backend, 16 Runway, 1 test Fashion pilotant 9 groupes de vérifications, 29 ComfyUI                           |
| Contrat ComfyUI                     | Tests de transport et de sécurité réussis, avec HTTP simulé ; une vraie base SQLite et un vrai PNG décodé vérifient la persistance |
| Build de production intégré         | Dernier `npm run build` réussi après les corrections de phase 3                                                                    |
| Parcours HTTP Fashion en production | 3 groupes réussis avec `npm run test:smoke:fashion`, puis vérifiés à nouveau après les corrections                                 |
| Navigateur Fashion et Lookbook      | Profil réutilisable et hijab indépendant, deux vêtements importés, look, planche réelle, variante et onglet de collection vérifiés |
| Langues et conservation du résultat | Changement FR/EN sans perte des données ; enregistrement sans changement conservant le résultat                                    |
| Affichage mobile et console         | À 390 pixels, aucun débordement horizontal ; aucune erreur du navigateur observée                                                  |
| Cache des polices Sharp             | Cache local accessible en écriture configuré automatiquement ; absence d'erreur Fontconfig vérifiée                                |
| Inférence ComfyUI réelle            | Non exécutée ; aucun service, GPU, checkpoint ou poids de modèle installé                                                          |

Les trois groupes HTTP de phase 3 vérifient l'accès privé, les profils, les références et la réutilisation des vêtements ; la file persistante et la création d'un vrai PNG de planche avec coût d'API nul, source non IA et absence de doublon ; les variantes, la copie indépendante des médias et des looks lors d'une duplication de projet, l'archive ZIP et le refus explicite d'une demande IA sans ComfyUI configuré.

Le test Fashion utilise un processus Node.js et une vraie base SQLite. Ses neuf groupes vérifient les styles et le hijab indépendants, la validation des entrées, les looks et profils persistants, les variantes, la conservation des couleurs originales dans le collage, le worker et l'idempotence, la conservation du résultat après un enregistrement sans changement et son invalidation après modification du profil, la protection d'un look en cours de rendu, puis les suppressions et chemins privés. Ce sont neuf groupes d'assertions au sein d'un test Vitest ; ils ne sont pas additionnés au total de 58.

La sélection reproduisant les 58 tests est :

```bash
npx vitest run tests/backend.test.ts tests/runway.test.ts tests/fashion.test.ts tests/comfyui.test.ts
```

Les contrôles des phases 4 et 5 sont documentés séparément après exécution. Les résultats ci-dessus couvrent les phases 1 à 3 et ne revendiquent aucune génération Fashion IA réelle.

## Phases 1 et 2 — Historique des contrôles

| Contrôle                                 | Résultat                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Installation figée `npm ci`              | Réussie, y compris la génération du client Prisma par `postinstall`                                 |
| Migrations                               | `prisma migrate deploy` exécuté deux fois ; aucune migration en attente au second passage           |
| Vérification TypeScript                  | `npm run typecheck` réussi                                                                          |
| Tests unitaires du backend               | 12 tests réussis                                                                                    |
| Tests adaptateur Runway et budget        | 16 tests réussis ; les appels au fournisseur sont simulés                                           |
| Suite des phases 1 et 2                  | 28 tests réussis avec `better-sqlite3` 12.11.1, repris dans la sélection de phase 3                 |
| Parcours HTTP réel en mode développement | 9 contrôles réussis avec `SMOKE_DEV=1 npm run test:smoke`                                           |
| Build de production                      | `npm run build` réussi                                                                              |
| Parcours HTTP réel en mode production    | 9 contrôles réussis avec le pilote 12.11.1                                                          |
| Démarrage standard de développement      | `npm run dev` avec Turbopack ; page HTTP 200 et état initial de configuration correct               |
| Audit des dépendances                    | Aucune vulnérabilité signalée par `npm audit` avec le verrouillage final                            |
| Parcours dans un navigateur              | Authentification initiale, projets, langues, import, vidéo, paramètres et affichage mobile vérifiés |

Le parcours HTTP utilise une base et un stockage temporaires. Il vérifie les migrations répétables, la création du mot de passe, les sessions privées et le refus d'une origine étrangère ; l'import réel d'images et de plusieurs logos ainsi que le refus d'une fausse image et d'un SVG ; la duplication et l'archive ZIP ; le blocage d'une génération payante avec les valeurs par défaut ; la production par le worker d'un vrai MP4 H.264 de cinq secondes, le téléchargement partiel HTTP 206 et l'absence de doublon avec une même clé d'idempotence ; un export réel **3840 × 2160** ; la persistance des projets, des préférences, des médias et de l'authentification après redémarrage ; la déconnexion puis la reconnexion.

Le contrôle du filigrane ne se limite pas à l'existence du fichier : une image est extraite de la vidéo encodée et un pixel situé dans le logo attendu est contrôlé. FFprobe vérifie le codec, la durée et les dimensions. Ces vidéos proviennent de l'animation locale d'une image fixe ; ce ne sont pas des générations IA.

Un contrôle d'export complémentaire a produit une vidéo H.265 en 720p à partir d'une source de test d'une seconde, avec conservation d'une piste AAC et fondu du logo. FFprobe a vérifié la sortie ; des pixels blancs au début puis rouges au milieu confirment l'apparition du logo. Les encodeurs `libx264` et `libx265` sont disponibles dans cette installation de FFmpeg.

## Parcours dans le navigateur — Phases 1 et 2

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
npm run test:smoke:fashion
npm run test:smoke:editor
```

Le test `test:smoke` utilise le serveur compilé par défaut : exécutez d'abord le build. Il démarre sa propre instance, sans toucher aux projets de votre instance. Il nécessite FFmpeg/FFprobe et un port libre (`SMOKE_PORT` permet de modifier le port utilisé). Pour le contrôle avec le serveur de développement exécuté ci-dessus :

```bash
SMOKE_DEV=1 npm run test:smoke
```

Équivalent PowerShell : `$env:SMOKE_DEV="1"; npm.cmd run test:smoke`. Retirez ensuite cette variable avec `Remove-Item Env:SMOKE_DEV` pour revenir au mode compilé.

Une génération Runway réelle reste un contrôle séparé, payant, qui nécessite une clé valide, un fournisseur activé, un budget suffisant et une confirmation explicite. Les réponses Runway simulées ne valident ni les tarifs du compte, ni l'accès au modèle, ni le téléchargement depuis son CDN en conditions réelles. Aucun résultat de génération IA réelle n'est revendiqué.
