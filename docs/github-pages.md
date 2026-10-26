# Présentation et démonstration sur GitHub Pages

`npm ci`, puis `npm run pages:build` produit uniquement `dist/pages/` : présentation à la racine, application de démonstration dans `demo/`. Le préfixe par défaut est `/domolyma/` ; `PAGES_BASE=/` permet une racine de domaine personnalisée. Les liens du site restent relatifs.

La démonstration réutilise les composants React et les gestionnaires de l’API existante. Un Service Worker limité au répertoire `demo/` exécute ces gestionnaires dans le navigateur, avec SQLite WASM (`sql.js`) et un adaptateur des opérations D1/R2 utilisées. Les appels internes sont construits sur une origine de boucle locale ; la garde de l’API normale, réservée aux installations locales, n’est pas ouverte aux hôtes publics.

Les seules données initiales viennent des migrations et des fichiers fictifs `fixtures/demo.sql`, `residents.sql`, `pages.sql`, ainsi que des deux documents pédagogiques de `public/fixtures/`. Il n’y a aucune copie d’une base réelle. Les essais et documents déposés dans la démo restent dans IndexedDB, dans ce navigateur et sur cette origine. Le bouton de réinitialisation restaure les exemples et efface les essais de cette démo. Ne pas y saisir de données personnelles ; les rôles sont une simulation pédagogique sur des données publiques, pas une authentification sécurisée.

La démo nécessite HTTPS (ou localhost), WebAssembly, Service Workers et IndexedDB. Elle n’utilise aucun backend distant, ne partage pas les modifications entre visiteurs et ne fournit pas les garanties d’un serveur de production. La suppression du stockage du navigateur efface les essais. Une évolution incompatible du schéma de démo peut également nécessiter une remise à zéro.

Le workflow `.github/workflows/pages.yml` construit, vérifie et publie seulement `dist/pages/`. Il utilise l’environnement GitHub `github-pages`, les permissions Pages et un jeton OIDC temporaire ; aucun secret de production ni ressource Cloudflare n’est nécessaire.

Activer Pages avec une publication par GitHub Actions, puis définir la variable de dépôt `PAGES_ENABLED=true` et lancer le workflow. Tant que cette variable n’est pas définie, les tests et l’artefact sont construits mais le déploiement est ignoré. Ce réglage évite de tenter une publication avant de confirmer l’éligibilité du dépôt.

## Limite de publication

La copie GitHub est préparée par `scripts/export-public.py`, à partir de dossiers et fichiers autorisés. Les dossiers internes, transcriptions, sauvegardes, imports privés, configurations secrètes et historique privé ne sont pas copiés. Le premier commit de publication possède un historique neuf et une adresse d’auteur GitHub `noreply`.

Avant l’envoi : contrôle des fichiers sources, recherche de marqueurs privés, vérification des fichiers générés et analyse de secrets avec Gitleaks. Les seules exceptions Gitleaks correspondent à trois identifiants de traduction qui suivent des phrases d’aide anglaises, pris à tort pour des clés API ; les exceptions portent seulement sur ces identifiants exacts dans le catalogue anglais. Un contrôle automatisé ne remplace pas la vérification du périmètre : aucun import de données réelles ne doit être ajouté à la construction.

Les métadonnées et noms du jeu fictif sont explicitement des exemples. Les crédits de photographie, polices et bibliothèques sont conservés. La licence du projet reste à définir.

GitHub Pages est disponible gratuitement sur les dépôts publics. Un dépôt privé nécessite une offre GitHub compatible. Le changement de visibilité d’un dépôt reste une décision distincte de la préparation du code et de l’artefact statique. Sources : [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [workflow Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [sql.js](https://sql.js.org/documentation/).
