# Dossier stratégie

Le dashboard lit automatiquement le fichier `.html` le plus récemment modifié dans ce dossier.

Pour mettre la stratégie à jour :

1. Exporter ou déposer la nouvelle stratégie en HTML dans ce dossier.
2. Garder les cartes de posts avec la structure existante : `article.post-card`, blocs `text`, `reply`, `prompt`, `image-prompt`.
3. Recharger `/dashboard` ou attendre le rafraîchissement automatique.

Les fichiers de ce dossier ne sont pas servis directement : ils sont lus par `/dashboard/api.php`, après connexion.
