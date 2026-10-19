# Périmètre des phases 1 et 2

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

## Exigences V1.1 partiellement couvertes

Les styles prédéfinis peuvent être combinés et des noms de styles personnalisés enregistrés ; le hijab reste une option distincte. Les champs de coupe, couleurs, accessoires, couverture, ambiance et caractéristiques du mannequin sont enregistrés dans les préférences du projet. Ils préparent la phase 3 : aucun moteur de mannequin ne les applique actuellement. Le choix d'un style ne réalise pas un essayage virtuel. Les paramètres de poses et de superpositions ne disposent pas encore d'un éditeur dédié.

La suppression d'un projet est bloquée s'il possède des tâches en cours ou des tâches déjà envoyées au fournisseur : l'historique financier doit rester disponible. Les médias restent dans la bibliothèque après suppression du projet. Les images sont décodées et normalisées, avec une limite de 40 mégapixels. Les montants et tailles sont limités côté serveur, pas seulement dans les champs de l'interface.

Le Brand Kit repose sur plusieurs logos PNG/JPEG/WebP réutilisables et un logo actif. Les SVG sont refusés tant qu'un assainissement adapté n'est pas intégré. Les identités de marque multiples, les modèles de marque avancés et des cartons de logo de début/fin dédiés ne sont pas livrés.

La duplication copie les fichiers et remappe les références des paramètres, y compris les médias de la bibliothèque utilisés par le projet. Elle ne copie pas le registre financier des générations. L'archive ZIP conserve l'historique du projet original et les médias référencés par ses paramètres et ses tâches.

Les exports vidéo permettent le redimensionnement jusqu'à 2160p et signalent l'agrandissement. Il n'y a ni génération native 4K promise pour Runway, ni upscaling IA, ni atelier d'export d'images en 4K. Le résultat dépend de la qualité de la source et des ressources de la machine.

Le parcours local fonctionne sans fournisseur externe. L'état opérationnel d'une génération Runway ne pourra être affirmé qu'après un essai réel autorisé avec votre compte ; les tests d'intégration simulés ne sont pas présentés comme des vidéos IA produites.

## Phases suivantes

| Phase | Fonctionnalités non livrées |
| --- | --- |
| 3 | AI Fashion Studio, mannequins, virtual try-on distinct, comparaison avant/après et Lookbook Creator |
| 4 | Montage de plusieurs clips, découpe, transitions, titres, musique, couvertures, SEO Pinterest et exports dédiés |
| 5 | Adaptateurs Replicate, ComfyUI, Ollama et Kling, optimisation des modèles, tests et documentation complémentaires |

L'import depuis une URL produit, le scraping, les publications sur les réseaux sociaux et Pippit ne sont pas intégrés. Aucun bouton ne doit être interprété comme une activation de ces services.
