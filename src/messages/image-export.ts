const fr = {
  title: 'Export d’image',
  description: 'Préparez une image PNG, JPEG ou WebP, avec un logo facultatif.',
  source: 'Image source',
  chooseSource: 'Choisir une image',
  noImages: 'Importez une image dans la bibliothèque pour commencer.',
  project: 'Projet de destination',
  sourceProject: 'Projet de la source ou bibliothèque',
  projectHint:
    'Le projet conserve l’export, la source, le logo et les paramètres dans son archive ZIP.',
  format: 'Fichier',
  ratio: 'Cadrage',
  original: 'Proportions originales',
  resolution: 'Résolution',
  native: 'Dimensions natives',
  fourK: '4K · côté long de 3 840 px',
  quality: 'Qualité / compression',
  logo: 'Logo',
  noLogo: 'Sans logo personnel',
  logoSize: 'Largeur du logo (%)',
  opacity: 'Opacité du logo',
  position: 'Position',
  topLeft: 'En haut à gauche',
  topRight: 'En haut à droite',
  bottomLeft: 'En bas à gauche',
  bottomRight: 'En bas à droite',
  center: 'Au centre',
  sourceDimensions: 'Source native',
  outputDimensions: 'Export prévu',
  unknownDimensions: 'Dimensions vérifiées lors de l’export',
  upscaled:
    'Agrandissement classique Sharp, sans upscaling IA. Un agrandissement 4K ne devient pas une génération native 4K.',
  preserved:
    'Sans agrandissement. Le cadrage peut recouper les bords de la source.',
  transparent:
    'PNG et WebP conservent la transparence ; JPEG utilise un fond blanc.',
  local:
    'Traitement local · coût d’API : 0 € · généralement quelques secondes ; la durée dépend de l’image et de la machine.',
  export: 'Créer l’image',
  exporting: 'Export en cours…',
  saved: 'Image enregistrée dans la bibliothèque.',
  download: 'Télécharger',
  result: 'Image exportée',
  error:
    'Impossible d’exporter cette image. Vérifiez les fichiers et réessayez.',
  busy: 'Un export d’image est déjà en cours. Réessayez dans quelques instants.',
  tooLarge:
    'La source doit être une image raster de 20 Mo et 40 mégapixels maximum ; le logo est limité à 5 Mo.',
  projectTooLarge:
    'Ce projet contient trop de paramètres ou d’exports d’images. Choisissez un autre projet.',
  refreshFailed:
    'Image enregistrée. Actualisez la bibliothèque pour afficher tous les médias.',
};
const en: typeof fr = {
  title: 'Image export',
  description: 'Prepare a PNG, JPEG or WebP image, with an optional logo.',
  source: 'Source image',
  chooseSource: 'Choose an image',
  noImages: 'Upload an image to the library to get started.',
  project: 'Destination project',
  sourceProject: 'Source project or library',
  projectHint:
    'The project archive includes the export, source, logo and export settings.',
  format: 'File',
  ratio: 'Crop',
  original: 'Original proportions',
  resolution: 'Resolution',
  native: 'Native dimensions',
  fourK: '4K · 3,840 px long edge',
  quality: 'Quality / compression',
  logo: 'Logo',
  noLogo: 'Without a personal logo',
  logoSize: 'Logo width (%)',
  opacity: 'Logo opacity',
  position: 'Position',
  topLeft: 'Top left',
  topRight: 'Top right',
  bottomLeft: 'Bottom left',
  bottomRight: 'Bottom right',
  center: 'Centre',
  sourceDimensions: 'Native source',
  outputDimensions: 'Planned export',
  unknownDimensions: 'Dimensions are checked during export',
  upscaled:
    'Standard Sharp enlargement, without AI upscaling. Enlarging an image to 4K does not make it native 4K generation.',
  preserved: 'Without enlargement. Cropping can remove the source edges.',
  transparent:
    'PNG and WebP preserve transparency; JPEG uses a white background.',
  local:
    'Local processing · API cost: €0 · usually a few seconds; duration depends on the image and machine.',
  export: 'Create image',
  exporting: 'Exporting…',
  saved: 'Image saved to the library.',
  download: 'Download',
  result: 'Exported image',
  error: 'Could not export this image. Check the files and try again.',
  busy: 'Another image export is running. Try again in a moment.',
  tooLarge:
    'The source must be a raster image up to 20 MB and 40 megapixels; logos are limited to 5 MB.',
  projectTooLarge:
    'This project has too many settings or image exports. Choose another project.',
  refreshFailed: 'Image saved. Refresh the library to display all media.',
};
export const imageExportMessages = { fr, en };
