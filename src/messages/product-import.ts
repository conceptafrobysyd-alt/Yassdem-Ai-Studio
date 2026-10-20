const fr = {
  title: 'Importer une fiche produit',
  description:
    'Retrouvez les informations et les photos fournies par une source autorisée.',
  free: 'Sans génération IA · 0 €',
  project: 'Projet de destination',
  source: 'Source du produit',
  shopify: 'Fiche produit Shopify',
  json: 'Flux produit autorisé',
  shopifyHint:
    'Collez le lien d’un produit Shopify. Le studio utilise son API produit officielle, sans analyser la page Web.',
  chooseProject: 'Choisir un projet',
  noProject: 'Créez un projet produit pour y enregistrer votre import.',
  productUrl: 'Lien de la fiche produit',
  productUrlHint:
    'Ce lien est conservé comme référence. La page du marchand n’est pas analysée.',
  dataUrl: 'Lien des données autorisées',
  dataUrlHint:
    'Utilisez le lien HTTPS du flux ou de l’API produit fourni par le marchand.',
  feedHelp: 'Quelle source puis-je utiliser ?',
  feedDescription:
    'La source doit fournir les données du produit au format JSON : nom, description facultative et liens de ses images. Les fiches JSON-LD Product servies en JSON sont aussi acceptées. Une page HTML ou une page nécessitant une connexion ne peut pas être importée.',
  feedLimits:
    'Trois images maximum, 5 Mo et 40 mégapixels par image. Si le marchand ne fournit pas de flux autorisé, importez les photos manuellement depuis la bibliothèque.',
  authorized:
    'Je dispose de l’autorisation nécessaire pour accéder à ces données et télécharger ces images.',
  replaceName: 'Remplacer le nom du projet par le nom du produit',
  import: 'Importer la fiche et les images',
  importing: 'Import en cours…',
  retry: 'Réessayer le même import',
  imported: 'Fiche et images enregistrées dans le projet.',
  refreshFailed:
    'L’import est enregistré. Actualisez le studio pour afficher tous les médias.',
  retryHint:
    'La réponse n’a pas pu être confirmée. Réessayez : la même demande sera retrouvée, sans ajouter deux fois les mêmes fichiers.',
  viewProduct: 'Voir la fiche produit',
  savedIn: 'Projet',
  importedImages: 'Images importées',
  manual:
    'Aucun compte marchand, mot de passe ou jeton ne doit être saisi dans les liens.',
  PRODUCT_IMPORT_AUTHORIZATION_REQUIRED:
    'Confirmez votre autorisation avant de lancer cet import.',
  PRODUCT_IMPORT_INVALID_URL:
    'Utilisez des liens HTTPS publics, sans identifiants ni jeton d’accès.',
  PRODUCT_IMPORT_UNSAFE_URL:
    'Cette adresse n’est pas autorisée. Les adresses privées et les ressources internes sont refusées.',
  PRODUCT_IMPORT_DNS:
    'L’adresse du fournisseur n’a pas pu être vérifiée. Vérifiez le lien et l’accès réseau du serveur, ou importez les photos manuellement.',
  PRODUCT_IMPORT_FETCH_FAILED:
    'La source est inaccessible. Vérifiez que le lien autorisé fonctionne sans connexion.',
  PRODUCT_IMPORT_REDIRECT:
    'Ce lien redirige vers une autre adresse. Utilisez le lien direct fourni par le marchand.',
  PRODUCT_IMPORT_JSON_REQUIRED:
    'Le lien doit fournir des données produit JSON. Une page Web HTML n’est pas importée.',
  PRODUCT_IMPORT_INVALID_DATA:
    'Les données ne correspondent pas à une fiche produit compatible avec des liens d’images.',
  PRODUCT_IMPORT_UNSUPPORTED_PRODUCT_URL:
    'Ce lien ne correspond pas à une fiche produit Shopify compatible. Utilisez un flux autorisé ou importez les photos manuellement.',
  PRODUCT_IMPORT_TOO_LARGE:
    'La source dépasse les limites autorisées : données 1 Mo, images 5 Mo chacune.',
  PRODUCT_IMPORT_INVALID_IMAGE:
    'Une image est invalide ou dépasse 40 mégapixels. Utilisez des images PNG, JPG ou WebP.',
  PRODUCT_IMPORT_BUSY:
    'Un import est déjà en cours. Réessayez dans quelques instants.',
  PRODUCT_IMPORT_PROJECT_TOO_LARGE:
    'Ce projet contient trop de données. Choisissez un autre projet.',
  PRODUCT_IMPORT_IDEMPOTENCY_CONFLICT:
    'Cette demande correspond à un autre import. Actualisez le projet avant de recommencer.',
  auth: 'Reconnectez-vous au studio pour importer une fiche produit.',
  error: 'L’import n’a pas pu être terminé. Vérifiez la source et réessayez.',
};
const en: typeof fr = {
  title: 'Import a product listing',
  description:
    'Bring in information and photos supplied by an authorized source.',
  free: 'No AI generation · €0',
  project: 'Destination project',
  source: 'Product source',
  shopify: 'Shopify product listing',
  json: 'Authorized product feed',
  shopifyHint:
    'Paste a Shopify product link. The studio uses its official product API without analyzing the web page.',
  chooseProject: 'Choose a project',
  noProject: 'Create a product project to save your import.',
  productUrl: 'Product listing link',
  productUrlHint:
    'This link is saved as a reference. The merchant page is not analyzed.',
  dataUrl: 'Authorized product data link',
  dataUrlHint:
    'Use the HTTPS product feed or API link supplied by the merchant.',
  feedHelp: 'Which source can I use?',
  feedDescription:
    'The source must provide product data as JSON: a name, an optional description, and image links. JSON-LD Product listings served as JSON are also accepted. HTML pages and pages requiring a login cannot be imported.',
  feedLimits:
    'Up to three images, 5 MB and 40 megapixels per image. If the merchant does not offer an authorized feed, upload photos manually in the library.',
  authorized:
    'I have the necessary permission to access this data and download these images.',
  replaceName: 'Replace the project name with the product name',
  import: 'Import listing and images',
  importing: 'Importing…',
  retry: 'Retry this import',
  imported: 'Product listing and images saved to the project.',
  refreshFailed: 'Your import is saved. Refresh the studio to see all media.',
  retryHint:
    'The response could not be confirmed. Retry: the same request will be retrieved without adding the same files twice.',
  viewProduct: 'View product listing',
  savedIn: 'Project',
  importedImages: 'Imported images',
  manual:
    'Do not include merchant account credentials, passwords, or access tokens in these links.',
  PRODUCT_IMPORT_AUTHORIZATION_REQUIRED:
    'Confirm your authorization before importing.',
  PRODUCT_IMPORT_INVALID_URL:
    'Use public HTTPS links without credentials or access tokens.',
  PRODUCT_IMPORT_UNSAFE_URL:
    'This address is not allowed. Private addresses and internal resources are blocked.',
  PRODUCT_IMPORT_DNS:
    'The source address could not be verified. Check the link and server network access, or upload the photos manually.',
  PRODUCT_IMPORT_FETCH_FAILED:
    'The source could not be reached. Check that the authorized link works without logging in.',
  PRODUCT_IMPORT_REDIRECT:
    'This link redirects to another address. Use the direct link supplied by the merchant.',
  PRODUCT_IMPORT_JSON_REQUIRED:
    'The link must provide JSON product data. HTML web pages are not imported.',
  PRODUCT_IMPORT_INVALID_DATA:
    'The data is not a supported product listing with image links.',
  PRODUCT_IMPORT_UNSUPPORTED_PRODUCT_URL:
    'This link is not a supported Shopify product listing. Use an authorized feed or upload photos manually.',
  PRODUCT_IMPORT_TOO_LARGE:
    'The source exceeds the limits: 1 MB for product data and 5 MB per image.',
  PRODUCT_IMPORT_INVALID_IMAGE:
    'An image is invalid or exceeds 40 megapixels. Use PNG, JPG, or WebP images.',
  PRODUCT_IMPORT_BUSY: 'An import is already running. Try again shortly.',
  PRODUCT_IMPORT_PROJECT_TOO_LARGE:
    'This project contains too much data. Choose another project.',
  PRODUCT_IMPORT_IDEMPOTENCY_CONFLICT:
    'This request belongs to another import. Refresh the project before starting again.',
  auth: 'Sign in to the studio again to import a product listing.',
  error: 'The import could not be completed. Check the source and try again.',
};
export const productImportMessages = { fr, en };
