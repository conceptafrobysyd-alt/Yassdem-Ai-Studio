export const quickCreateMessages = {
  fr: {
    eyebrow: 'CRÉATION EXPRESS',
    title: 'Une photo. À vous de choisir la suite.',
    description:
      'Importez votre produit, puis cliquez sur le résultat souhaité. Le studio s’occupe des réglages.',
    stepPhoto: 'Votre photo',
    stepResult: 'Votre création',
    importPhoto: 'Importer une photo',
    replacePhoto: 'Changer de photo',
    dropPhoto: 'Déposez votre photo ici, ou cliquez pour la choisir',
    fileHint: 'JPG, PNG ou WebP · 5 Mo maximum',
    importing: 'Votre photo arrive…',
    ready: 'Photo prête',
    library: 'Ou choisir une photo déjà importée',
    selectPhoto: 'Choisir une photo',
    videoTitle: 'Créer ma vidéo',
    videoDescription:
      'Votre photo s’anime avec un zoom doux. Vidéo verticale de 5 secondes, prête à télécharger.',
    videoTag: 'Gratuit · sans IA',
    photoTitle: 'Préparer ma photo',
    photoDescription:
      'Un cadrage portrait pour présenter votre produit, avec votre logo habituel si vous en avez choisi un.',
    photoTag: 'Gratuit · image PNG',
    modelTitle: 'Photo avec mannequin',
    modelDescription:
      'Pour un vêtement : une image éditoriale avec un mannequin, créée par votre moteur IA local.',
    modelTag: 'IA locale · configuration nécessaire',
    modelReadyTag: 'IA locale · moteur disponible',
    configureModel: 'Configurer le mannequin',
    checking: 'Vérification du moteur…',
    recheck: 'Vérifier la disponibilité',
    modelMissing:
      'Le moteur mannequin doit être installé et configuré avant ce premier essai.',
    modelUnavailable:
      'Le moteur mannequin est actuellement indisponible. Vérifiez son démarrage et sa configuration.',
    modelWorkflow:
      'Le moteur doit accepter une seule photo de vêtement, sans portrait obligatoire, pour ce parcours express.',
    modelNote:
      'Une image éditoriale ne garantit pas un essayage fidèle du vêtement.',
    pickFirst: 'Commencez par importer votre photo.',
    automatic:
      'Les vidéos et images mannequin créent leur projet automatiquement. Retrouvez les photos préparées dans la Bibliothèque.',
    working: 'Création en cours…',
    queued: 'Votre création attend son tour…',
    processing: 'Le studio prépare votre résultat…',
    preparingPhoto: 'Le studio prépare votre photo…',
    done: 'Votre création est prête',
    result: 'Votre résultat',
    downloadVideo: 'Télécharger ma vidéo',
    downloadPhoto: 'Télécharger ma photo',
    customize: 'Personnaliser',
    failed:
      'Cette création n’a pas abouti. Vous pouvez réessayer ou ouvrir le projet pour vérifier ses réglages.',
    cancelled: 'Cette création a été annulée. Vous pouvez la relancer.',
    unknown:
      'Le résultat de cette tâche doit être vérifié dans son projet avant de la relancer.',
    chooseOne: 'Choisissez une seule photo pour commencer.',
    invalidFile: 'Choisissez une photo JPG, PNG ou WebP de moins de 5 Mo.',
    invalidPhoto:
      'Cette photo ne peut pas être utilisée. Importez à nouveau un JPG, PNG ou WebP.',
    network:
      'La réponse n’est pas arrivée. Réessayez avec la même photo : une vidéo ou image mannequin déjà acceptée sera retrouvée.',
    photoNetwork:
      'La réponse n’est pas arrivée. Vérifiez la Bibliothèque avant de relancer l’export de la photo.',
    origin:
      'Ouvrez le studio avec l’adresse et le port indiqués dans PowerShell, puis réessayez.',
    auth: 'Votre session a expiré. Reconnectez-vous au studio.',
    busy: 'Un autre traitement est en cours. Patientez un instant, puis réessayez.',
    ffmpeg:
      'Le moteur vidéo est indisponible. Vérifiez que FFmpeg et FFprobe sont installés et reconnus dans PowerShell.',
    genericError:
      'La création n’a pas pu démarrer. Votre photo reste disponible ; réessayez ou ouvrez les réglages.',
    refreshFailed:
      'Création enregistrée. Si le résultat ne s’actualise pas, rechargez la page et retrouvez le projet dans la vue d’ensemble.',
    noResult:
      'La tâche est terminée, mais son fichier n’est plus disponible. Ouvrez le projet pour vérifier son résultat.',
  },
  en: {
    eyebrow: 'QUICK CREATE',
    title: 'One photo. Choose what comes next.',
    description:
      'Upload your product, then click the result you want. The studio takes care of the settings.',
    stepPhoto: 'Your photo',
    stepResult: 'Your creation',
    importPhoto: 'Upload a photo',
    replacePhoto: 'Change photo',
    dropPhoto: 'Drop your photo here, or click to choose one',
    fileHint: 'JPG, PNG or WebP · 5 MB maximum',
    importing: 'Uploading your photo…',
    ready: 'Photo ready',
    library: 'Or choose a photo you already uploaded',
    selectPhoto: 'Choose a photo',
    videoTitle: 'Create my video',
    videoDescription:
      'Bring your photo to life with a gentle zoom. A five-second vertical video, ready to download.',
    videoTag: 'Free · no AI',
    photoTitle: 'Prepare my photo',
    photoDescription:
      'A portrait crop to present your product, with your usual logo if you have selected one.',
    photoTag: 'Free · PNG image',
    modelTitle: 'Photo with a model',
    modelDescription:
      'For a garment: an editorial image with a model, created by your local AI engine.',
    modelTag: 'Local AI · setup required',
    modelReadyTag: 'Local AI · engine available',
    configureModel: 'Set up the model engine',
    checking: 'Checking the engine…',
    recheck: 'Check availability',
    modelMissing:
      'The model engine must be installed and configured before your first attempt.',
    modelUnavailable:
      'The model engine is currently unavailable. Check that it is running and configured.',
    modelWorkflow:
      'For quick creation, the engine must accept one garment photo without requiring a portrait.',
    modelNote:
      'An editorial image does not guarantee a faithful virtual fitting.',
    pickFirst: 'Start by uploading your photo.',
    automatic:
      'Videos and model images create their own project automatically. Find prepared photos in the Library.',
    working: 'Creating…',
    queued: 'Your creation is waiting its turn…',
    processing: 'The studio is preparing your result…',
    preparingPhoto: 'The studio is preparing your photo…',
    done: 'Your creation is ready',
    result: 'Your result',
    downloadVideo: 'Download my video',
    downloadPhoto: 'Download my photo',
    customize: 'Customise',
    failed:
      'This creation did not finish. Try again or open the project to check its settings.',
    cancelled: 'This creation was cancelled. You can start it again.',
    unknown: 'Check this task in its project before starting it again.',
    chooseOne: 'Choose just one photo to get started.',
    invalidFile: 'Choose a JPG, PNG or WebP photo smaller than 5 MB.',
    invalidPhoto: 'This photo cannot be used. Upload a JPG, PNG or WebP again.',
    network:
      'The response did not arrive. Try again with the same photo: an accepted video or model image will be retrieved.',
    photoNetwork:
      'The response did not arrive. Check the Library before exporting the photo again.',
    origin:
      'Open the studio at the address and port shown in PowerShell, then try again.',
    auth: 'Your session has expired. Sign in to the studio again.',
    busy: 'Another process is running. Wait a moment, then try again.',
    ffmpeg:
      'The video engine is unavailable. Check that FFmpeg and FFprobe are installed and recognised in PowerShell.',
    genericError:
      'Creation could not start. Your photo remains available; try again or open the settings.',
    refreshFailed:
      'Creation saved. If the result does not update, reload the page and find the project in the overview.',
    noResult:
      'The task has finished, but its file is no longer available. Open the project to check its result.',
  },
};
