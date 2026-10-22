# Sécurité et maintenance

Yassdem AI Studio utilise Node.js et Next.js. Aucun code PHP ni dépendance Composer n'est présent dans le dépôt. Une faille propre à PHP ne s'applique donc pas directement à cette application. Si vous choisissez ultérieurement un hébergement qui utilise aussi PHP ou WordPress, ces composants devront avoir leur propre maintenance et leur isolation.

## Surveillance des dépendances sur GitHub

Deux configurations sont fournies :

- `.github/dependabot.yml` demande des propositions hebdomadaires de mises à jour npm et des actions GitHub.
- `.github/workflows/security.yml` recherche les vulnérabilités npm connues chaque semaine, lors d'un envoi sur `main`, à chaque proposition de modification et sur déclenchement manuel depuis l'onglet **Actions** du dépôt.

Le workflow lit le fichier de verrouillage sans installer les dépendances ni exécuter leurs scripts. Il utilise des actions officielles épinglées à un commit, un jeton en lecture seule, aucun secret personnel et un délai limité. Une vulnérabilité de niveau faible ou supérieur, comme un échec de connexion au registre, produit un échec visible. Il ne répare ni n'applique de modification automatiquement.

GitHub doit autoriser Actions et Dependabot pour ce dépôt. Les politiques du compte, les notifications et la disponibilité des runners ou minutes peuvent influencer le fonctionnement. La présence des fichiers ne prouve pas qu'une vérification distante a été exécutée. Consultez l'onglet **Actions** et le résultat du workflow **Vérification des dépendances** pour constater son exécution. Les alertes de sécurité Dependabot, distinctes des propositions hebdomadaires, se règlent dans les paramètres de sécurité du dépôt.

Une proposition de mise à jour doit être examinée puis testée avec les commandes du [README](../README.md) avant d'être intégrée. Il n'y a pas de fusion ni d'installation automatique sur votre ordinateur. Une mise à jour publiée sur GitHub ne met pas à jour une copie Windows déjà installée : sauvegardez ses données avant d'y appliquer une version vérifiée. Les opérations sur la base et les médias sont décrites dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Votre installation Windows

Gardez Windows, Node.js 24 LTS et FFmpeg à jour, en utilisant leurs sources officielles. Activez les mises à jour Windows et conservez la protection de votre ordinateur active. Les mises à jour proposées dans ce dépôt concernent ses dépendances npm et ses actions GitHub ; elles ne mettent pas à jour ces logiciels système.

Lancez d'abord le studio en local et créez son mot de passe personnel. Les commandes prévues écoutent uniquement sur votre ordinateur. Pour un hébergement accessible par Internet, appliquez les conditions HTTPS, proxy et contrôle d'accès de [ARCHITECTURE.md](ARCHITECTURE.md) avant son ouverture.

Conservez aussi une sauvegarde des projets et médias sur un support distinct. Le dépôt GitHub sauvegarde le code et l'historique, tandis que la base, les fichiers personnels et les secrets restent sur la machine qui exécute le studio.

## Résultat et limites du contrôle

Le 22 octobre 2026, `npm audit --package-lock-only --ignore-scripts --audit-level=low` a terminé avec zéro vulnérabilité signalée. Les contrôles des dépendances de production et de l'ensemble des dépendances n'ont également signalé aucune vulnérabilité connue.

Ces résultats décrivent les avis connus du registre au moment du contrôle. Ils ne garantissent pas l'absence de défaut inconnu, ne constituent pas un audit complet du code ou de l'hébergement et ne couvrent pas les logiciels système. La maintenance et les sauvegardes restent nécessaires.
