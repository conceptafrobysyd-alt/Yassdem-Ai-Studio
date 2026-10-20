const fr = {
  eyebrow: 'CONTENU & DÉCOUVERTE',
  title: 'Pinterest SEO',
  subtitle:
    'Préparez des textes précis, adaptez chaque variante et exportez votre contenu.',
  project: 'Projet',
  chooseProject: 'Choisir un projet',
  newProject: 'Nouveau projet produit',
  projectName: 'Nom du nouveau projet',
  createProject: 'Créer le projet',
  brief: 'La fiche produit',
  briefHint:
    'Renseignez uniquement des informations vérifiées. Aucun site ni média n’est analysé automatiquement.',
  productName: 'Nom du produit',
  brand: 'Marque',
  category: 'Catégorie',
  features: 'Caractéristiques factuelles',
  featuresHint:
    'Une par ligne · 8 maximum. Elles sont reprises telles que vous les fournissez.',
  audience: 'Public visé',
  keywords: 'Mots-clés',
  keywordsHint: 'Séparez par des virgules · 10 maximum, sans répétition.',
  url: 'Lien de la fiche produit',
  affiliateUrl: 'Lien affilié (facultatif)',
  disclosure: 'Mention publicitaire',
  disclosureHint:
    'Obligatoire avec un lien affilié. Une mention explicite est conservée dans chaque description.',
  contentLanguage: 'Langue du contenu',
  contentLanguageHint:
    'Indépendante de la langue de l’interface. Traduisez les caractéristiques saisies si nécessaire.',
  french: 'Français',
  english: 'Anglais',
  both: 'Français + anglais',
  mode: 'Aide à la rédaction',
  local: 'Rédaction assistée locale',
  ollama: 'Modèle local Ollama',
  localNotice:
    'Rédaction assistée locale : modèles de texte, pas de modèle IA. Aucun appel externe ni coût de génération.',
  ollamaNotice:
    'Ollama utilise le modèle configuré sur votre serveur. Les textes proposés doivent être relus.',
  generate: 'Préparer et enregistrer',
  regenerating: 'Préparer de nouvelles variantes',
  working: 'En cours…',
  results: 'Votre contenu',
  noContent: 'Votre fiche est prête à être rédigée.',
  noContentHint:
    'Choisissez un projet, décrivez votre produit et préparez vos premières variantes.',
  review:
    'Relisez les faits et les mentions avant publication. Le texte alternatif est un brouillon à adapter au visuel final.',
  sourceLocal: 'Rédaction locale · sans modèle IA',
  sourceOllama: 'Rédaction avec Ollama',
  titleVariant: 'Titre',
  descriptionVariant: 'Description',
  primaryKeyword: 'Mot-clé principal',
  secondaryKeywords: 'Mots-clés secondaires',
  cta: 'Appel à l’action',
  altText: 'Texte alternatif',
  board: 'Tableau Pinterest',
  save: 'Enregistrer les modifications',
  saved: 'Contenu enregistré.',
  dirty: 'Modifications à enregistrer',
  copy: 'Copier',
  copied: 'Copié dans le presse-papiers.',
  copyAll: 'Tout copier',
  exportJson: 'JSON complet',
  exportCsv: 'CSV Pinterest',
  archive: 'Projet + médias (.zip)',
  exportHint:
    'Le CSV contient les colonnes Pinterest et 3 propositions par langue. Ajoutez une URL publique de média, choisissez votre variante et vérifiez les données avant import. Rien n’est publié automatiquement. Le JSON conserve aussi le texte alternatif et l’appel à l’action.',
  archiveHint:
    'Le ZIP conserve les médias et le contenu SEO enregistré dans les paramètres du projet.',
  exportSaved:
    'Enregistrez vos modifications avant de télécharger la dernière version.',
  seoError:
    'Impossible de terminer cette opération. Vérifiez les champs et réessayez.',
  required: 'Complétez le nom du produit et sa catégorie.',
  SEO_INVALID_URL:
    'Utilisez une URL publique HTTP ou HTTPS, sans identifiants. Un lien affilié doit utiliser HTTPS.',
  SEO_DISCLOSURE_REQUIRED:
    'Conservez la mention publicitaire dans les deux descriptions et dans le champ dédié.',
  SEO_INVALID_OUTPUT:
    'Chaque langue doit conserver 3 titres différents et 2 descriptions différentes, dans les limites indiquées.',
  SEO_INVALID_MODEL_OUTPUT:
    'Le modèle a renvoyé un format invalide. Réessayez ou choisissez la rédaction locale.',
  SEO_PROJECT_TOO_LARGE:
    'Les paramètres de ce projet sont trop volumineux. Réduisez la fiche ou utilisez un nouveau projet.',
  OLLAMA_NOT_CONFIGURED:
    'Configurez Ollama et son modèle dans les paramètres de l’environnement, ou choisissez la rédaction locale.',
  OLLAMA_MODEL_REQUIRED:
    'Configurez le nom du modèle Ollama dans les paramètres de l’environnement, ou choisissez la rédaction locale.',
  OLLAMA_MODEL_NOT_FOUND:
    'Le modèle Ollama configuré est absent du serveur. Installez-le ou choisissez la rédaction locale.',
  OLLAMA_UNREACHABLE:
    'Ollama est injoignable. Vérifiez le service local ou choisissez la rédaction locale.',
  clipboardError:
    'Le presse-papiers est indisponible. Sélectionnez le texte pour le copier.',
  downloadError:
    'Le téléchargement a échoué. Réessayez après avoir enregistré le contenu.',
};
const en: typeof fr = {
  eyebrow: 'CONTENT & DISCOVERY',
  title: 'Pinterest SEO',
  subtitle:
    'Prepare accurate copy, refine each variation and export your content.',
  project: 'Project',
  chooseProject: 'Choose a project',
  newProject: 'New product project',
  projectName: 'New project name',
  createProject: 'Create project',
  brief: 'The product brief',
  briefHint:
    'Provide verified information only. Websites and media are never analysed automatically.',
  productName: 'Product name',
  brand: 'Brand',
  category: 'Category',
  features: 'Factual features',
  featuresHint: 'One per line · up to 8. Details are reused as supplied.',
  audience: 'Audience',
  keywords: 'Keywords',
  keywordsHint: 'Separate with commas · up to 10, without repetition.',
  url: 'Product page URL',
  affiliateUrl: 'Affiliate URL (optional)',
  disclosure: 'Advertising disclosure',
  disclosureHint:
    'Required with an affiliate link. An explicit disclosure stays in every description.',
  contentLanguage: 'Content language',
  contentLanguageHint:
    'Independent of interface language. Translate the supplied features where needed.',
  french: 'French',
  english: 'English',
  both: 'French + English',
  mode: 'Writing assistance',
  local: 'Local assisted writing',
  ollama: 'Local Ollama model',
  localNotice:
    'Local assisted writing uses editorial templates, not an AI model. No external requests or generation charges.',
  ollamaNotice:
    'Ollama uses the model configured on your server. Review all suggested copy.',
  generate: 'Prepare and save',
  regenerating: 'Prepare new variations',
  working: 'Working…',
  results: 'Your content',
  noContent: 'Your product brief is ready to write.',
  noContentHint:
    'Choose a project, describe your product and prepare your first variations.',
  review:
    'Review facts and disclosures before publishing. Adapt the draft alt text to your final visual.',
  sourceLocal: 'Local writing · no AI model',
  sourceOllama: 'Written with Ollama',
  titleVariant: 'Title',
  descriptionVariant: 'Description',
  primaryKeyword: 'Primary keyword',
  secondaryKeywords: 'Secondary keywords',
  cta: 'Call to action',
  altText: 'Alt text',
  board: 'Pinterest board',
  save: 'Save changes',
  saved: 'Content saved.',
  dirty: 'Unsaved changes',
  copy: 'Copy',
  copied: 'Copied to clipboard.',
  copyAll: 'Copy all',
  exportJson: 'Full JSON',
  exportCsv: 'Pinterest CSV',
  archive: 'Project + media (.zip)',
  exportHint:
    'The CSV uses Pinterest columns and includes 3 proposals per language. Add a public media URL, choose your variation and check the data before importing. Nothing is published automatically. JSON also preserves alt text and the call to action.',
  archiveHint:
    'The ZIP preserves media and saved SEO content in the project parameters.',
  exportSaved: 'Save your changes before downloading the latest version.',
  seoError:
    'This operation could not be completed. Check your fields and try again.',
  required: 'Complete the product name and category.',
  SEO_INVALID_URL:
    'Use a public HTTP or HTTPS URL without credentials. Affiliate URLs must use HTTPS.',
  SEO_DISCLOSURE_REQUIRED:
    'Keep the advertising disclosure in both descriptions and the dedicated field.',
  SEO_INVALID_OUTPUT:
    'Each language needs 3 distinct titles and 2 distinct descriptions within the indicated limits.',
  SEO_INVALID_MODEL_OUTPUT:
    'The model returned an invalid format. Try again or choose local writing.',
  SEO_PROJECT_TOO_LARGE:
    'This project has too many parameters. Shorten the brief or use a new project.',
  OLLAMA_NOT_CONFIGURED:
    'Configure Ollama and its model in the environment settings, or choose local writing.',
  OLLAMA_MODEL_REQUIRED:
    'Set the Ollama model name in the environment settings, or choose local writing.',
  OLLAMA_MODEL_NOT_FOUND:
    'The configured Ollama model is missing from the server. Install it or choose local writing.',
  OLLAMA_UNREACHABLE:
    'Ollama is unreachable. Check the local service or choose local writing.',
  clipboardError: 'The clipboard is unavailable. Select the text to copy it.',
  downloadError: 'Download failed. Save your content and try again.',
};
export const seoMessages = { fr, en };
