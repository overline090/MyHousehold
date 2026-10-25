# Interface web du serveur

> **État** : l'**assistant d'installation** est écrit et servi par le serveur, et son
> parcours complet est joué dans un vrai navigateur contre un vrai serveur. Le reste
> — administration, foyer au quotidien — reste à écrire.

Le serveur expose une interface web, en plus de son API. Elle n'est pas une
deuxième application : c'est le même foyer, vu depuis un navigateur.

## Ce qu'elle sert

| Domaine | Contenu | Pourquoi au navigateur plutôt qu'à l'app |
|---|---|---|
| **Installation** ✅ | L'assistant pas à pas ([setup-wizard.md](setup-wizard.md)) | Il faut bien une interface avant d'avoir un compte et un téléphone appairé |
| **Administration** | Comptes, **statuts et droits**, santé du serveur, balayages, sauvegardes, mises à jour, journaux | Se fait assis, rarement, et demande de lire des choses longues |
| **Le foyer au quotidien** | Accueil, tâches, tâches de fond, agenda | Un écran dans la cuisine, un ordinateur portable sur la table, un membre sans téléphone Android |
| **Saisie confortable** | Créer une tâche récurrente compliquée, relire l'historique | Un vrai clavier et un grand écran valent mieux qu'un pouce sur un formulaire de récurrence |

La **configuration des statuts et de leurs droits**, comme la configuration générale
du foyer, ne se fait **que** là : un réglage qui engage la sécurité du foyer se fait
assis, sur un vrai écran, pas au pouce entre deux portes. L'app Android affiche les
statuts, elle ne les modifie pas.

Les maquettes de cette partie authentifiée sont dans
[`mockups/`](mockups/README.md), à valider avant la première ligne d'interface.

Ce qu'elle ne fait **pas** : notifications push, mode hors-ligne, scan de QR code.
Ce sont des choses de téléphone, et prétendre les faire au navigateur donnerait une
version dégradée de l'app.

## Choix techniques

| Choix | Pourquoi | Écarté |
|---|---|---|
| **Application à page unique**, construite en statique et servie par Nest | Un Raspberry Pi sert des fichiers statiques sans effort ; le rendu serveur lui coûterait du processeur à chaque page. Et l'API REST existe déjà, elle n'a rien à dupliquer | Rendu côté serveur (Nuxt, Next) : une dépendance de plus et du calcul sur une machine lente |
| **Svelte + Vite + TypeScript** | Le poids transféré compte : la première visite se fait souvent par Wi-Fi domestique depuis un téléphone pendant l'installation. Svelte n'embarque pas de moteur de rendu dans le paquet. Mesuré sur l'assistant : **19 ko compressés**, tout compris | React : plus de contributeurs potentiels, mais deux à trois fois le poids pour ce que fait cette interface |
| **Authentification par cookie `httpOnly`** | Un jeton dans `localStorage` est lisible par n'importe quelle faille d'injection de script. Le navigateur n'a pas besoin de voir le jeton | Réutiliser le `Bearer` du mobile : simple, mais met le jeton à portée du JavaScript de la page |
| **Pas de dépendance externe au chargement** | Le foyer doit s'ouvrir même sans accès à Internet — un serveur domestique derrière une box coupée reste utilisable sur le réseau local | Polices et scripts depuis un CDN |

Le mobile garde le `Bearer` : il stocke son jeton dans le trousseau du système, pas
dans un navigateur, et n'a pas de problème d'injection de script.

Conséquence côté API : une session navigateur est créée par `POST /api/v1/auth/login`
avec `?client=web`, qui pose le jeton de rafraîchissement dans un cookie
`httpOnly; Secure; SameSite=Strict` au lieu de le renvoyer dans le corps. Le jeton
d'accès, lui, reste en mémoire de la page. Même modèle de rotation, même détection de
rejeu.

## Accessibilité et confort

Les mêmes exigences que l'app : cibles de 44 px minimum, jamais la couleur seule pour
porter une information, lisible à 200 % de zoom, thème clair et sombre suivant le
système. Et une contrainte propre au navigateur : l'interface doit être utilisable
**au clavier seul**, parce qu'un écran de cuisine est parfois piloté par une
télécommande ou un clavier sans souris.

## Où ça vit

```
web/              l'interface (Vite + Svelte)
web-dist/         le résultat construit, servi en statique par Nest
```

`npm run build:web` construit l'interface, `npm run build:all` construit les deux.
Le serveur démarre très bien **sans** `web-dist/` : il ne sert alors que l'API, ce
qui est le cas en développement, où `npm run dev:web` sert l'interface à côté avec
rechargement à chaud.

Un détail de routage mérite d'être connu : `/setup` est la **page**, `/setup/...`
sont les **routes de l'API**. Le routeur répondrait 404 sur la page sans un point
d'entrée explicite, puisque le préfixe lui appartient déjà.

## Ce qui reste à trancher

1. **Un écran de cuisine en affichage permanent** mérite-t-il un mode dédié (gros
   caractères, pas d'interaction, rafraîchissement automatique) ? Probablement oui, et
   c'est peu de travail une fois la vue « Aujourd'hui » faite.
2. **Les maquettes** : à valider avant d'écrire la première ligne d'interface.
