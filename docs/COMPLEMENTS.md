# Compléments du cahier des charges

## Aperçus avant export

Le montage dispose d’un aperçu complet calculé localement par FFmpeg : clips coupés et ordonnés, textes, transitions, son, musique et logo. Le bouton **Prévisualiser le montage** crée une tâche distincte `edit-preview`, en H.264 à 360 pixels sur le petit côté et CRF 28. Il ne lance pas l’export définitif et ne change ni sa résolution, ni son codec, ni sa qualité enregistrés. La confirmation des droits reste obligatoire lorsqu’une musique est ajoutée.

L’onglet d’aperçu affiche le vrai MP4 et signale les modifications intervenues depuis son calcul. Les médias d’aperçu sont identifiés comme tels et ne comptent pas comme vidéos finales sur le tableau de bord.

L’export d’image propose **Prévisualiser les réglages**. Le serveur calcule réellement le cadrage, le logo, sa position et son opacité dans une image d’au plus 1024 pixels de côté. Cet aperçu ne crée aucun fichier, média ou historique persistant. L’interface annule les requêtes périmées et libère ses URL temporaires. Les dimensions de l’export prévu restent distinctes de celles de l’aperçu.

Le studio produit enregistre désormais ses seuls réglages dans une transaction, en conservant les paramètres les plus récents des autres ateliers. Un ancien brouillon produit n’efface plus un montage, un texte Pinterest, une référence produit ou l’historique d’exports d’image.

Les définitions TypeScript générées par Next.js sont exclues de Git. `npm run typecheck` commence par `next typegen`, conformément à la documentation de la version installée, avant de vérifier les types.

## Styles avec paramètres réutilisables

Les paramètres et Fashion Studio proposent un catalogue personnel de styles. Chaque style enregistre sa coupe, sa longueur, ses couleurs, accessoires, superpositions, couverture vestimentaire, ambiance, décor, pose et caractéristiques souhaitées du mannequin. Jusqu’à 100 styles peuvent être conservés.

Dans Fashion Studio, **Ajouter ce style au look** applique explicitement le style au brouillon. Les noms et listes se combinent ; les descriptions non vides et la coupe du dernier style appliqué prennent la priorité. Une combinaison dépassant les limites des listes est refusée. Le profil choisi, son option hijab et le prompt restent inchangés.

Enregistrez le look après application. Les valeurs sont copiées dans le look et dans les tâches futures : modifier ou supprimer le style d’origine ne modifie pas les looks, tâches ou archives existants. Ces réglages sont des instructions pour les workflows IA configurés ; leur enregistrement ne prouve aucune génération ou fidélité de modèle.

## Import produit autorisé

Le studio produit accepte une fiche Shopify via son API produit officielle, ou un flux JSON fourni et autorisé par le marchand. Il enregistre les informations et au plus trois images réelles après confirmation des droits. Il ne lit pas le HTML et ne contourne ni connexion ni protection. Les images importées sont proposées comme source du projet.

L’import protège les destinations réseau, épingle le DNS public pour la connexion TLS et refuse les redirections. Il ne transmet aucun cookie ou secret. La description, les fichiers, le registre d’import et les références sont enregistrés ensemble ; un échec annule l’ensemble et nettoie les fichiers partiels. Les réessais reprennent la même demande.

Le [guide d’import](PRODUCT_IMPORT.md) détaille les contrats et les limites. Les tests de transport utilisent des réponses DNS/HTTPS simulées avec de vrais fichiers et une vraie base. Sur ce cloud, une résolution DNS externe directe n’a pas abouti : aucun import depuis une boutique réelle n’est revendiqué. Le déploiement doit permettre les domaines de la boutique et de ses images ainsi qu’une connexion DNS/TLS compatible avec ces contrôles.

## Catalogue des modèles et fournisseurs compatibles

Le catalogue privé décrit les modèles et workflows pris en charge, leurs paramètres, leurs limites et leurs coûts indicatifs. Sa lecture ne lance aucun appel réseau, génération ou téléchargement de modèle. Il ne prétend pas constituer un inventaire des droits de votre compte fournisseur. Une configuration présente reste distincte d’un accès au modèle ou d’une inférence réussie.

Le studio vidéo propose FFmpeg, Runway et le modèle Replicate configuré lorsqu’il produit de la vidéo. Le choix d’un modèle compatible sélectionne son fournisseur. Replicate conserve son formulaire adapté : description, image facultative, version immuable et réservation à confirmer. Les contrôles propres à Runway ou à un export local ne sont pas présentés comme paramètres natifs Replicate. Le résultat vidéo rejoint l’historique du projet et peut être réutilisé dans le montage.

Replicate peut devenir le fournisseur vidéo préféré uniquement avec une configuration vidéo compatible. Cette préférence n’active pas le fournisseur et ne modifie pas le plafond financier. Un modèle d’image reste disponible dans son atelier de génération, sans être proposé comme moteur vidéo. Les modèles ComfyUI et Ollama restent liés aux workflows ou au modèle explicitement configurés par l’administrateur.
