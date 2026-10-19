# Phase 3 — Fashion Studio et Lookbook Creator

La phase 3 ajoute des profils de mannequins réutilisables, des looks regroupés par collection et trois modes de création d'image. La planche locale assemble les vraies photos importées. Les deux modes IA dépendent de votre installation ComfyUI et de workflows compatibles, à configurer séparément.

**Aucun service ComfyUI, GPU, modèle ou poids IA n'a été installé pour cette livraison. Aucune image éditoriale IA ni aucun essayage virtuel réel n'est revendiqué comme validé.** Un profil enregistré n'est pas un mannequin généré et une planche de vêtements n'est pas un essayage.

## Modes disponibles et prérequis

| Mode | Fonctionnement | Prérequis |
| --- | --- | --- |
| Planche de collection | Sharp compose un PNG avec les vêtements originaux et, si présente, la photo de référence | 1 à 8 photos ; aucun moteur IA |
| Image éditoriale IA | Le serveur transmet les vêtements et les paramètres à un workflow ComfyUI `fashion-image` | Service connecté, modèles et nœuds installés, fichier de workflow éditorial valide |
| Essayage virtuel | Un workflow ComfyUI `try-on` dédié reçoit vêtements et photo de référence | Service connecté, moteur d'essayage compatible, fichier distinct et photo du mannequin |

Le mode IA ne bascule jamais automatiquement vers une planche locale en cas d'échec. Les tâches et fichiers indiquent leur origine. Une planche porte également une mention visible précisant l'absence d'essayage virtuel.

Les tâches de cette phase n'appellent pas d'API payante et enregistrent un coût d'API de zéro. Ce montant ne couvre ni l'électricité, ni les machines ou GPU loués, ni les éventuelles licences des modèles ou nœuds installés dans votre service ComfyUI.

## Utilisation sans moteur IA

1. Créez ou sélectionnez un projet de type Fashion ou Lookbook. Il sert de collection.
2. Importez des photos PNG, JPEG ou WebP, jusqu'à 5 Mo par image, ou réutilisez celles de la bibliothèque. Un look contient de 1 à 8 vêtements distincts.
3. Si utile, créez un profil de mannequin avec un nom, une description, une carnation, une morphologie, une taille, une coiffure et une pose. Ajoutez une photo de référence pour les workflows qui en ont besoin.
4. Composez le look : styles combinables, coupe, couleurs, accessoires et superpositions, couverture, ambiance et instructions créatives. Enregistrez-le.
5. Choisissez **Planche de collection**, puis lancez la tâche. Le worker crée un vrai fichier PNG à partir des photos, sans inférence.
6. Comparez les originaux et le résultat, téléchargez l'image ou utilisez **Animer cette image** pour ouvrir le studio vidéo.

Le hijab est une option du profil, indépendante du style. Aucune préférence Modest Fashion n'est imposée. Les carnations, morphologies, coiffures et poses sont décrites librement. Ces paramètres sont des instructions pour un workflow ; leur enregistrement ne garantit pas qu'un modèle IA les respectera.

Une variante duplique le look et ses paramètres en réutilisant les mêmes vêtements et le même profil. Elle ne lance pas de génération. Les pièces restent disponibles pour d'autres looks. Modifier les paramètres, le mannequin ou les vêtements retire le résultat courant associé au look ; le fichier déjà produit reste dans la bibliothèque. Un enregistrement sans changement conserve le résultat. Les modifications et suppressions sont bloquées pendant un rendu actif. Un profil utilisé par un look doit d'abord être détaché avant sa suppression.

La planche locale mesure 1600 pixels de large ; sa hauteur dépend du nombre de photos. Elle conserve les vêtements et la référence en vignettes séparées. Elle ne place aucun vêtement sur un corps et ne modifie pas les poses.

Le passage au studio vidéo ne lance aucune dépense. Les limites du moteur vidéo choisi, le budget et la confirmation avant un appel payant restent applicables. La comparaison avant/après reste nécessaire pour tout résultat IA : coupe, texture, motifs, couleurs et détails peuvent être modifiés par le modèle.

## Installer et préparer ComfyUI

ComfyUI est un service externe au processus Next.js. Suivez sa [documentation d'installation officielle](https://docs.comfy.org/) pour votre système et votre matériel. Le choix de Python, de PyTorch, des pilotes et des modèles dépend de votre machine ; l'application ne les installe pas à votre place.

1. Choisissez un moteur éditorial et, pour l'essayage, un moteur conçu pour le virtual try-on. Vérifiez leurs besoins matériels, leur licence et leurs nœuds ComfyUI requis. Un GPU compatible est généralement utile ; aucune quantité de VRAM ni durée d'inférence universelle n'est promise.
2. Installez ComfyUI, les modèles et les nœuds nécessaires depuis les sources de leurs mainteneurs. Les nœuds personnalisés exécutent du code dans votre service : utilisez des sources que vous avez vérifiées.
3. Démarrez le service sur la machine qui héberge ces ressources. Dans une installation source standard, la commande est `python main.py --listen 127.0.0.1 --port 8188` ; une distribution portable peut utiliser son propre lanceur.
4. Dans ComfyUI, réalisez manuellement un rendu avec vos vêtements de test. Pour l'essayage, utilisez aussi une photo de référence autorisée et vérifiez que le workflow réalise bien un essayage, pas seulement une image à partir d'un texte.
5. Exportez chaque graphe au **format API** de ComfyUI. Le JSON de l'éditeur visuel et le graphe API ne sont pas interchangeables. Selon la version de l'interface, l'export API peut se trouver dans les options développeur.
6. Adaptez les entrées du graphe avec les placeholders décrits ci-dessous, puis enveloppez-le dans le contrat Yassdem. Conservez un fichier éditorial et un fichier d'essayage distincts sur le serveur.

Les noms de checkpoints, de nœuds et leurs connexions dépendent du moteur choisi. Aucun graphe universel exécutable ni poids de modèle n'est fourni. Une connexion réussie ou un JSON reconnu ne prouve pas que ces éléments sont installés et compatibles.

## Variables serveur

Ajoutez uniquement les variables utiles dans le `.env` du serveur. Exemple de chemins à adapter :

```dotenv
COMFYUI_URL="http://127.0.0.1:8188"
COMFYUI_FASHION_WORKFLOW="/workspace/yassdem-config/comfy/fashion-workflow.json"
COMFYUI_TRYON_WORKFLOW="/workspace/yassdem-config/comfy/tryon-workflow.json"
```

Sous Windows, utilisez des chemins absolus comme `C:/YassdemConfig/comfy/fashion-workflow.json`. Les fichiers peuvent rester en dehors du dépôt. Ils ne doivent contenir aucun secret.

`COMFYUI_URL` est une origine, sans chemin ajouté, paramètres, fragment ou identifiant dans l'URL. HTTP est accepté uniquement pour `localhost`, `127.0.0.1` et `[::1]`. Une adresse distante nécessite HTTPS avec un certificat valide. Les redirections sont refusées. L'adresse est définie par l'administrateur côté serveur, jamais par une URL reçue d'un navigateur.

L'adaptateur ne transmet pas de jeton d'authentification ComfyUI. Un service distant doit être accessible dans un réseau protégé ou derrière un proxy compatible avec cette configuration. Gardez ComfyUI et les photos privées hors d'un accès public sans contrôle.

Redémarrez le web et le worker après un changement de variables. La vérification de connexion interroge `/system_stats` sans lancer d'inférence. Le statut distingue la connexion au service de la validité du fichier de workflow pour chaque mode.

## Contrat des fichiers de workflow

Chaque fichier est un JSON UTF-8 d'au plus 1 Mio avec cette structure :

| Champ | Valeur |
| --- | --- |
| `version` | Nombre `1` |
| `mode` | `"fashion-image"` ou `"try-on"`, correspondant au fichier configuré |
| `garmentSlots` | Nombre entier de `1` à `8`, ou chaîne `"array"` |
| `prompt` | Graphe API ComfyUI : objet de nœuds identifiés, chacun avec `class_type` et un objet `inputs` |

Vous pouvez envelopper un graphe API exporté avec Python, puis compléter ses entrées :

```python
import json
from pathlib import Path

graph = json.loads(Path("comfy-api-graph.json").read_text(encoding="utf-8"))
workflow = {
    "version": 1,
    "mode": "fashion-image",
    "garmentSlots": 1,
    "prompt": graph,
}
with Path("fashion-workflow.json").open("x", encoding="utf-8") as target:
    json.dump(workflow, target, ensure_ascii=False, indent=2)
```

Ce script conserve votre graphe et refuse d'écraser un fichier de destination existant ; il ne choisit pas de modèle, ne crée pas ses connexions et n'insère pas les placeholders. Pour le second fichier, adaptez le mode à `"try-on"` et utilisez votre graphe d'essayage testé.

Les placeholders remplacent uniquement les **valeurs de `node.inputs`**, jamais les identifiants de nœud, les noms de champ ou la structure du graphe. Les marqueurs dynamiques dans `class_type`, les métadonnées des nœuds ou celles de l'enveloppe sont refusés. Insérez-les dans les entrées correspondant réellement au texte, aux images et aux paramètres de votre moteur.

| Placeholder | Valeur transmise et règle |
| --- | --- |
| `{{prompt}}` | Obligatoire ; texte incluant les instructions du look et les paramètres du profil |
| `{{mannequin_parameters}}` | Obligatoire ; chaîne JSON contenant les paramètres du profil, son nom et sa description |
| `{{garment_1}}` à `{{garment_N}}` | Obligatoires avec `garmentSlots: N` ; noms des images téléversées dans ComfyUI, exactement N vêtements sélectionnés |
| `{{garment_images}}` | Obligatoire avec `garmentSlots: "array"` ; tableau des noms d'images ; le nœud ciblé doit accepter ce tableau |
| `{{portrait_image}}` | Obligatoire en mode `try-on` ; nom de l'image de référence ; sa présence dans tout autre graphe rend également cette photo nécessaire |
| `{{seed}}` | Nombre entier généré et conservé pour la tâche |
| `{{width}}`, `{{height}}` | Dimensions demandées ; actuellement 1024 × 1536 pour une tâche Fashion |
| `{{negative_prompt}}` | Chaîne de prompt négatif ; vide avec les tâches Fashion actuelles |
| `{{mannequin.skinTone}}`, `{{mannequin.bodyType}}` | Descriptions de la carnation et de la morphologie |
| `{{mannequin.heightCm}}`, `{{mannequin.hair}}` | Taille numérique en centimètres et description de la coiffure |
| `{{mannequin.hijab}}`, `{{mannequin.pose}}` | Booléen indépendant du style et description de pose |
| `{{mannequin.name}}`, `{{mannequin.description}}` | Nom et description du profil |

Les entrées suivantes illustrent uniquement les valeurs à placer dans les nœuds existants de votre graphe ; elles ne constituent pas un workflow complet :

```json
{"image": "{{garment_1}}"}
```

```json
{"text": "{{prompt}}\nParamètres du mannequin : {{mannequin_parameters}}"}
```

```json
{"seed": "{{seed}}", "width": "{{width}}", "height": "{{height}}"}
```

Un placeholder seul conserve son type : `"{{seed}}"` devient un nombre et `"{{garment_images}}"` devient un tableau. Dans une chaîne plus longue, seuls les scalaires peuvent être insérés ; un tableau ou objet intégré dans une phrase est refusé. Le mode `array` n'est donc utilisable que si le nœud choisi accepte réellement plusieurs images comme tableau. Le mode à N emplacements demande exactement N vêtements et ne peut pas être mélangé au mode tableau.

Les graphes sont limités à 500 nœuds et une profondeur de 30 niveaux. Les placeholders inconnus ou mal formés, les chemins de clés dangereux et les correspondances de vêtements incomplètes sont refusés. Ces contrôles vérifient le contrat de transport ; le choix du moteur et la qualité de l'essayage restent à valider avec vos modèles.

## Tâches, résultats et reprise

Le worker téléverse les vêtements et, si nécessaire, le portrait via `/upload/image`, puis soumet le graphe à `/prompt`. Il conserve l'identifiant ComfyUI avant de consulter `/history/{id}`. Les images terminées sont récupérées via `/view`, décodées et réencodées en PNG dans la médiathèque privée.

Les réponses sont bornées ; les images récupérées sont limitées à 20 Mio et 40 mégapixels au décodage. Les noms de fichier et sous-dossiers sont validés pour éviter une lecture de chemin arbitraire. Si le graphe produit plusieurs images, la première image disponible est enregistrée comme résultat du look. Les dimensions affichées sont celles du fichier effectivement décodé, pas une promesse de génération native 4K.

La tâche conserve une copie des paramètres utilisés. Les clics répétés avec la même clé d'idempotence ne soumettent pas une deuxième inférence. Après une coupure, une tâche dont l'identifiant ComfyUI est connu peut reprendre le suivi. Un envoi dont l'acceptation est incertaine devient `UNKNOWN` et n'est pas soumis de nouveau automatiquement.

L'annulation dans le studio arrête le suivi et l'association du résultat ; elle n'interrompt pas nécessairement un calcul déjà lancé dans ComfyUI. Consultez la file du service pour arrêter ce calcul. L'application n'envoie pas d'interruption globale susceptible d'affecter d'autres utilisateurs de votre instance ComfyUI.

## Sauvegarde et validation

L'archive ZIP de la collection contient les looks, les paramètres des profils utilisés et les médias référencés, y compris les vêtements et les photos de référence issus de la bibliothèque. Elle ne contient pas les checkpoints, les nœuds, l'installation ComfyUI ou ses fichiers de configuration serveur. Conservez ces éléments séparément pour rendre votre workflow reproductible. La restauration de cette archive reste manuelle.

Les tests de protocole vérifient les placeholders, les requêtes et les reprises avec des réponses ComfyUI simulées. Un test utilise une vraie base SQLite et télécharge puis décode un vrai PNG fourni par le serveur simulé. Le parcours HTTP de phase 3 vérifie également un PNG de planche réellement assemblé par Sharp, la réutilisation des vêtements, les variantes et le ZIP. Les résultats sont détaillés dans [VALIDATION.md](VALIDATION.md).

Ces contrôles ne démontrent pas la disponibilité d'un GPU, la compatibilité d'un checkpoint, la fidélité d'un vêtement ni la réussite d'une véritable inférence. Aucune génération de mannequin ou d'essayage n'est remplacée par une simulation présentée comme réelle.
