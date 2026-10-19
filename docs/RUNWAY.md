# Configuration Runway et dépenses

## État de l'intégration

L'adaptateur serveur utilise `https://api.dev.runwayml.com/v1`, l'en-tête `X-Runway-Version: 2024-11-06` et le modèle `gen4_turbo`. Il gère la création d'une tâche image-vers-vidéo et la consultation de son état.

Le contrat de requête a été comparé au code du SDK officiel Runway 4.22.0 téléchargé depuis le registre npm. Les pages officielles de documentation Runway n'ont pas pu être consultées depuis cet environnement : le proxy a renvoyé HTTP 403. Les tarifs courants n'ont donc pas été vérifiés en ligne ; comparez l'hypothèse ci-dessous aux [documents Runway](https://docs.dev.runwayml.com/) et à votre compte avant utilisation payante. Un test sur un adaptateur simulé ne prouve pas qu'une génération réelle fonctionne avec votre compte.

## Activation volontaire

1. Créez une clé API dans votre compte Runway.
2. Renseignez `RUNWAY_API_KEY` dans le fichier `.env` du serveur, jamais dans le navigateur.
3. Redémarrez le serveur et le worker pour charger la variable.
4. Dans les paramètres du studio, vérifiez la connexion, activez le fournisseur et fixez un budget mensuel supérieur à zéro.
5. Relisez l'estimation de la génération puis confirmez explicitement la dépense.

Le test de connexion interroge les informations d'organisation ; il ne crée pas de vidéo. Une clé présente n'active pas les dépenses à elle seule. Un budget nul, un fournisseur désactivé, une confirmation absente ou un solde de budget insuffisant empêchent la mise en file d'une génération payante.

Utilisez uniquement le panneau de configuration de l'environnement pour les secrets d'un hébergement cloud. Ne communiquez aucune clé dans un message, un fichier de sauvegarde ou un ticket de support.

## Estimation

L'hypothèse tarifaire intégrée est de **5 crédits par seconde**, à **0,01 USD par crédit** :

| Durée | Crédits estimés | Estimation en USD | Estimation en EUR avec un taux à 1 |
| --- | ---: | ---: | ---: |
| 5 secondes | 25 | 0,25 $ | 0,25 € |
| 10 secondes | 50 | 0,50 $ | 0,50 € |

Le paramètre USD/EUR est un taux saisi manuellement, fixé à 1 par défaut. Ce n'est pas un cours de change obtenu en temps réel. L'application arrondit le montant à réserver au centime supérieur ; les taxes, promotions et changements de tarif du fournisseur ne sont pas récupérés automatiquement.

Le mois budgétaire est calculé en UTC. Il peut donc changer à une heure locale différente de minuit selon votre fuseau horaire.

Le budget compte les montants déjà consommés et les réservations en cours afin d'éviter de dépasser le plafond en soumettant plusieurs tâches à la fois. La réservation est transactionnelle et la confirmation doit correspondre au montant estimé actuel. Quand une tâche terminale expose un champ `cost.credits`, le studio peut rapprocher ce montant avec le taux USD/EUR fixé lors de la réservation. En l'absence de ce champ, l'estimation reste réservée et aucun coût réel n'est inventé. Le compte Runway reste la référence pour les factures et les taxes.

## Reprise des tâches

La file est persistée dans SQLite. Le worker enregistre qu'un envoi au fournisseur a commencé avant de soumettre la demande payante. Si le processus s'arrête dans cet intervalle sans avoir enregistré l'identifiant Runway, la tâche devient `UNKNOWN` et sa réservation est conservée. Elle n'est pas soumise une deuxième fois automatiquement. Consultez le compte du fournisseur pour connaître son sort avant une nouvelle demande.

Une tâche disposant de son identifiant fournisseur peut reprendre la consultation de son état, au plus toutes les cinq secondes. Le téléchargement et le réexport locaux peuvent être repris sans recréer de génération payante. Relancer l'application ne supprime pas l'historique des tâches.

L'annulation d'une tâche déjà soumise ne garantit pas un remboursement. Sa réservation reste conservée si le montant facturé n'est pas connu. L'annulation est temporairement refusée pendant l'envoi tant que l'identifiant externe n'est pas disponible.

## Durées et résolutions

L'adaptateur accepte une image PNG/JPEG/WebP d'au plus 5 Mio et propose des clips de 5 ou 10 secondes, avec les dimensions natives suivantes :

| Ratio fournisseur | Dimensions natives attendues |
| --- | --- |
| Horizontal | 1280 × 720 |
| Vertical | 720 × 1280 |
| Carré | 960 × 960 |

Le format final 4:5 part d'une génération verticale 720 × 1280 puis est obtenu lors de l'export par redimensionnement et recadrage. Un export 2160p ne transforme pas ces dimensions en génération native 4K. FFmpeg agrandit les pixels avec un redimensionnement classique ; aucun upscaling IA n'est intégré.

L'export local n'ajoute pas de frais d'API, mais mobilise la machine et son stockage. L'estimation de taille reste indicative : le mouvement, le codec et la qualité influencent le fichier final.

## Réseau et confidentialité

Le mode local et l'export ne nécessitent pas de connexion à Runway. Lors d'une génération Runway, l'image et le prompt sont transmis au fournisseur. Vérifiez les droits d'utilisation de vos médias et les conditions du compte avant cette transmission.

L'intégration contacte `api.dev.runwayml.com` et accepte les fichiers résultat HTTPS provenant d'hôtes Runway autorisés ou du CDN `dnznrvs05pmza.cloudfront.net`. Les redirections et les URL arbitraires sont refusées. Si Runway change de domaine de distribution, l'adaptateur devra être mis à jour après vérification ; n'élargissez pas l'accès à tous les domaines.

Le budget du studio est un garde-fou local. Gardez également des limites de dépenses au niveau du compte Runway. Une requête dont l'envoi a commencé peut avoir été acceptée même en cas de coupure réseau ; consultez l'historique avant de lancer une nouvelle génération manuellement.
