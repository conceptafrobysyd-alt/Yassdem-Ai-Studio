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
