# Périmètre des phases 1 à 3

Ce document distingue le fonctionnement local livré, les intégrations qui exigent une configuration et les parties du cahier des charges prévues plus tard. Une option enregistrable n'implique pas qu'un moteur IA correspondant soit déjà disponible.

| Fonction | État et limite |
| --- | --- |
| Initialisation, architecture, base SQLite | Implémentées ; migrations Prisma et stockage local |
| Tableau de bord | Projets, médias, tâches et budget du studio personnel |
| Projets | Création, modification, duplication avec copie physique des médias, suppression protégée et archive ZIP individuelle |
| Bibliothèque de médias | Images PNG/JPEG/WebP jusqu'à 5 Mo et vidéos MP4 jusqu'à 100 Mo ; accès privé aux fichiers ; SVG refusés |
| Paramètres persistants | Langue d'interface, langue de contenu, thème, styles, hijab, logo, format, résolution, fournisseur et budget |
| Interface FR / EN | Dictionnaires next-intl et préférence enregistrée ; les contenus saisis par l'utilisateur ne sont pas traduits automatiquement |
| Product Video Studio local | Photo vers MP4 de 5, 10 ou 15 secondes par zoom FFmpeg fixe ; animation non IA ; les presets, décors et prompts concernent Runway |
| Runway | Adaptateur serveur, clips de 5 ou 10 secondes et tâches asynchrones implémentés ; génération réelle non validée sans clé et autorisation de dépense |
| Estimation des coûts | Hypothèse tarifaire affichée, conversion USD/EUR manuelle, réservation et budget nul par défaut |
| Exports MP4 | Formats 9:16, 4:5, 1:1, 16:9 ; 720 à 2160 pour le petit côté ; H.264 et H.265 selon les encodeurs disponibles |
| Filigrane vidéo | Logo raster facultatif, position, taille, opacité et fondu d'apparition/disparition ; export sans logo possible |
| Sauvegarde | ZIP individuel avec description JSON et médias ; copie hors ligne de l'instance ; pas de planification ni de restauration automatisée |
| Profils de mannequins | Création, modification et réutilisation ; carnation, morphologie, taille, coiffure, pose, hijab indépendant et photo de référence facultative ; aucun portrait généré automatiquement |
| Looks et collections | Composition avec 1 à 8 vêtements, styles combinables, paramètres enregistrés, variantes et réutilisation des pièces |
| Planche de collection | Vrai PNG de 1600 pixels de large assemblant les photos ; sans IA ni essayage ; hauteur adaptée au nombre de photos |
| Fashion IA et virtual try-on | Deux modes et workflows ComfyUI distincts ; contrôles de configuration et tâches persistantes ; inférence réelle non validée sans service, modèles et workflows installés |
| Comparaison et animation | Originaux et résultat consultables côte à côte ; image téléchargeable et passage au studio vidéo sans génération automatique |
| Archive de collection | ZIP comprenant looks, profils utilisés et médias référencés ; modèles et installation ComfyUI exclus |

## Exigences V1.1 partiellement couvertes

Les styles prédéfinis peuvent être combinés et des noms de styles personnalisés enregistrés ; le hijab reste une option distincte. Fashion Studio conserve la coupe, les couleurs, les accessoires et superpositions décrits librement, la couverture, l'ambiance et les instructions créatives du look. Les profils conservent les caractéristiques du mannequin et sa pose. Ces descriptions sont transmises aux workflows ComfyUI configurés ; leur respect dépend du moteur et des modèles. Leur enregistrement ou une planche locale ne réalisent pas un essayage virtuel.

La suppression d'un projet est bloquée s'il possède des tâches en cours ou des tâches déjà envoyées au fournisseur : l'historique financier doit rester disponible. Les médias restent dans la bibliothèque après suppression du projet. Les images sont décodées et normalisées, avec une limite de 40 mégapixels. Les montants et tailles sont limités côté serveur, pas seulement dans les champs de l'interface.

Le Brand Kit repose sur plusieurs logos PNG/JPEG/WebP réutilisables et un logo actif. Les SVG sont refusés tant qu'un assainissement adapté n'est pas intégré. Les identités de marque multiples, les modèles de marque avancés et des cartons de logo de début/fin dédiés ne sont pas livrés.

La duplication d'un projet copie les fichiers et remappe les références des paramètres et des looks, y compris les médias de la bibliothèque utilisés par le projet. Elle ne copie pas le registre financier des générations. Une variante de look réutilise ses vêtements et son profil sans lancer de rendu. L'archive ZIP conserve l'historique du projet original, ses looks, les profils associés et les médias référencés.

Les exports vidéo permettent le redimensionnement jusqu'à 2160p et signalent l'agrandissement. Il n'y a ni génération native 4K promise pour Runway, ni upscaling IA, ni atelier d'export d'images en 4K. Le résultat dépend de la qualité de la source et des ressources de la machine.

Les parcours locaux fonctionnent sans fournisseur externe. La génération Runway demande un essai réel autorisé avec votre compte. Les images éditoriales et l'essayage demandent ComfyUI, les modèles et les workflows correspondants. Les tests de protocole simulés ne sont pas présentés comme des générations IA produites. Consultez le [guide Fashion et ComfyUI](PHASE_3.md) pour les contrats et limitations.

## Phases suivantes

| Phase | Fonctionnalités non livrées |
| --- | --- |
| 4 | Montage de plusieurs clips, découpe, transitions, titres, musique, couvertures, SEO Pinterest et exports dédiés |
| 5 | Adaptateurs Replicate, Ollama et Kling, extensions des moteurs locaux, optimisation des modèles, tests et documentation complémentaires |

L'import depuis une URL produit, le scraping, les publications sur les réseaux sociaux et Pippit ne sont pas intégrés. Aucun bouton ne doit être interprété comme une activation de ces services.
