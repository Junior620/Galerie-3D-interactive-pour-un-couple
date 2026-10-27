# Crédits et licences

## Ressources visuelles et sonores

Aucune image, aucun modèle 3D et aucune musique téléchargés sur internet ne sont inclus dans ce projet. Tout est généré par le code :

| Élément | Source | Licence |
| --- | --- | --- |
| Avatars « lui » et « elle » (corps, visage, coiffures, tenues) | Générés en code (`src/avatars/proceduralAvatar.ts`) | Code du projet |
| Animations Idle, Walk, Run, Sit, SitIdle, Dance | Générées en code (`src/avatars/animations.ts`) | Code du projet |
| Images de remplacement (dégradés numérotés) | Générées par canvas (`src/gallery/placeholders.ts`) | Code du projet |
| Textures béton ciré et bois, halos, cartels, textes muraux | Générés par canvas | Code du projet |
| Sculptures (cœur, nœud, galets), bancs, socles | Géométries procédurales Three.js | Code du projet |
| Musique d'ambiance par défaut | Synthétisée en direct (WebAudio, `src/audio/Music.ts`) | Code du projet |
| Environnement lumineux « RoomEnvironment » | Exemples Three.js | MIT |
| Captures du dossier `docs/` | Rendues par l'application | Code du projet |

Si vous ajoutez vos propres ressources, complétez ce tableau :

| Fichier | Source | Licence |
| --- | --- | --- |
| `public/photos/*` | Photos personnelles du couple | Droits des auteurs (usage privé) |
| `public/assets/music/…` | à compléter | à compléter (vérifiez vos droits de diffusion) |
| `public/assets/models/…` | ex. Quaternius — Universal Base Characters / Universal Animation Library | CC0 1.0 |

## Polices (auto-hébergées, aucune requête externe)

| Police | Auteur | Licence | Paquet |
| --- | --- | --- | --- |
| Cormorant Garamond | Christian Thalmann (Catharsis Fonts) | SIL Open Font License 1.1 | `@fontsource/cormorant-garamond` (MIT) |
| Inter | Rasmus Andersson | SIL Open Font License 1.1 | `@fontsource-variable/inter` (MIT) |

## Bibliothèques

| Bibliothèque | Usage | Licence |
| --- | --- | --- |
| [Three.js](https://threejs.org) | Moteur 3D WebGL | MIT |
| [GSAP](https://gsap.com) | Transitions de caméra | Licence standard GSAP (gratuite, y compris pour un usage commercial) |
| [Vite](https://vite.dev) | Serveur de développement et build | MIT |
| [TypeScript](https://www.typescriptlang.org) | Langage | Apache-2.0 |
| [sharp](https://sharp.pixelplumbing.com) | Optimisation des photos (`npm run photos`) | Apache-2.0 |
| [exifr](https://github.com/MikeKovarik/exifr) | Lecture des dates EXIF | MIT |
| [Playwright](https://playwright.dev) | Captures d'écran automatiques | Apache-2.0 |
| [Vitest](https://vitest.dev) | Tests unitaires | MIT |

## Modèles 3D recommandés (non inclus)

- Quaternius — *Universal Base Characters* et *Universal Animation Library* : https://quaternius.itch.io — licence **CC0 1.0** (domaine public).
- Mixamo (Adobe) : utilisation régie par les conditions d'Adobe ; les fichiers bruts ne doivent pas être redistribués (le dossier `public/assets/raw/` est exclu de git).
