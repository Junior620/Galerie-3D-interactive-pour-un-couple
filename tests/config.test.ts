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
        'photos/01.jpg': { largeur: 1000, hauteur: 1600, orientationExif: 6, date: null, variantes: { hd: 'photos/optimisees/01.webp', md: 'photos/optimisees/01-1024.webp', mini: 'photos/optimisees/01-mini.webp' } },
      },
    };
    const desktop = normalize(config, manifest, [], profile).photos.find((p) => p.fichier === 'photos/01.jpg')!;
    expect(desktop.placeholder).toBe(false);
    expect(desktop.orientation).toBe('portrait');
    expect(desktop.sources?.full).toBe('photos/optimisees/01.webp');
    const phone = normalize(config, manifest, [], { ...profile, mobile: true, textureSize: 1024 }).photos.find((p) => p.fichier === 'photos/01.jpg')!;
    expect(phone.sources?.full).toBe('photos/optimisees/01-1024.webp');
  });
});
