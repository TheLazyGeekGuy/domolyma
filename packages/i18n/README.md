# Traductions de l’application

`fr.json` et `en.json` contiennent les textes de l’interface. La langue par défaut est le français ; le sélecteur FR/EN mémorise le choix dans le navigateur (`domolyma-language`). Il actualise aussi `html.lang`, les formats d’affichage et le titre de la page.

Pour ajouter un texte, créer la même clé dans les deux fichiers, de préférence avec un nom sémantique (`vault.portable_summary`, par exemple), puis appeler `msg("clé", {paramètre: valeur})` dans le composant. Conserver les clés existantes et les mêmes paramètres `{nom}` dans les deux langues. Les tests vérifient leur parité et interdisent les traductions vides. Aucune dépendance de traduction supplémentaire n’est nécessaire.

Les métadonnées calculées à partir de `msg` doivent être construites pendant le rendu, pas une fois au chargement du module. `useLocale()` abonne les racines React ; le changement de langue ne remonte pas les formulaires. Les panneaux héritent du nouveau rendu.

`labelText` traduit les métadonnées connues (rôles, catégories, états) et les erreurs. Ne jamais l’appliquer aux noms, titres, notes, descriptions ou autres textes saisis par l’utilisateur. Les options affichent un libellé traduit tout en conservant explicitement leur `value` métier d’origine. Les noms de responsables par défaut sont distingués des vrais noms via `assigneeFallback` dans la liste de suivi.

`sourceText` fournit le libellé français stable aux contrats et au serveur. Les valeurs persistées, codes d’API, clés de stockage, montants en centimes et règles de droits restent indépendants de la langue. Le transport web traduit les réponses d’erreur JSON ; une réponse métier réussie est retournée intacte. Les dates et nombres utilisent `fr-FR` ou `en-GB` ; la devise reste EUR et les règles métier de date ne changent pas.

Les textes des documents importés, transcriptions et données personnelles ne sont pas traduits. Les quatre pages du site de présentation constituent un périmètre distinct et restent en français.

Vérification : `npm test`, `npm run check`, `npm run build`. La recette navigateur et ses limites sont décrites dans `docs/implementation/application-fr-en.md`.
