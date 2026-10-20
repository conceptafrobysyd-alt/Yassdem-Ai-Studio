# Importer une fiche produit autorisée

L’atelier produit importe les informations et les photos provenant d’une API de boutique accessible sans authentification. Vous devez confirmer que vous disposez des droits nécessaires pour consulter ces données et utiliser les images. L’import ne contourne aucun contrôle d’accès, ne lit aucune page HTML et ne transmet aucun cookie ou jeton.

## Boutique Shopify

Choisissez **Boutique Shopify**, puis collez l’adresse publique d’un produit, par exemple `https://boutique.example.com/products/sac-signature`. Le serveur utilise le point d’accès officiel Shopify Ajax Product API : `/products/sac-signature.js`. Les préfixes de langue et les adresses passant par une collection sont également reconnus. Les paramètres de variante ne modifient pas le produit importé ; aucune promesse de correspondance de variante n’est faite.

L’import enregistre le titre, une description convertie en texte et au plus les trois premières images du produit. Le nom de votre projet est conservé ; une case explicite permet de le remplacer par celui du produit. Les prix, stocks, promotions, variantes et devises ne sont pas importés.

Source du protocole : [documentation officielle Shopify Ajax Product API](https://shopify.dev/docs/api/ajax/reference/product). Une boutique qui bloque cet accès, exige une session ou redirige vers une page ne peut pas être importée par ce mode. Le service ne tente pas d’en récupérer le contenu HTML à la place.

## Flux JSON autorisé

Le mode avancé accepte une adresse de fiche produit, conservée comme référence, et une adresse distincte de flux JSON autorisé. Ce dernier doit retourner un objet de ce type avec `Content-Type: application/json` :

```json
{
  "name": "Sac signature",
  "description": "Caractéristiques vérifiées communiquées par la boutique.",
  "images": ["https://cdn.example.com/sac.png"]
}
```

Un objet JSON-LD `Product` retourné directement comme JSON est également accepté avec les champs `name`, `description` et `image` (chaîne ou tableau de chaînes). Le serveur n’extrait jamais de JSON-LD d’une page HTML. Les données d’un autre schéma doivent être adaptées par leur fournisseur ; elles ne sont pas devinées.

La description du flux générique est du texte, limitée à 3000 caractères. Le titre est limité à 150 caractères. Le flux est limité à 1 Mio ; au plus trois images sont téléchargées, chacune limitée à 5 Mio et 40 mégapixels. Seuls PNG, JPEG et WebP sont acceptés après vérification des signatures et décodage réel. Les fichiers obtenus sont stockés dans la médiathèque privée et restent référencés dans les paramètres du projet, sa duplication et son archive ZIP.

## Réseau et sécurité

Les adresses doivent utiliser HTTPS, sans identifiant, fragment, port personnalisé ni paramètre ressemblant à un secret. Les adresses IP littérales, hôtes locaux, réseaux privés, métadonnées cloud et réponses DNS mêlant adresses publiques et privées sont refusés. Les connexions TLS utilisent l’adresse publique validée et épinglée ; les redirections sont refusées. Chaque image provenant du flux fait l’objet des mêmes vérifications.

Une configuration cloud à réseau restreint doit autoriser le nom de domaine de votre boutique/API et les domaines CDN exacts de ses images. La présence d’un domaine dans une liste d’autorisation ne remplace pas les contrôles SSRF du serveur. Les destinations ne sont pas ajoutées automatiquement à la politique réseau. Les flux nécessitant un en-tête d’authentification ou une URL signée contenant un secret ne sont pas pris en charge.

Le transport demande une résolution DNS et une connexion HTTPS sortante directes afin d’épingler l’adresse vérifiée. Il ne remplace pas cette protection par une requête passant silencieusement par un proxy qui résoudrait de nouveau le nom. Dans l’environnement cloud de validation, la requête de documentation a échoué à l’étape DNS (`PRODUCT_IMPORT_DNS`) ; aucun import depuis une boutique réelle n’a donc été validé sur cette machine. L’import manuel de photos reste disponible.

L’import n’appelle aucun modèle IA et ne consomme aucun crédit de génération. Un échec d’une image ou de l’enregistrement annule l’import complet et supprime les fichiers partiels. Une même demande réessayée avec sa clé d’idempotence retrouve l’import enregistré, sans télécharger de nouvelles copies.

## Validation constatée

Les tests utilisent une vraie base SQLite, de vrais pixels PNG et des réponses HTTPS/DNS simulées. Ils vérifient le protocole Shopify, le contrat JSON, les contrôles SSRF et TLS, les limites, l’authentification, les références, la duplication et le nettoyage après échec. Aucun accès à une boutique réelle n’est revendiqué par ces tests. La lecture de la documentation Shopify depuis cet environnement a été bloquée par le réseau ; aucune protection n’a été désactivée pour y accéder.
