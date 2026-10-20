# Phase 4 — Montage vidéo et Pinterest

Cette phase ajoute un montage local de plusieurs vidéos et un atelier de préparation des textes Pinterest. Le montage utilise FFmpeg ; la rédaction locale utilise des modèles de texte explicites. Ces parcours ne demandent aucune clé API et ne lancent aucune génération IA payante.

## Monter une vidéo

1. Ouvrez **Montage vidéo** et choisissez un projet, ou créez un nouveau montage.
2. Ajoutez des MP4 depuis la médiathèque ou importez vos fichiers. Réordonnez les clips, puis indiquez les temps de début et de fin en secondes.
3. Choisissez une coupe franche ou un fondu enchaîné. Ajoutez des textes et leurs horaires sur la vidéo finale.
4. Si nécessaire, importez une musique MP3, WAV ou M4A, choisissez son volume et confirmez que vous disposez des droits nécessaires à son utilisation.
5. Choisissez le format, la résolution, le codec et un éventuel logo. Enregistrez puis lancez l'export.
6. Après traitement par le worker, prévisualisez et téléchargez le MP4 et sa couverture JPEG.

La séquence accepte au maximum 12 clips et 120 secondes de sources, avec au moins 0,5 seconde par clip. Un fondu chevauche les deux clips pendant 0,35 seconde et réduit donc la durée finale. Les textes sont limités à 40 entrées, 500 caractères et quatre lignes par entrée. Leurs horaires doivent rester dans la durée finale.

L'aperçu avant export montre le clip source sélectionné. Le résultat assemblé, les textes et les effets sont visibles après l'export : il n'y a pas de prévisualisation interactive du montage complet. La couverture est une image extraite automatiquement du résultat, sans outil de mise en page distinct.

Le son original des clips est conservé. Les clips muets reçoivent une piste de silence pour permettre leur assemblage. La musique ajoutée est répétée si nécessaire et mélangée au son original, avec le volume choisi. L'application n'inclut ni catalogue de musique, ni licence musicale. La confirmation de droits est obligatoire côté serveur pour chaque export comportant une musique ajoutée ; la conserver dans la médiathèque ne vaut pas autorisation d'utilisation.

Les images PNG, JPEG et WebP sont limitées à 5 Mo, les vidéos MP4 à 100 Mo et les pistes audio à 50 Mo. Les pistes audio sont contrôlées par FFprobe et limitées à 30 minutes ; elles doivent contenir du son et ne pas contenir de vidéo, à l'exception d'une éventuelle pochette intégrée.

## Export et qualité

Les formats proposés sont 9:16, 4:5, 1:1 et 16:9. Les résolutions 720, 1080, 1440 et 2160 désignent le petit côté ; par exemple, 16:9 en 2160 donne 3840 × 2160 pixels. Les sources sont adaptées au cadre par redimensionnement et recadrage. Le H.264 nécessite `libx264` et le H.265 nécessite `libx265` dans FFmpeg.

La compression propose trois réglages : qualité élevée, équilibré et fichier léger. Le montage utilise équilibré par défaut ; le studio produit démarre sur qualité élevée. Ils pilotent réellement l’encodage, respectivement avec les valeurs CRF 18, 21 et 28 ; une valeur plus basse privilégie la qualité et produit généralement un fichier plus volumineux. La taille finale dépend aussi du contenu, du codec et de la durée.

Un export 2160p peut agrandir des sources plus petites. Il ne crée pas de détails natifs et n'applique pas d'upscaling IA. Les métadonnées du résultat indiquent l'agrandissement éventuel et l'absence d'upscaling IA. Le logo réutilise les images raster de la médiathèque avec position, taille, opacité et fondu facultatif. Depuis la phase 5, il peut être affiché sur toute la vidéo ou pendant au plus deux secondes au début ou à la fin. Il se superpose aux clips ; aucun carton supplémentaire n’est ajouté. Un logo SVG simple est d’abord contrôlé et converti en PNG à l’import.

Les textes utilisent le filtre FFmpeg `drawtext` et une police locale. L'application recherche DejaVu Sans ou Liberation Sans sous Linux, Arial sous macOS et Windows. La variable serveur facultative `FFMPEG_FONT_PATH` permet de préciser un fichier de police autorisé. Une police indisponible donne une erreur explicite ; les textes ne sont pas supprimés silencieusement.

Un seul worker doit traiter une même base SQLite. Les exports sont des tâches persistantes et gratuites côté API. La séquence est figée lors de la mise en file : modifier ensuite le projet ne modifie pas un export déjà demandé. Une même clé d'idempotence ne crée pas deux tâches. L'annulation arrête le suivi de l'export et empêche l'enregistrement du résultat ; le processus de rendu en cours peut terminer avant son nettoyage.

## Préparer les textes Pinterest

1. Ouvrez **Pinterest SEO**, puis choisissez un projet.
2. Renseignez le nom, la catégorie et les caractéristiques factuelles du produit. La marque, le public visé, les mots-clés et les liens sont facultatifs.
3. Choisissez le français, l'anglais ou les deux, indépendamment de la langue de l'interface.
4. Choisissez **Rédaction assistée locale**, puis préparez le contenu.
5. Relisez et modifiez les propositions, enregistrez les changements et téléchargez le JSON ou le CSV.

Chaque langue comporte trois titres distincts, deux descriptions, un mot-clé principal, des mots-clés secondaires, un appel à l'action, un texte alternatif et un nom de tableau. Les titres sont limités à 100 caractères et les descriptions à 500. Le texte alternatif est un brouillon fondé sur les caractéristiques saisies : l'application n'inspecte pas le visuel. Adaptez-le à l'image réellement publiée.

La rédaction locale assemble uniquement les informations fournies. Elle ne traduit pas automatiquement les caractéristiques saisies et ne vérifie pas leur exactitude. Aucun site produit n'est téléchargé, aucun scraping n'est effectué et aucune donnée n'est extraite d'une URL. Les liens servent exclusivement de métadonnées de destination.

Un lien affilié exige une mention publicitaire. L'application conserve une mention explicite dans chaque description et refuse son retrait lors d'une modification. Relisez les textes et adaptez les mentions à votre situation avant publication.

Le mode Ollama appelle un modèle installé séparément sur votre serveur local. Il est facultatif : un service absent ou une réponse invalide donnent une erreur, sans remplacement silencieux par une prétendue génération IA. Configurez `OLLAMA_URL` (par défaut `http://127.0.0.1:11434`) et `OLLAMA_MODEL` avec le nom exact d'un modèle déjà installé. Le service doit être accessible en boucle locale ; aucun modèle n'est téléchargé automatiquement. Le [guide des fournisseurs](PHASE_5.md) précise les contrôles de connexion. Aucune inférence Ollama réelle n'a été validée dans cet environnement.

## Fichiers et sauvegarde

Le CSV contient les colonnes Pinterest et trois propositions par langue. Les colonnes d'URL publique du média, de miniature et de date de publication sont laissées vides. Les médias privés du studio ne sont pas des URL publiquement accessibles : hébergez le fichier à une adresse adaptée, choisissez votre proposition et complétez les données avant un import Pinterest. Le CSV neutralise les valeurs pouvant être interprétées comme des formules par un tableur. L'application ne publie rien sur Pinterest et ne garantit aucun classement SEO.

Le JSON conserve également l'appel à l'action et le texte alternatif. Le ZIP individuel du projet inclut les médias et ses paramètres enregistrés, dont le montage et le contenu SEO. Les exports vidéo et leurs couvertures sont enregistrés dans la médiathèque privée. Les sauvegardes n'incluent aucune clé API.

## Vérifier cette phase

```bash
npx vitest run tests/editor.test.ts tests/seo.test.ts
npm run build
npm run test:smoke:editor
```

Les tests du montage produisent de vraies vidéos avec FFmpeg ; ceux du SEO vérifient les limites, les langues, les mentions, les exports et les réponses Ollama simulées. Les parcours HTTP et navigateur effectivement exécutés sont consignés dans [VALIDATION.md](VALIDATION.md). Un protocole simulé ne démontre pas qu'un modèle externe est installé ou accessible.
