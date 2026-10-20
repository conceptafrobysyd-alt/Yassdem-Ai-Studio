# Licences des composants

Les versions et licences ci-dessous ont été relevées dans les métadonnées des paquets installés pour cette version du projet. `package-lock.json` conserve les versions exactes. Les textes de licence fournis avec chaque dépendance restent les références ; ce relevé ne remplace pas l'inventaire de toutes les dépendances transitives en cas de redistribution.

| Composant                        | Version constatée | Licence déclarée |
| -------------------------------- | ----------------- | ---------------- |
| Next.js                          | 16.4.2            | MIT              |
| React / React DOM                | 19.3.1            | MIT              |
| Tailwind CSS                     | 4.3.3             | MIT              |
| next-intl                        | 4.14.9            | MIT              |
| Lucide React                     | 0.468.0           | ISC              |
| Prisma / client Prisma           | 6.19.0            | Apache-2.0       |
| Adaptateur Prisma better-sqlite3 | 6.19.0            | Apache-2.0       |
| better-sqlite3                   | 12.11.1           | MIT              |
| Sharp                            | 0.35.5            | Apache-2.0       |
| Saxes                            | 6.0.0             | ISC              |
| TypeScript                       | 5.9.3             | Apache-2.0       |
| Archiver                         | 7.0.1             | MIT              |
| Concurrently                     | 9.2.5             | MIT              |
| clsx                             | 2.1.1             | MIT              |
| tailwind-merge                   | 3.7.0             | MIT              |
| Zod                              | 4.6.7             | MIT              |
| tsx                              | 4.23.15           | MIT              |
| Vitest                           | 5.0.5             | MIT              |

La distribution FFmpeg utilisée dans l'environnement de validation est **7.1.5-0+deb13u1**, compilée avec `--enable-gpl`, `libx264` et `libx265`. `ffmpeg -L` indique pour cette compilation **GPL version 2 ou ultérieure**. FFmpeg peut avoir des conditions différentes selon ses options de compilation : consultez `ffmpeg -version`, `ffmpeg -L` et les licences des bibliothèques liées de votre propre installation avant redistribution. Les conditions des codecs et les éventuels brevets dépendent également du contexte de diffusion.

L'application appelle FFmpeg comme exécutable système ; elle n'en distribue pas un binaire. Remotion n'est pas utilisé. Les composants shadcn/ui ne sont pas installés ; les composants d'interface sont propres au projet avec Tailwind et Lucide.

Runway et Replicate sont des services externes. Leur accès, les modèles utilisés, les médias générés et la facturation relèvent des conditions applicables du fournisseur et du modèle, indépendamment des licences des dépendances de l’application. Les modèles installés séparément dans ComfyUI ou Ollama ont également leurs propres licences. Aucun abonnement fournisseur ni modèle IA n’est nécessaire pour les parcours locaux FFmpeg, Sharp et de rédaction par modèles de texte.

Aucune licence du code spécifique à Yassdem AI Studio n'est présumée à partir de celles de ses dépendances. Le propriétaire du projet peut choisir sa licence de distribution séparément.
