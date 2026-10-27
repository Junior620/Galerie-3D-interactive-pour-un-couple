import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { normalize } from '../src/config/loadConfig';
import type { Manifest } from '../src/config/types';
import { validateConfig } from '../src/config/validate';
import type { DeviceProfile } from '../src/utils/device';

const profile: DeviceProfile = { mobile: false, maxPixelRatio: 2, shadows: true, textureSize: 2048, spotCount: 10, glass: true, roomLights: true };
const emptyManifest: Manifest = { version: 1, photos: {}, fichiers: {} };
const example = JSON.parse(readFileSync('config.json', 'utf8'));

beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('validation de config.json', () => {
  it('accepte le config.json fourni', () => {
    const { errors } = validateConfig(example);
    expect(errors).toEqual([]);
  });

  it('signale les champs obligatoires manquants', () => {
    const { errors } = validateConfig({ photos: [] });
    expect(errors.join('\n')).toMatch(/titre/);
    expect(errors.join('\n')).toMatch(/prenoms/);
    expect(errors.join('\n')).toMatch(/salles/);
  });

  it('explique une salle inconnue et une date invalide', () => {
    const { errors } = validateConfig({
      titre: 'T',
      prenoms: { lui: 'A', elle: 'B' },
      salles: [{ id: 'a', nom: 'A' }],
      photos: [{ fichier: 'photos/x.jpg', salle: 'b', date: '2020-13-01' }],
    });
    expect(errors.some((e) => e.includes('n\'existe pas') && e.includes('a'))).toBe(true);
    expect(errors.some((e) => e.includes('2020-13-01'))).toBe(true);
  });

  it('refuse une couleur non hexadécimale et une coiffure inconnue', () => {
    const { errors } = validateConfig({
      ...example,
      avatars: { lui: { peau: 'marron', coiffure: 'iroquoise' }, elle: {} },
    });
    expect(errors.some((e) => e.includes('avatars.lui.peau'))).toBe(true);
    expect(errors.some((e) => e.includes('avatars.lui.coiffure'))).toBe(true);
  });

  it('vérifie l’adresse du site (aperçu de lien)', () => {
    expect(validateConfig({ ...example, urlSite: 'https://notre-musee.vercel.app/' }).config.urlSite).toBe('https://notre-musee.vercel.app');
    const { errors } = validateConfig({ ...example, urlSite: 'notre-musee.vercel.app' });
    expect(errors.some((e) => e.includes('urlSite'))).toBe(true);
  });

  it('détecte un identifiant de salle en double', () => {
    const { errors } = validateConfig({ ...example, salles: [{ id: 'x', nom: 'X' }, { id: 'x', nom: 'Y' }], photos: [] });
    expect(errors.some((e) => e.includes('deux fois'))).toBe(true);
  });
});

describe('normalisation', () => {
  it('répartit les photos sans salle par ordre chronologique', () => {
    const { config } = validateConfig(example);
    const musee = normalize(config, emptyManifest, [], profile);
    const ebolowa = musee.photos.find((p) => p.lieu === 'Ebolowa')!;
    const today = musee.photos.find((p) => p.titre === 'Aujourd\'hui')!;
    expect(ebolowa.salle).toBe('voyages');
    expect(today.salle).toBe('nous');
  });

  it('place deux grands portraits sur la cloison centrale', () => {
    const { config } = validateConfig(example);
    const musee = normalize(config, emptyManifest, [], profile);
    const onPartition = musee.photos.filter((p) => p.partition);
    expect(onPartition.length).toBe(2);
    expect(onPartition.every((p) => p.salle === 'nous' && p.grand && p.orientation === 'portrait')).toBe(true);
  });

  it('numérote dans l’ordre de visite (salle puis date)', () => {
    const { config } = validateConfig(example);
    const musee = normalize(config, emptyManifest, [], profile);
    expect(musee.photos.map((p) => p.numero)).toEqual(musee.photos.map((_, i) => i + 1));
    const roomOrder = musee.photos.map((p) => config.salles.findIndex((s) => s.id === p.salle));
    expect([...roomOrder].sort((a, b) => a - b)).toEqual(roomOrder);
  });

  it('génère des images de remplacement quand il n’y a aucune photo', () => {
    const { config } = validateConfig({ ...example, photos: [] });
    const musee = normalize(config, emptyManifest, [], profile);
    expect(musee.photos.length).toBeGreaterThan(10);
    expect(musee.photos.every((p) => p.placeholder)).toBe(true);
  });

  it('utilise le manifeste : format réel et variantes adaptées à l’appareil', () => {
    const { config } = validateConfig(example);
    const manifest: Manifest = {
      version: 1,
      fichiers: {},
      photos: {
        'photos/rencontre/01.jpg': { type: 'image', largeur: 1000, hauteur: 1600, orientationExif: 6, date: null, variantes: { hd: 'photos/optimisees/rencontre__01.webp', md: 'photos/optimisees/rencontre__01-1024.webp', mini: 'photos/optimisees/rencontre__01-mini.webp' } },
      },
    };
    const desktop = normalize(config, manifest, [], profile).photos.find((p) => p.fichier === 'photos/rencontre/01.jpg')!;
    expect(desktop.placeholder).toBe(false);
    expect(desktop.orientation).toBe('portrait');
    expect(desktop.titre).toBe('Le premier jour'); // métadonnées de config.json conservées
    expect(desktop.sources?.full).toBe('photos/optimisees/rencontre__01.webp');
    const phone = normalize(config, manifest, [], { ...profile, mobile: true, textureSize: 1024 }).photos.find((p) => p.fichier === 'photos/rencontre/01.jpg')!;
    expect(phone.sources?.full).toBe('photos/optimisees/rencontre__01-1024.webp');
  });
});

describe('dossiers de salle et vidéos', () => {
  const img = (largeur: number, hauteur: number, date: string | null = null) => ({ type: 'image' as const, largeur, hauteur, orientationExif: 1, date, variantes: {} });
  const vid = () => ({ type: 'video' as const, largeur: null, hauteur: null, orientationExif: 1, date: null, variantes: {} });
  const manifest: Manifest = {
    version: 1,
    fichiers: {},
    photos: {
      'photos/rencontre/2020-02-14 Premier café.jpg': img(1600, 1200),
      'photos/voyages/IMG_20210403_101500.jpg': img(1200, 1600),
      'photos/voyages/plage.jpg': img(1600, 900, '2021-08-01'),
      'photos/nous/03 - Notre danse.mp4': vid(),
      'photos/Notre rencontre/souvenir.jpg': img(1000, 1000),
      'photos/divers.jpg': img(1000, 1000),
    },
  };
  const { config } = validateConfig(example);
  const musee = normalize(config, manifest, [], profile, new Map([['photos/nous/03 - Notre danse.mp4', 9 / 16]]));
  const by = (f: string) => musee.photos.find((p) => p.fichier === f)!;

  it('expose les fichiers déposés dans les dossiers, sans les déclarer', () => {
    expect(musee.photos.length).toBe(6);
    // Les exemples de config.json sans fichier ne sont plus affichés.
    expect(musee.photos.some((p) => p.placeholder)).toBe(false);
  });

  it('range chaque fichier dans la salle de son dossier (id ou nom de salle)', () => {
    expect(by('photos/rencontre/2020-02-14 Premier café.jpg').salle).toBe('rencontre');
    expect(by('photos/voyages/plage.jpg').salle).toBe('voyages');
    expect(by('photos/nous/03 - Notre danse.mp4').salle).toBe('nous');
    expect(by('photos/Notre rencontre/souvenir.jpg').salle).toBe('rencontre');
    expect(by('photos/divers.jpg').salle).not.toBe(''); // hors dossier : répartie automatiquement
  });

  it('tire titre et date du nom du fichier', () => {
    const cafe = by('photos/rencontre/2020-02-14 Premier café.jpg');
    expect(cafe.titre).toBe('Premier café');
    expect(cafe.dateLabel).toBe('14 février 2020');
    const camera = by('photos/voyages/IMG_20210403_101500.jpg');
    expect(camera.titre).toBe('Souvenir du 3 avril 2021');
    expect(by('photos/voyages/plage.jpg').titre).toBe('Plage');
  });

  it('reconnaît les vidéos et utilise leur format réel', () => {
    const v = by('photos/nous/03 - Notre danse.mp4');
    expect(v.type).toBe('video');
    expect(v.titre).toBe('Notre danse');
    expect(v.orientation).toBe('portrait');
    expect(v.sources?.full).toBe('photos/nous/03 - Notre danse.mp4');
  });

  it('trie chronologiquement dans chaque salle', () => {
    const voyages = musee.rooms.find((r) => r.id === 'voyages')!.photos.map((p) => p.fichier);
    expect(voyages).toEqual(['photos/voyages/IMG_20210403_101500.jpg', 'photos/voyages/plage.jpg']);
  });
});
