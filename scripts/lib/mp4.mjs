/**
 * Outils MP4 / MOV sans dépendance (lecture des « atomes » du fichier) :
 * - mp4Info : dimensions affichées (rotation comprise), codec, index au début ou non ;
 * - faststart : place l'index « moov » au début du fichier, sans réencoder
 *   l'image ni le son, pour que la lecture démarre sans attendre la fin du
 *   téléchargement (les téléphones écrivent souvent l'index à la fin).
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';

/** Atomes contenant d'autres atomes (pour descendre jusqu'aux tables d'offsets). */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex', 'udta']);

/** Atomes d'un tampon entre start et end : { type, start, size, header }. */
function atoms(buf, start = 0, end = buf.length) {
  const out = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) break;
    out.push({ type, start: pos, size, header });
    pos += size;
  }
  return out;
}

/** Atomes de premier niveau d'un fichier, sans le charger en entier. */
function fileAtoms(fd, length) {
  const out = [];
  const head = Buffer.alloc(16);
  let pos = 0;
  while (pos + 8 <= length) {
    readSync(fd, head, 0, 16, pos);
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let header = 8;
    if (size === 1) {
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) size = length - pos;
    if (size < header || pos + size > length) break;
    out.push({ type, start: pos, size, header });
    pos += size;
  }
  return out;
}

function find(buf, parent, type) {
  return atoms(buf, parent.start + parent.header, parent.start + parent.size).find((a) => a.type === type);
}

/**
 * Informations d'une vidéo MP4/MOV : { largeur, hauteur, codec, faststart }
 * (largeur et hauteur telles qu'affichées, rotation des téléphones comprise),
 * ou null si le fichier n'est pas un MP4 lisible.
 */
export function mp4Info(path) {
  const length = statSync(path).size;
  const fd = openSync(path, 'r');
  try {
    const top = fileAtoms(fd, length);
    const moovAtom = top.find((a) => a.type === 'moov');
    const mdatAtom = top.find((a) => a.type === 'mdat');
    if (!moovAtom) return null;
    const moov = Buffer.alloc(moovAtom.size);
    readSync(fd, moov, 0, moovAtom.size, moovAtom.start);
    const root = { start: 0, size: moov.length, header: moovAtom.header };
    for (const trak of atoms(moov, root.header, moov.length).filter((a) => a.type === 'trak')) {
      const mdia = find(moov, trak, 'mdia');
      const hdlr = mdia && find(moov, mdia, 'hdlr');
      if (!hdlr || moov.toString('latin1', hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12) !== 'vide') continue;
      const tkhd = find(moov, trak, 'tkhd');
      if (!tkhd) continue;
      const p = tkhd.start + tkhd.header;
      const version = moov[p];
      const m = p + 4 + (version === 1 ? 32 : 20) + 16; // début de la matrice
      const a = moov.readInt32BE(m) / 65536;
      const b = moov.readInt32BE(m + 4) / 65536;
      const w = moov.readUInt32BE(m + 36) / 65536;
      const h = moov.readUInt32BE(m + 40) / 65536;
      const rotation = ((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
      const turned = rotation === 90 || rotation === 270;
      const stbl = find(moov, find(moov, mdia, 'minf') ?? mdia, 'stbl');
      const stsd = stbl && find(moov, stbl, 'stsd');
      const codec = stsd ? moov.toString('latin1', stsd.start + stsd.header + 12, stsd.start + stsd.header + 16) : '';
      return {
        largeur: Math.round(turned ? h : w),
        hauteur: Math.round(turned ? w : h),
        codec,
        faststart: !mdatAtom || moovAtom.start < mdatAtom.start,
      };
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

/** Décale toutes les tables d'offsets (stco, co64) contenues dans moov. */
function shiftOffsets(moov, parent, delta) {
  for (const a of atoms(moov, parent.start + parent.header, parent.start + parent.size)) {
    if (CONTAINERS.has(a.type)) shiftOffsets(moov, a, delta);
    else if (a.type === 'stco') {
      const count = moov.readUInt32BE(a.start + a.header + 4);
      for (let i = 0; i < count; i++) {
        const o = a.start + a.header + 8 + i * 4;
        const v = moov.readUInt32BE(o) + delta;
        if (v > 0xffffffff) throw new Error('offset trop grand pour stco');
        moov.writeUInt32BE(v, o);
      }
    } else if (a.type === 'co64') {
      const count = moov.readUInt32BE(a.start + a.header + 4);
      for (let i = 0; i < count; i++) {
        const o = a.start + a.header + 8 + i * 8;
        moov.writeBigUInt64BE(moov.readBigUInt64BE(o) + BigInt(delta), o);
      }
    }
  }
}

/**
 * Renvoie une copie du fichier avec l'index « moov » juste après « ftyp »,
 * ou null si c'est déjà le cas (ou si le fichier n'a pas la forme attendue).
 * L'image et le son ne sont pas modifiés : seules les positions sont recalculées.
 */
export function faststart(buf) {
  const top = atoms(buf);
  const moovAtom = top.find((a) => a.type === 'moov');
  const mdatAtom = top.find((a) => a.type === 'mdat');
  if (!moovAtom || !mdatAtom || moovAtom.start < mdatAtom.start) return null;
  if (top.reduce((s, a) => s + a.size, 0) !== buf.length) return null; // fichier tronqué ou inattendu
  const moov = Buffer.from(buf.subarray(moovAtom.start, moovAtom.start + moovAtom.size));
  try {
    shiftOffsets(moov, { start: 0, size: moov.length, header: moovAtom.header }, moovAtom.size);
  } catch {
    return null;
  }
  const ftyp = top[0]?.type === 'ftyp' ? top[0] : null;
  const insertAt = ftyp ? ftyp.start + ftyp.size : 0;
  const parts = [buf.subarray(0, insertAt), moov];
  for (const a of top) {
    if (a === moovAtom || a === ftyp) continue;
    parts.push(buf.subarray(a.start, a.start + a.size));
  }
  return Buffer.concat(parts);
}
