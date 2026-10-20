# Périmètre des phases 1 à 5

Ce document distingue le fonctionnement local livré, les intégrations qui exigent une configuration et les parties du cahier des charges prévues plus tard. Une option enregistrable n'implique pas qu'un moteur IA correspondant soit déjà disponible.

| Fonction                                  | État et limite                                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initialisation, architecture, base SQLite | Implémentées ; migrations Prisma et stockage local                                                                                                                                            |
| Tableau de bord                           | Projets, médias, tâches et budget du studio personnel                                                                                                                                         |
| Projets                                   | Création, modification, duplication avec copie physique des médias, suppression protégée et archive ZIP individuelle                                                                          |
| Bibliothèque de médias                    | Images PNG/JPEG/WebP jusqu'à 5 Mo, vidéos MP4 jusqu'à 100 Mo et pistes MP3/WAV/M4A jusqu'à 50 Mo ; accès privé aux fichiers ; SVG simple accepté uniquement comme logo, puis rasterisé en PNG |
| Paramètres persistants                    | Langue d'interface, langue de contenu, thème, styles, hijab, logo, format, résolution, fournisseur et budget                                                                                  |
| Interface FR / EN                         | Dictionnaires next-intl et préférence enregistrée ; les contenus saisis par l'utilisateur ne sont pas traduits automatiquement                                                                |
| Product Video Studio local                | Photo vers MP4 de 5, 10 ou 15 secondes par zoom FFmpeg fixe ; animation non IA ; les presets, décors et prompts concernent Runway                                                             |
| Runway                                    | Adaptateur serveur, clips de 5 ou 10 secondes et tâches asynchrones implémentés ; génération réelle non validée sans clé et autorisation de dépense                                           |
| Estimation des coûts                      | Hypothèse tarifaire affichée, conversion USD/EUR manuelle, réservation et budget nul par défaut                                                                                               |
| Exports MP4                               | Formats 9:16, 4:5, 1:1, 16:9 ; 720 à 2160 pour le petit côté ; H.264 et H.265 selon les encodeurs disponibles                                                                                 |
| Filigrane vidéo                           | Logo raster facultatif, position, taille, opacité et fondu d'apparition/disparition ; export sans logo possible                                                                               |
| Sauvegarde                                | ZIP individuel avec description JSON et médias ; copie hors ligne de l'instance ; pas de planification ni de restauration automatisée                                                         |
| Profils de mannequins                     | Création, modification et réutilisation ; carnation, morphologie, taille, coiffure, pose, hijab indépendant et photo de référence facultative ; aucun portrait généré automatiquement         |
| Looks et collections                      | Composition avec 1 à 8 vêtements, styles combinables, paramètres enregistrés, variantes et réutilisation des pièces                                                                           |
| Planche de collection                     | Vrai PNG de 1600 pixels de large assemblant les photos ; sans IA ni essayage ; hauteur adaptée au nombre de photos                                                                            |
| Fashion IA et virtual try-on              | Deux modes et workflows ComfyUI distincts ; contrôles de configuration et tâches persistantes ; inférence réelle non validée sans service, modèles et workflows installés                     |
| Comparaison et animation                  | Originaux et résultat consultables côte à côte ; image téléchargeable et passage au studio vidéo sans génération automatique                                                                  |
| Archive de collection                     | ZIP comprenant looks, profils utilisés et médias référencés ; modèles et installation ComfyUI exclus                                                                                          |
| Montage vidéo local                       | Jusqu'à 12 clips et 120 secondes de sources ; coupes, ordre, fondus de 0,35 seconde et séquence persistante                                                                                   |
| Textes et son                             | Textes horaires, conservation du son des clips, musique ajoutée avec volume et confirmation des droits                                                                                        |
| Export de montage                         | MP4 H.264/H.265 selon FFmpeg, formats 9:16/4:5/1:1/16:9, petit côté 720 à 2160 et couverture JPEG extraite                                                                                    |
| Pinterest SEO local                       | Modèles éditoriaux sans IA : trois titres et deux descriptions par langue, mots-clés, appel à l'action, texte alternatif et tableau ; aucun site analysé                                      |
| Contenus et exports Pinterest             | FR/EN indépendant de l'interface, textes modifiables, mentions d'affiliation conservées, JSON/CSV et sauvegarde dans le ZIP ; aucun envoi automatique à Pinterest                             |
| Rédaction Ollama                          | Adaptateur local facultatif avec réponse JSON validée ; modèle à installer séparément et inférence réelle non validée                                                                         |
| Replicate                                 | Adaptateur serveur pour une version immuable compatible avec `prompt` et une image facultative ; résultats PNG/JPEG/WebP ou MP4 ; génération réelle non validée                               |
| Registre des fournisseurs                 | Configuration et contrôles de connexion privés, sans génération lors du contrôle ; configuration, connexion et inférence réussie restent des états distincts                                  |
| Budget partagé                            | Runway et Replicate réservent dans le même registre ; désactivés et budget nul par défaut ; estimation Replicate manuelle, coût réel inconnu conservé sans facture vérifiée                   |
| Export d’image                            | PNG/JPEG/WebP aux dimensions natives ou côté long de 3840 pixels ; cadrage, qualité JPEG/WebP, transparence et filigrane facultatif ; interpolation locale sans upscaling IA                  |
| Identités de marque                       | Modèles nommés réutilisables : logo facultatif, taille, opacité, position et fondu ; application aux préférences des prochains projets                                                        |
| SVG de logo                               | Sous-ensemble strict de formes et chemins, import logo uniquement, conversion en PNG ; CSS, polices, références et contenus actifs refusés                                                    |
| Compression vidéo                         | Réglages qualité élevée/équilibré/fichier léger transmis à FFmpeg (CRF 18/21/28), enregistrés et figés dans les tâches ; poids final dépendant du contenu et du codec                         |
| Moment du logo vidéo                      | Superposition sur toute la vidéo, les deux premières ou les deux dernières secondes au maximum, avec fondu facultatif ; aucun carton séparé ajouté                                            |

## Exigences V1.1 partiellement couvertes

Les styles peuvent être combinés et enregistrés avec leurs propres paramètres : coupe, longueur, couleurs, accessoires, superpositions, couverture, ambiance, décor, pose et caractéristiques souhaitées. Leur application dans un look est explicite et ne modifie ni le profil ni le hijab. Les valeurs sont copiées dans les looks et les tâches ; modifier un style ne change pas les résultats existants. Ces descriptions sont transmises aux workflows ComfyUI configurés ; leur respect dépend du moteur et des modèles. Leur enregistrement ou une planche locale ne réalisent pas un essayage virtuel.

La suppression d'un projet est bloquée s'il possède des tâches en cours, des engagements financiers ou des tâches payantes déjà envoyées au fournisseur : l'historique financier doit rester disponible. Les médias restent dans la bibliothèque après suppression du projet. Les images sont décodées et normalisées, avec une limite de 40 mégapixels. Les montants et tailles sont limités côté serveur, pas seulement dans les champs de l'interface.

Le Brand Kit conserve plusieurs logos réutilisables, un logo actif et des identités nommées de filigrane. Les SVG simples sont contrôlés puis convertis en PNG lors d’un import de logo. Les identités ne définissent pas encore de palette, de typographies ou de mise en page complète. Le logo vidéo peut être limité au début ou à la fin par superposition ; aucun carton distinct n’est ajouté.

La duplication d'un projet copie les fichiers et remappe les références des paramètres et des looks, y compris les médias de la bibliothèque utilisés par le projet. Elle ne copie pas le registre financier des générations. Une variante de look réutilise ses vêtements et son profil sans lancer de rendu. L'archive ZIP conserve l'historique du projet original, ses looks, les profils associés et les médias référencés.

Les exports vidéo permettent le redimensionnement jusqu’à 2160 pour le petit côté. L’export d’image propose les dimensions natives ou un côté long de 3840 pixels ; les deux conventions sont indiquées dans leurs ateliers. L’agrandissement est signalé : ni la génération native 4K chez un fournisseur, ni l’upscaling IA ne sont promis. Le résultat dépend de la qualité de la source et des ressources de la machine.

Les parcours locaux fonctionnent sans fournisseur externe. La génération Runway demande un essai réel autorisé avec votre compte. Les images éditoriales et l'essayage demandent ComfyUI, les modèles et les workflows correspondants. Les tests de protocole simulés ne sont pas présentés comme des générations IA produites. Consultez le [guide Fashion et ComfyUI](PHASE_3.md) pour les contrats et limitations.

## Éléments non intégrés

Kling, les modèles Replicate demandant un autre schéma d'entrée et l'optimisation de modèles GPU n'ont pas d'adaptateur ou de parcours dédié. Les services locaux et leurs poids restent à installer séparément ; les tests simulés ne prouvent aucune inférence réelle.

L'import depuis une URL produit, le scraping, les publications sur les réseaux sociaux et Pippit ne sont pas intégrés. Aucun bouton ne doit être interprété comme une activation de ces services.

Le montage propose un aperçu complet à 360p avant l’export définitif. L’export d’image calcule aussi un aperçu réel du cadrage et du logo sans enregistrer de média. Le [guide des compléments](COMPLEMENTS.md) précise ce fonctionnement. Le texte alternatif Pinterest reste à adapter au visuel final. Un CSV préparé exige une URL publique de média et une vérification manuelle avant import.
