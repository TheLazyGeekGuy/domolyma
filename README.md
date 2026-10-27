# Domolyma

Le dossier de vie de vos biens : copropriété, documents versionnés, incidents, équipements, interventions, préparation des assemblées, décisions et suivi indicatif du budget. L’application propose une interface française et anglaise.

- [Présentation française](https://thelazygeekguy.github.io/domolyma/)
- [English presentation](https://thelazygeekguy.github.io/domolyma/en/)
- [Démonstration avec données fictives](https://thelazygeekguy.github.io/domolyma/demo/)
- [Construction, stockage et limites de la démo](docs/github-pages.md)

## Construire

```sh
npm ci
npm test
npm run pages:build
```

Publier uniquement `dist/pages/`. La présentation est à la racine de ce dossier et l’application dans `demo/`. Le workflow GitHub Actions configure cette publication sur la branche `main`.

La démo réutilise l’application et ses règles métier, avec une base fictive SQLite dans le navigateur. Les essais restent locaux au navigateur et peuvent être réinitialisés ; aucun serveur de production n’est contacté. Un navigateur récent, HTTPS et le stockage local autorisé sont nécessaires. Ne pas y déposer de données personnelles.

Les budgets et simulations sont indicatifs. La comptabilité complète, les appels de fonds définitifs et les procès-verbaux juridiquement exécutoires ne sont pas fournis par cette alpha.

Ce dépôt est une copie de publication contrôlée, sans données immobilières réelles ni historique privé. Les crédits des ressources sont conservés. La licence du projet reste à définir.
