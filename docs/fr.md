# Meteoblue

## Présentation

Cette intégration fait de l’**API Forecast de meteoblue** un fournisseur météo de Gladys. Une fois installée, la carte météo du tableau de bord et l’assistant conversationnel (« quel temps fera-t-il demain ? ») l’utilisent à la place du service OpenWeather intégré.

Elle fournit :

- la **météo de l’heure en cours** : température, ressenti, humidité, pression, vent, indice UV, jour ou nuit, lever et coucher du soleil ;
- les **prévisions** : 24 heures et les 7 jours de meteoblue, avec la **fiabilité** que meteoblue donne à chaque jour (à quel point ses modèles s’accordent) ;
- trois **déclencheurs de scène** : pluie attendue dans les 3 heures, gel attendu dans les 12 heures, crédits bientôt épuisés ;
- trois **actions de scène**, quatre **widgets de tableau de bord** et le **météogramme** meteoblue (facultatif).

meteoblue (Bâle, Suisse) combine de nombreux modèles météo et les corrige avec les stations, le radar et le satellite proches. Tout passe par les serveurs de meteoblue (cloud uniquement), avec **votre propre clé API** : l’essai gratuit de la Weather API donne 10 millions de crédits pour un an, pour un usage non commercial, et l’intégration les répartit elle-même sur l’année.

meteoblue ne publie pas d’alerte officielle dans cette API : le déclencheur d’alerte météo de Gladys reste muet avec ce fournisseur. Les déclencheurs pluie et gel de l’intégration sont des prévisions, pas des vigilances officielles.

> Cette intégration n’a pas encore été testée avec une vraie clé API : elle suit la référence de l’API meteoblue à la lettre. Signalez tout problème.

## Prérequis

- Gladys 5.3.0 ou plus récent.
- Une maison localisée (Paramètres → Maisons) : la prévision de chaque maison localisée est surveillée pour les déclencheurs de scène.
- Un compte meteoblue avec l’accès **Weather API** (l’essai gratuit suffit), pour un usage non commercial.

## Configuration

### 1. Un compte meteoblue et sa clé gratuite

1. Créez un compte gratuit sur [meteoblue.com](https://www.meteoblue.com/fr/user/login/index) et connectez-vous.
2. Cliquez sur l’icône du compte (en haut à droite) → **Account overview** → **Weather API** : l’essai gratuit démarre aussitôt, pour un an, avec 10 millions de crédits. Vous confirmez un usage non commercial.
3. Copiez la **clé API** affichée. Les clés qui exigent des requêtes signées (un secret partagé) ne sont pas gérées.

Les étapes sont celles de la [documentation meteoblue](https://docs.meteoblue.com/en/weather-apis/free-weather-api/overview). Des crédits peuvent être achetés plus tard (200 € les 200 millions au moment d’écrire, [tarifs](https://content.meteoblue.com/en/business-solutions/weather-apis/pricing)).

### 2. Crédits et mises à jour

meteoblue compte des **crédits**, pas des appels ([référence de l’API Forecast](https://my.meteoblue.com/packages/redoc)). Ce que l’intégration dépense :

| Appel                                                   | Crédits | Avec les 10 millions de crédits gratuits                   |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| Mise à jour des prévisions (horaire + 7 jours, 1 appel) | 8 000   | environ 3 par jour pour une maison, toutes les 7 h environ |
| Image du météogramme (facultative)                      | 16 000  | gardée 24 h = 5,8 millions par an, la moitié du budget     |
| « Tester la clé API »                                   | 8 000   | à la demande                                               |

L’intégration compte ce que chaque réponse a coûté (meteoblue l’indique dans un en-tête), garde le compte dans `/data`, et **répartit les crédits restants sur le reste de l’année de la clé** : l’intervalle de mise à jour est calculé, jamais plus court que le plancher « Mise à jour au plus toutes les ». Une réserve de 2 % reste pour le bouton de test. Chaque maison localisée se met à jour de son côté : deux maisons se mettent donc à jour deux fois moins souvent. Les prévisions sont gardées dans `/data` : un redémarrage de Gladys ne coûte rien. Une fois les crédits de l’année épuisés, plus aucun appel ne part avant l’année de clé suivante, et la dernière prévision est servie tant qu’elle couvre l’heure en cours (7 jours).

### 3. Dans Gladys

1. Intégrations → Meteoblue → Configuration.
2. Collez la **clé API**. Saisissez le **début de l’année de la clé** si vous le connaissez (le jour où vous avez activé la Weather API), sinon le premier jour d’utilisation est retenu.
3. Enregistrez, puis cliquez sur **Tester la clé API** : elle lit maintenant les prévisions de votre première maison (8 000 crédits) et affiche les crédits utilisés et l’intervalle de mise à jour qu’ils permettent.

| Champ                                | Défaut     | Rôle                                                           |
| ------------------------------------ | ---------- | -------------------------------------------------------------- |
| Clé API                              | —          | Votre clé meteoblue, stockée comme secret                      |
| Crédits par année de clé             | 10 000 000 | À augmenter après un achat de crédits ; jamais dépassé         |
| Début de l’année de la clé           | vide       | AAAA-MM-JJ ; vide = le premier jour d’utilisation de la clé    |
| Mise à jour au plus toutes les (min) | 60         | 30 à 1 440 : un plancher, les crédits décident le plus souvent |
| Afficher le météogramme              | non        | L’image du météogramme 5 jours, 16 000 crédits chacune         |
| Garder un météogramme (heures)       | 24         | 3 à 168 : une image n’est demandée que si quelqu’un la regarde |

## Utilisation

### Carte météo et assistant

Rien à faire : la carte météo du tableau de bord utilise ce fournisseur. Si plusieurs fournisseurs météo sont installés, épinglez-en un dans les réglages de la carte. Météogramme activé, la carte le propose comme image du fournisseur. meteoblue couvre le monde entier ; la prévision d’une maison est découpée en jours dans le fuseau horaire de Gladys.

### Widgets

![Illustration générée des quatre widgets — prévisions 7 jours, prochaines heures, météogramme, crédits — pas une capture d’écran](https://raw.githubusercontent.com/William-De71/gladys-meteoblue/main/docs/assets/widgets.fr.png)

- **Prévisions 7 jours** : 3, 5 ou 7 jours avec les pictogrammes meteoblue, max et min, ciel, risque de précipitations ; touchez un jour pour le cumul et les heures de précipitations, le vent, l’indice UV, la fiabilité et les heures du soleil. Un jour peu fiable et sans pluie reçoit un badge.
- **Prochaines heures** : une courbe des 12, 24 ou 48 prochaines heures : température et ressenti, précipitations, ou vent.
- **Météogramme** : le météogramme 5 jours de meteoblue (température, nuages, précipitations, vent), une fois activé dans la configuration.
- **Crédits meteoblue** : les crédits utilisés et restants cette année de clé, l’intervalle de mise à jour qu’ils permettent, les jours restants et le dernier appel.

Les widgets de prévision ont un réglage **Maison** (vide pour la première maison localisée), citent leur source et renvoient vers la page meteoblue du même lieu.

### Déclencheurs de scène

- **Pluie attendue bientôt** : la prévision annonce désormais des précipitations dans les 3 prochaines heures (au moins 0,2 mm en une heure, et un risque d’au moins 40 % quand meteoblue en donne un), après une vérification qui n’en annonçait pas. Filtres : maison, type (pluie, neige, pluie et neige). Variables : maison, type, heure de début, minutes avant le début, cumul sur 3 heures, risque, ciel.
- **Gel attendu** : la prévision annonce désormais 0 °C ou moins dans les 12 prochaines heures. Variables : maison, heure de début, heures avant le début, température la plus basse et son heure.
- **Crédits meteoblue bientôt épuisés** : 75, 90 ou 100 % des crédits de l’année de la clé sont utilisés, chaque palier une fois par année de clé. Variables : palier, crédits utilisés, par an, restants, prochaine année de clé.

La surveillance regarde la prévision en cache toutes les 10 minutes (sans dépenser de crédit). La première vérification après un démarrage sert de référence : une pluie déjà annoncée ne déclenche rien. La prévision est aussi fraîche que les crédits le permettent (7 heures au plus avec la clé gratuite, pour une maison).

### Actions de scène

- **Obtenir la prévision d’un jour** : d’aujourd’hui à 6 jours : max, min, ciel, cumul et risque de précipitations, fiabilité, vent max, résumé.
- **Obtenir la météo actuelle** : température, ressenti, humidité, vent, ciel et résumé de l’heure en cours.
- **Va-t-il pleuvoir ?** : dans les 3 à 24 heures : oui ou non, à partir de quand, pluie ou neige, cumul, risque max, résumé.

### Exemples de scènes

- Quand une **pluie est attendue bientôt** (maison « Maison », type « Pluie ») → envoyer « Rentrez le linge : `{{triggerEvent.data.kind}}` à partir de `{{triggerEvent.data.start_time}}` » sur votre téléphone.
- Quand le **gel est attendu** → fermer la vanne d’eau du jardin et envoyer `{{triggerEvent.data.min_temperature}}` °C à `{{triggerEvent.data.coldest_time}}`.
- Chaque soir à 20 h → **Va-t-il pleuvoir ?** (12 heures) → si aucune précipitation n’est attendue, lancer l’arrosage du jardin.

### Attribution et usage non commercial

La clé gratuite est réservée à un **usage non commercial** ([conditions meteoblue](https://content.meteoblue.com/en/about-us/legal/commercial-non-commercial-use)), qui demande un lien direct vers meteoblue pour le même lieu : chaque widget de prévision cite meteoblue et porte ce lien, et le météogramme garde le logo meteoblue. Les pictogrammes météo sont ceux de meteoblue, offerts en libre usage avec un lien vers leur [page des pictogrammes](https://docs.meteoblue.com/en/meteo/variables/pictograms) ; ils sont récupérés chez meteoblue par l’intégration, jamais par votre navigateur. Données météo © meteoblue AG.

## Dépannage

- **« meteoblue a refusé la clé API (invalid) »** : la clé est fausse ; recopiez-la depuis Account overview → Weather API.
- **« (missing) »** : aucune clé enregistrée dans la configuration.
- **« l’accès de cette clé a expiré »** : l’année gratuite est terminée ; renouvelez-la ou achetez des crédits sur meteoblue.com.
- **« exige des requêtes signées »** : la clé est protégée par un secret partagé, non géré ; utilisez une clé sans signature.
- **« refusé la requête faute de crédits ou par limite de débit »** : le compte de meteoblue est épuisé, ou une limite quotidienne est réglée sur la clé dans votre compte ; la prévision en cache est servie en attendant.
- **« Crédits de l’année de la clé épuisés »** : le plafond de l’intégration est atteint ; augmentez « Crédits par année de clé » après un achat, ou attendez l’année de clé suivante. La page du compte meteoblue fait foi (elle compte aussi les autres usages de la clé).
- **La prévision paraît ancienne** : les crédits gratuits permettent une mise à jour toutes les 7 heures environ pour une maison ; le widget « Crédits meteoblue » affiche l’intervalle.
- **Pas de météo pour une maison** : elle n’est pas localisée dans Gladys.
- Journaux : Paramètres → Supervision → Meteoblue. La clé n’y apparaît jamais.
