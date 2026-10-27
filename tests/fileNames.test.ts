import { describe, expect, it } from 'vitest';
import { dateFromFileName, isVideoFile, slug, titleFromFileName } from '../src/config/fileNames';

describe('noms de fichiers', () => {
  it('reconnaît les vidéos', () => {
    expect(isVideoFile('photos/voyages/plage.MP4')).toBe(true);
    expect(isVideoFile('photos/nous/danse.webm')).toBe(true);
    expect(isVideoFile('photos/nous/iphone.mov')).toBe(true);
    expect(isVideoFile('photos/nous/portrait.jpg')).toBe(false);
  });

  it('trouve la date dans les noms courants', () => {
    expect(dateFromFileName('photos/rencontre/2020-02-14 Premier café.jpg')).toBe('2020-02-14');
    expect(dateFromFileName('IMG_20210403_101500.jpg')).toBe('2021-04-03');
    expect(dateFromFileName('IMG-20220514-WA0007.jpg')).toBe('2022-05-14');
    expect(dateFromFileName('PXL_20230107_064512345.mp4')).toBe('2023-01-07');
    expect(dateFromFileName('vacances.jpg')).toBeNull();
    expect(dateFromFileName('20201345.jpg')).toBeNull();
  });

  it('tire un titre lisible, sans les noms automatiques', () => {
    expect(titleFromFileName('photos/rencontre/2020-02-14 Premier café.jpg')).toBe('Premier café');
    expect(titleFromFileName('03 - plage de Kribi.mp4')).toBe('Plage de Kribi');
    expect(titleFromFileName('notre_premier_concert.jpg')).toBe('Notre premier concert');
    expect(titleFromFileName('IMG_20210403_101500.jpg')).toBe('');
    expect(titleFromFileName('IMG-20220514-WA0007.jpg')).toBe('');
    expect(titleFromFileName('DSC01234.JPG')).toBe('');
    expect(titleFromFileName('WhatsApp Image 2023-06-10 at 18.22.05.jpeg')).toBe('');
    expect(titleFromFileName('12.jpg')).toBe('');
    expect(titleFromFileName('Photo de mariage.jpg')).toBe('Photo de mariage');
    expect(titleFromFileName('Image 3.png')).toBe('');
  });

  it('compare les noms de dossier sans accents ni majuscules', () => {
    expect(slug('Notre rencontre')).toBe('notre-rencontre');
    expect(slug('Évasion')).toBe('evasion');
  });
});
