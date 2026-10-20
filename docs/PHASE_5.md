# Phase 5 — Fournisseurs et finitions du studio

Les adaptateurs Replicate et Ollama complètent Runway et ComfyUI. Ils sont facultatifs : le studio conserve ses parcours locaux sans clé, sans GPU et sans appel payant. Les modèles, licences et capacités disponibles dépendent de votre installation ou de votre compte fournisseur.

## Exporter une image avec ou sans logo

Dans la bibliothèque, l’atelier **Export d’image** accepte les images raster du studio et crée un fichier PNG, JPEG ou WebP. Choisissez les proportions originales ou un cadrage 9:16, 4:5, 1:1 ou 16:9. Le cadrage remplit le format et peut recouper les bords.

Le mode **Dimensions natives** conserve la densité de la source et recadre sans agrandir. Le mode **4K** fixe le **côté long à 3840 pixels** : 3840 × 2160 en 16:9, 2160 × 3840 en 9:16, 3072 × 3840 en 4:5 et 3840 × 3840 en carré. Cette convention d’image diffère du sélecteur vidéo, qui désigne le petit côté par 720/1080/1440/2160.

Les dimensions natives et prévues sont affichées. L’export peut agrandir ou réduire une source ; un agrandissement est une interpolation Sharp classique, sans upscaling IA et sans promesse de génération native 4K. La qualité JPEG/WebP est réglable ; PNG conserve une compression sans perte. PNG et WebP conservent la transparence, tandis que JPEG utilise un fond blanc.

Vous pouvez choisir un logo de la bibliothèque, sa position, sa taille et son opacité, ou exporter sans logo. L’opacité choisie se combine à la transparence d’origine du logo. Le traitement est local et son coût d’API est nul. Il accepte une source raster de 20 Mio et 40 mégapixels maximum, un logo raster de 5 Mio et un résultat de 50 Mio maximum ; l’import ordinaire d’images dans la bibliothèque reste limité à 5 Mo.

L’image exportée est enregistrée dans la médiathèque privée. Si elle est associée à un projet, celui-ci conserve les références à la source, au résultat, au logo et aux paramètres ; ils sont inclus dans son archive et remappés lors d’une duplication. Ce parcours ne modifie pas les originaux et ne publie aucun média.

## Réutiliser une identité de marque

Dans **Paramètres → Identités de marque**, créez plusieurs identités nommées avec un logo facultatif, sa taille, son opacité, sa position et le fondu vidéo. Vous pouvez modifier, supprimer et appliquer une identité aux préférences des prochains projets. Un réglage sans logo permet également une sortie sans marque personnelle.

Enregistrez les modifications d’une identité avant de l’appliquer. Le studio vidéo utilise ces préférences pour ses nouveaux réglages. Les projets existants et les ateliers de montage ou d’image conservent leurs choix propres. La suppression d’une identité conserve son fichier logo ; un logo encore référencé est protégé contre la suppression. Le catalogue est conservé dans SQLite et la copie complète de l’instance ; l’archive individuelle d’un projet ne remplace pas la sauvegarde du catalogue global.

Ces identités sont des modèles de filigrane. Elles ne définissent pas de palette, de typographies ou de mise en page complète. Jusqu’à 100 identités peuvent être enregistrées.

## Importer un logo SVG simple

Un SVG peut être importé **comme logo uniquement**, jusqu’à 512 Kio. Le serveur accepte un sous-ensemble strict de formes et chemins, reconstruit le XML autorisé puis le convertit en PNG. Le XML original n’est pas stocké ni servi au navigateur.

Les styles CSS, polices, références, images intégrées, dégradés, filtres, scripts et entités ne sont pas pris en charge. Pour un logo utilisant ces fonctions, exportez vous-même un PNG transparent. La rasterisation est limitée à 4096 pixels par côté et 16 mégapixels, avec un délai de cinq secondes et un PNG final de 5 Mio maximum. Un fichier refusé n’est pas importé silencieusement avec des éléments retirés.

## Régler la compression vidéo

Le studio produit et le montage proposent **Qualité élevée**, **Équilibré** et **Fichier léger**. Ces choix passent réellement les niveaux CRF 18, 21 et 28 à FFmpeg. Le studio produit démarre sur qualité élevée (18), le montage sur équilibré (21) ; l’API utilise 21 si le réglage est omis. Ils sont conservés dans les paramètres et figés dans chaque tâche à l’envoi. La compression change le compromis entre poids et qualité ; elle ne remplace pas la résolution et ne crée pas de détails supplémentaires. La taille obtenue dépend du contenu, de la durée et du codec.

Le curseur de qualité JPEG/WebP de l’export d’image reste un réglage distinct. Il n’affecte pas la compression vidéo.

## Afficher le logo au début ou à la fin

Dans le studio vidéo et le montage, choisissez toute la vidéo, le début ou la fin. Les modes début et fin affichent le logo en superposition pendant au plus deux secondes ; sur une vidéo plus courte, cette fenêtre couvre sa durée entière. Le fondu facultatif s’adapte à cette fenêtre. Ces réglages ne créent pas de plan supplémentaire ni de carton séparé avant ou après la vidéo.

## Replicate : préparer un modèle compatible

L'adaptateur utilise une **version immuable**, identifiée par 64 caractères hexadécimaux minuscules. Il envoie uniquement un objet d'entrée contenant `prompt` et, si une image est sélectionnée, `image` sous forme de données PNG/JPEG/WebP. Choisissez un modèle dont le schéma accepte exactement ces champs, avec ses autres paramètres facultatifs. Un modèle exigeant d'autres champs nécessite un adaptateur supplémentaire.

La sortie attendue est une URL de média ou une liste d'URL. Les objets JSON de sortie arbitraires ne sont pas interprétés. Le type choisi doit correspondre au résultat du modèle : image PNG/JPEG/WebP ou vidéo MP4. Une seule version de modèle Replicate est configurée à la fois.

Renseignez les variables côté serveur, dans l'environnement ou le fichier `.env` ignoré par Git :

| Variable                   | Valeur attendue                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `REPLICATE_API_TOKEN`      | Clé privée de votre compte Replicate ; ne jamais l'envoyer dans le chat ni la committer |
| `REPLICATE_MODEL_VERSION`  | Identifiant immuable de version, sur 64 caractères hexadécimaux minuscules              |
| `REPLICATE_OUTPUT_KIND`    | `image` ou `video`                                                                      |
| `REPLICATE_ESTIMATE_CENTS` | Réservation manuelle en centimes d'euro par prédiction ; entier strictement positif     |

Redémarrez le serveur et le worker après une modification. L'API utilise `api.replicate.com` en HTTPS ; les médias sont téléchargés depuis `replicate.delivery` ou ses sous-domaines. En cas de réseau restreint, autorisez les destinations nécessaires. Les clés restent côté serveur et ne sont pas jointes au téléchargement des résultats.

Le contrôle de connexion consulte le compte ; il ne crée pas de prédiction. Une connexion réussie ne prouve ni l'accès au modèle choisi, ni la validité de son schéma, ni une génération réussie. Vérifiez le prix et les conditions du modèle directement chez Replicate avant d'autoriser une dépense.

## Réservation, budget et reprise

Replicate est désactivé par défaut et le budget mensuel partagé vaut **0 €**. Chaque soumission exige l'activation du fournisseur, un budget disponible, une confirmation explicite de la version immuable du modèle et du montant de réservation affichés. Si le modèle a changé depuis cette confirmation, même au même prix, la demande est refusée avant une nouvelle réservation. Le worker vérifie à nouveau l'activation, la configuration et le budget avant l'envoi.

`REPLICATE_ESTIMATE_CENTS` est une hypothèse saisie par l'administrateur. Ce montant **n'est ni un devis Replicate ni un plafond garanti de facturation**. Le plafond du studio limite ses réservations ; il ne limite pas les frais décidés par le fournisseur. Les réservations Replicate et Runway utilisent le même registre mensuel, calculé en UTC.

Le temps de calcul d'une prédiction ne sert pas à inventer un prix réel. En l'absence de montant de facturation vérifié, le coût réel reste inconnu et la réservation est conservée, y compris après réussite, échec ou annulation d'une tâche déjà soumise. Il n'existe pas encore de rapprochement automatique des factures Replicate. Comparez le registre avec la facturation du compte avant toute régularisation administrative.

La clé d'idempotence permet de retrouver une soumission déjà enregistrée. Avant le premier POST payant, le worker persiste une marque d'envoi. Si la réponse est ambiguë ou qu'un arrêt empêche de connaître l'identifiant distant, la tâche passe à `UNKNOWN` et n'est jamais soumise automatiquement une seconde fois. Consultez le compte fournisseur avant de créer volontairement une nouvelle tâche.

Une annulation avant envoi libère la réservation. Après envoi, elle demande l'annulation au fournisseur et conserve la réservation : elle ne garantit pas l'absence de frais. Une tâche dont l'envoi est en cours ne peut pas être annulée comme si elle n'avait jamais été envoyée.

## Import des résultats

Quand le modèle renvoie plusieurs médias, le studio importe **le premier seulement** et conserve le nombre de sorties dans les paramètres de la tâche. Les téléchargements sont limités en taille, les redirections refusées et les fichiers contrôlés : décodage réel des images, inspection FFprobe des MP4 et décodage d’une image vidéo par FFmpeg. Les MP4 doivent avoir une durée finie supérieure à zéro et d’au plus 30 minutes. Une simple extension ou un en-tête ressemblant à une image ne suffisent pas.

Les dimensions enregistrées sont celles du fichier reçu. Cet adaptateur n'effectue ni agrandissement ni upscaling IA et ne promet aucune génération native 4K. Un export ultérieur à une résolution supérieure constitue un redimensionnement distinct.

## Ollama : rédaction avec un modèle local installé

Ollama fournit une option de rédaction pour Pinterest SEO. Installez vous-même Ollama et un modèle adapté, puis configurez :

| Variable       | Valeur attendue                                                  |
| -------------- | ---------------------------------------------------------------- |
| `OLLAMA_URL`   | Origine locale, par défaut `http://127.0.0.1:11434`              |
| `OLLAMA_MODEL` | Nom et étiquette exacts d'un modèle déjà installé sur ce serveur |

Seules les adresses de boucle locale `127.0.0.1`, `localhost` et `::1` sont acceptées, sans chemin ni identifiants. Le serveur Ollama doit donc être accessible depuis la même machine que l'application. Le studio ne télécharge et n'installe aucun modèle. Il vérifie sa présence via `/api/tags`, puis demande du JSON non diffusé en continu via `/api/generate`.

Le contenu du modèle passe par les mêmes contrôles structurels que la rédaction locale : langues demandées, nombres de variantes, longueurs et mentions publicitaires. Une sortie invalide provoque une erreur explicite, sans être remplacée silencieusement par un faux résultat IA. Relisez les faits et adaptez le texte alternatif au visuel final. Les caractéristiques saisies ne constituent pas une analyse d'image ou de site.

Sans Ollama, le mode de rédaction locale reste disponible : il assemble des modèles de texte et n'est pas présenté comme une inférence IA. Voir le [guide montage et Pinterest](PHASE_4.md).

## État des fournisseurs et limites de validation

L'API privée `GET /api/providers/status` expose les capacités et la configuration sans secret. Avec `?check=1`, elle effectue des contrôles de connexion en lecture seule, sans génération ni téléchargement de modèle. Les états « configuré », « connecté » et « génération réussie » désignent des vérifications différentes.

`GET /api/providers/models` fournit aussi le catalogue des contrats de modèles et workflows supportés, avec paramètres et estimations, sans requête réseau. Le studio vidéo permet de sélectionner un modèle Replicate vidéo configuré ; une préférence compatible ne vaut ni activation du fournisseur ni autorisation d’une dépense. Voir [les compléments](COMPLEMENTS.md).

Les tests d'adaptateurs utilisent des réponses réseau simulées et des fichiers média réellement décodés. Aucune génération Replicate payante, aucune inférence Ollama réelle et aucune installation de poids de modèle ne sont revendiquées par ce guide. Les commandes effectivement exécutées et leurs résultats figurent dans [VALIDATION.md](VALIDATION.md).

Kling, les modèles nécessitant un autre schéma d'entrée Replicate et l'optimisation de modèles GPU ne disposent pas d'un adaptateur dédié dans cette livraison. Les parcours Fashion IA restent soumis à la configuration séparée décrite dans [PHASE_3.md](PHASE_3.md).
