import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error module JavaScript des scripts Node (sans déclaration de types)
import { faststart, mp4Info } from '../scripts/lib/mp4.mjs';

/** Atome MP4 : taille (4 octets) + type (4) + contenu. */
const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const u32 = (...values: number[]) => {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeInt32BE(v, i * 4));
  return b;
};

/** Petit MP4 vidéo : ftyp, mdat (données), puis moov à la fin, comme un téléphone. */
function phoneLikeMp4(payload: string, rotate90: boolean, codec = 'hvc1') {
  const ftyp = box('ftyp', Buffer.from('isom'), Buffer.alloc(4), Buffer.from('isomavc1'));
  const mdat = box('mdat', Buffer.from(payload, 'latin1'));
  const dataOffset = ftyp.length + 8;
  const matrix = rotate90 ? [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000] : [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  const tkhd = box('tkhd', Buffer.from([0, 0, 0, 3]), Buffer.alloc(20), Buffer.alloc(16), u32(...matrix), u32(1920 * 65536, 1080 * 65536));
  const hdlr = box('hdlr', Buffer.alloc(4), Buffer.alloc(4), Buffer.from('vide'), Buffer.alloc(13));
  const stsd = box('stsd', Buffer.alloc(4), u32(1), box(codec, Buffer.alloc(78)));
  const stco = box('stco', Buffer.alloc(4), u32(1, dataOffset));
  const moov = box('moov', box('trak', tkhd, box('mdia', hdlr, box('minf', box('stbl', stsd, stco)))));
  return Buffer.concat([ftyp, mdat, moov]);
}

const tmp = mkdtempSync(join(tmpdir(), 'musee-mp4-'));
const save = (name: string, buf: Buffer) => {
  const p = join(tmp, name);
  writeFileSync(p, buf);
  return p;
};

describe('vidéos MP4', () => {
  it('lit les dimensions affichées, rotation des téléphones comprise', () => {
    expect(mp4Info(save('portrait.mp4', phoneLikeMp4('x', true)))).toEqual({ largeur: 1080, hauteur: 1920, codec: 'hvc1', faststart: false });
    expect(mp4Info(save('paysage.mp4', phoneLikeMp4('x', false, 'avc1')))).toMatchObject({ largeur: 1920, hauteur: 1080, codec: 'avc1' });
  });

  it('place l’index au début sans déplacer les données lues', () => {
    const payload = 'IMAGES-ET-SON-DE-LA-VIDEO';
    const original = phoneLikeMp4(payload, true);
    const fixed: Buffer = faststart(original);
    expect(fixed).not.toBeNull();
    expect(fixed.length).toBe(original.length);
    expect(fixed.indexOf('moov')).toBeLessThan(fixed.indexOf('mdat'));
    // L'offset de stco pointe toujours exactement sur les données
    const stco = fixed.indexOf('stco');
    const offset = fixed.readUInt32BE(stco + 4 + 8);
    expect(fixed.toString('latin1', offset, offset + payload.length)).toBe(payload);
    expect(mp4Info(save('rapide.mp4', fixed))).toMatchObject({ largeur: 1080, hauteur: 1920, faststart: true });
  });

  it('ne touche pas une vidéo déjà prête', () => {
    const ready = faststart(phoneLikeMp4('x', false));
    expect(faststart(ready)).toBeNull();
  });
});
