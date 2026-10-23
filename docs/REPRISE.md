# Point de reprise

Dernière mise à jour : 23 octobre 2026.

## Consigne de continuité

L'utilisateur souhaite reprendre le travail dès que le service le permet, conserver chaque étape validée dans Git et poursuivre les fonctions restantes. Une interruption ne remet pas en cause les actions déjà autorisées. À chaque reprise, consulter ce fichier, `AGENTS.md`, `git status --short` et `git log` avant de modifier le projet.

Cette consigne s'applique lorsqu'une session de travail reprend. Elle ne programme pas de nouvelle session et ne garantit ni une exécution en arrière-plan ni un redémarrage automatique après une limite du service.

## État conservé

- Les phases 1 à 5 et quatre compléments sont enregistrés dans Git. `3eb9d66` correspond au catalogue des modèles et fournisseurs vidéo compatibles. Le correctif fonctionnel du 23 octobre porte sur les adresses locales de première connexion ; `git log` donne les derniers commits. Les tags `phase-*` et `complement-*` repèrent les étapes de livraison initiales.
- La dernière validation fonctionnelle compte 245 tests réussis, TypeScript et le build. Le parcours HTTP produit a repassé dix contrôles sans `APP_ORIGIN` explicite ; les résultats Fashion et montage/Pinterest datent des étapes précédentes. Chromium a aussi validé la création du compte via l'IP locale et la connexion via localhost. Les preuves et limites sont dans [VALIDATION.md](VALIDATION.md) ; ne pas présenter ces résultats historiques comme une nouvelle exécution après une réinitialisation.
- Aucun appel IA payant n'a été validé. Le budget par défaut est nul. Les modes ComfyUI et Ollama nécessitent encore leurs services et modèles ; les essais réels Runway et Replicate nécessitent une configuration et une confirmation de dépense.
- L'import produit est implémenté et testé avec transport simulé ; l'accès à une boutique réelle reste à valider dans un environnement réseau compatible.
- Après la réponse « accès GitHub vérifié » du 22 octobre 2026, l'envoi de `main` et des huit tags a réussi. Les références distantes ont été comparées aux références locales. Le refus HTTP 403 est résolu pour cet envoi ; conserver les prochains commits avec des pushes normaux, sans modifier l'authentification gérée par la plateforme.

## Priorité en cours : installation Windows

Le code et l'historique sont sauvegardés sur GitHub. L'utilisateur a récupéré et extrait le ZIP sur Windows. Node.js 24.22.1 et npm 11.19.1 sont reconnus ; FFprobe 9.0.2 a aussi été confirmé après installation de FFmpeg. Le dossier du projet a été retrouvé dans le sous-dossier homonyme issu de l'extraction. Le serveur web et le worker ont démarré sur sa machine.

La création du mot de passe sur l'adresse IP locale a ensuite échoué avec HTTP 403 et le message générique « Vérifiez les champs renseignés ». Le défaut a été reproduit : NextRequest normalise l'IP locale en `localhost` tout en conservant les en-têtes Origin/Host du navigateur. Le contournement communiqué est d'utiliser `localhost` avec le même port dans le navigateur Windows. Le succès de la création du mot de passe et le premier parcours sur son ordinateur restent à confirmer. Le correctif durable, ses limites et les données à préserver sont décrits dans [INSTALLATION_WINDOWS.md](INSTALLATION_WINDOWS.md).

Deux archives du code sont présentes hors du dépôt :

- `/workspace/yassdem-ai-studio.bundle` : historique Git, branche `main` et tags ; restauration déjà vérifiée dans une copie isolée.
- `/workspace/yassdem-ai-studio-source.zip` : sources du commit archivé, sans historique Git.

Elles excluent les secrets, la base, les médias personnels et les dépendances. Leur présence dans le cloud ne prouve pas que l'utilisateur les a téléchargées. Ne pas inventer de lien public ni de bouton de téléchargement de l'interface. Après une modification du dépôt, régénérer les archives depuis le commit validé et vérifier leur contenu.

Pour les projets et médias, le parcours existant est **Paramètres → Sauvegarde → nom du projet**. Il produit un ZIP individuel ; il ne sauvegarde pas le code ni l'instance entière. Les procédures distinctes sont dans [GIT_SYNCHRONISATION.md](GIT_SYNCHRONISATION.md) et [ARCHITECTURE.md](ARCHITECTURE.md).

## Maintenance de sécurité ajoutée

L'utilisateur souhaite prévenir les futurs problèmes de sécurité et ne dispose pas d'une alerte PHP précise. Aucun PHP n'est utilisé par le projet. Les audits npm de production et complets du 22 octobre 2026 n'ont signalé aucune vulnérabilité connue. La commande prévue pour GitHub, `npm audit --package-lock-only --ignore-scripts --audit-level=low`, a aussi réussi localement.

La configuration Dependabot hebdomadaire et le workflow GitHub de contrôle des dépendances sont ajoutés au dépôt ; voir [SECURITE.md](SECURITE.md). Ils ne fusionnent aucune mise à jour et ne mettent pas à jour automatiquement l'installation Windows. L'exécution distante du workflow et les paramètres d'alertes du compte ne sont pas encore vérifiés. Ne pas promettre une sécurité absolue ni prétendre que l'hébergement est audité.

## Reprendre sans perdre de données

Vérifier les fichiers et services présents avant toute installation ou relance. Conserver `.env`, la base et `storage/`. Ne pas lancer de second worker sur le même stockage. Ne pas supposer que les processus précédents ont survécu à l'interruption. Les réglages cloud préparés doivent encore être enregistrés ou publiés depuis l'interface de configuration ; leur présence en brouillon n'est pas une validation d'une nouvelle tâche.
