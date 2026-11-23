/**
 * Pure browser HWP 5.x (OLE2/CFB) & HWPX (ZIP/XML) to PDF converter for CrowShow Web.
 *
 * Uses layout-preserving SVG rendering (reading Hancom's PARA_LINE_SEG / linesegarray cache
 * with automatic line-wrap reflow fallback when layout cache is absent), renders each page SVG
 * onto a high-DPI HTML5 Canvas, and embeds the pages into a multi-page PDF via pdf-lib.
 */

import * as CFB from 'cfb';
import JSZip from 'jszip';
import * as pako from 'pako';
import { DOMParser } from '@xmldom/xmldom';

// ─── Constants & Tags ───────────────────────────────────────────

const TAG_ID_MAPPINGS = 0x0011;
const TAG_BIN_DATA = 0x0012;
const TAG_FACE_NAME = 0x0013;
const TAG_BORDER_FILL = 0x0014;
const TAG_DOC_CHAR_SHAPE = 0x0015;
const TAG_DOC_PARA_SHAPE = 0x0019;

const TAG_PARA_HEADER = 0x0042;
const TAG_PARA_TEXT = 0x0043;
const TAG_CHAR_SHAPE = 0x0044;
const TAG_PARA_LINE_SEG = 0x0045;
const TAG_CTRL_HEADER = 0x0047;
const TAG_LIST_HEADER = 0x0048;
const TAG_PAGE_DEF = 0x0049;
const TAG_SHAPE_COMPONENT = 0x004c;
const TAG_TABLE = 0x004d;
const TAG_SHAPE_COMPONENT_LINE = 0x004e;
const TAG_SHAPE_COMPONENT_POLYGON = 0x0052;
const TAG_SHAPE_COMPONENT_CURVE = 0x0053;
const TAG_SHAPE_COMPONENT_PICTURE = 0x0055;

const FLAG_COMPRESSED = 1 << 0;
const FLAG_ENCRYPTED = 1 << 1;
const FLAG_DISTRIBUTION = 1 << 2;
const FLAG_DRM = 1 << 4;

const MM_TO_PT = 2.834645;
const BORDER_WIDTH_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
const BORDER_TYPE = [
  'NONE', 'SOLID', 'DASH', 'DOT', 'DASH_DOT', 'DASH_DOT_DOT', 'LONG_DASH', 'CIRCLE',
  'DOUBLE_SLIM', 'SLIM_THICK', 'THICK_SLIM', 'SLIM_THICK_SLIM', 'WAVE', 'DOUBLE_WAVE',
  'THICK_3D', 'THICK_3D_LIFTED', '3D', '3D_LIFTED',
];

type ParaAlign = 'JUSTIFY' | 'LEFT' | 'RIGHT' | 'CENTER' | 'DISTRIBUTE' | 'DISTRIBUTE_SPACE';
const PARA_ALIGNS: ParaAlign[] = ['JUSTIFY', 'LEFT', 'RIGHT', 'CENTER', 'DISTRIBUTE', 'DISTRIBUTE_SPACE'];
const LINE_SPACING_TYPES = ['PERCENT', 'FIXED', 'BETWEEN_LINES', 'AT_LEAST'];

const SVG_FONT_FAMILY = `'Pretendard','Malgun Gothic','맑은 고딕','HCR Batang','함초롬바탕','NanumGothic',sans-serif`;

// ─── Binary Helpers (Uint8Array / DataView) ─────────────────────

function u16(buf: Uint8Array, off: number): number {
  if (off + 2 > buf.length) return 0;
  return buf[off] | (buf[off + 1] << 8);
}

function i16(buf: Uint8Array, off: number): number {
  const v = u16(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function u32(buf: Uint8Array, off: number): number {
  if (off + 4 > buf.length) return 0;
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function i32(buf: Uint8Array, off: number): number {
  if (off + 4 > buf.length) return 0;
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24);
}

function i8(buf: Uint8Array, off: number): number {
  if (off >= buf.length) return 0;
  const v = buf[off];
  return v >= 0x80 ? v - 0x100 : v;
}

function decodeUtf16LE(buf: Uint8Array, start = 0, end = buf.length): string {
  const slice = buf.subarray(start, Math.min(end, buf.length));
  return new TextDecoder('utf-16le').decode(slice);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decompressStream(data: Uint8Array): Uint8Array<ArrayBuffer> {
  if (data.length >= 2 && data[0] === 0x78) {
    try {
      return new Uint8Array(pako.inflate(data));
    } catch {
      // Fall back to raw inflate
    }
  }
  try {
    return new Uint8Array(pako.inflateRaw(data));
  } catch {
    return new Uint8Array(pako.inflate(data));
  }
}

// ─── PUA Character Mapping ──────────────────────────────────────

const BMP_SYMBOL_MAP: Record<number, string> = {
  0x6c: '●', 0x6d: '●', 0x6e: '■', 0x6f: '□', 0x70: '□', 0x71: '□', 0x72: '□',
  0x73: '⬧', 0x74: '⧫', 0x75: '◆', 0x76: '❖', 0x77: '⬥',
  0x9e: '·', 0x9f: '•', 0xa0: '·', 0xa1: '⚪', 0xa2: '○', 0xa3: '○', 0xa4: '◉', 0xa5: '◎',
  0xa7: '▪', 0xa8: '◻', 0xaa: '✦', 0xab: '★', 0xac: '✶', 0xad: '✴', 0xae: '✹',
  0x45: '☜', 0x46: '☞', 0x47: '☝', 0x48: '☟',
  0xfb: '✗', 0xfc: '✔', 0xfd: '☒', 0xfe: '☑',
  0xe8: '➔', 0xef: '⇦', 0xf0: '⇨', 0xf1: '⇧', 0xf2: '⇩',
};

const SUPPLEMENTARY_MAP: Record<number, string> = {
  0xf003b: '↓', 0xf02ef: '·', 0xf0854: '《', 0xf0855: '》', 0xf00da: '▸', 0xf080f: '━',
  0xf0827: '■', 0xf03c5: '□', 0xf012b: '(인)', 0xf00e1: '(인)', 0xf02fc: '►', 0xf031c: '■',
  0xf03a0: '↵', 0xf0090: '✺', 0xf0288: '⓪', 0xf0289: '①', 0xf028a: '②', 0xf028c: '④',
  0xf028d: '⑤', 0xf028e: '⑥', 0xf028f: '⑦', 0xf0290: '⑧', 0xf0291: '⑨',
  0xf02ec: '◇', 0xf02fb: '▸', 0xf03a7: '⊟', 0xf03a8: '⊞', 0xf03da: '□', 0xf03ff: '□',
  0xf0806: '┌', 0xf0807: '┬', 0xf0808: '┐', 0xf080c: '└', 0xf080e: '┘', 0xf0810: '│',
  0xf081c: '┈', 0xf0832: '═', 0xf0848: '━',
};

function mapPuaChar(code: number): string | undefined {
  if (code >= 0xf020 && code <= 0xf0ff) return BMP_SYMBOL_MAP[code - 0xf000];
  if (code >= 0xf02b1 && code <= 0xf02c4) return String.fromCodePoint(0x2460 + (code - 0xf02b1));
  if (code >= 0xf0000 && code <= 0xf09ff) return SUPPLEMENTARY_MAP[code];
  return undefined;
}

function mapPuaText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out += mapPuaChar(code) ?? ch;
  }
  return out;
}

// ─── AES-128 ECB for Distribution HWP (ViewText) ────────────────

const S_BOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);

const INV_S_BOX = new Uint8Array([
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d,
]);

const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

function gmul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function expandKey(key: Uint8Array): Uint32Array {
  const w = new Uint32Array(44);
  for (let i = 0; i < 4; i++) {
    w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
  }
  for (let i = 4; i < 44; i++) {
    let temp = w[i - 1];
    if (i % 4 === 0) {
      temp = ((temp << 8) | (temp >>> 24)) >>> 0;
      temp =
        (S_BOX[(temp >>> 24) & 0xff] << 24) |
        (S_BOX[(temp >>> 16) & 0xff] << 16) |
        (S_BOX[(temp >>> 8) & 0xff] << 8) |
        S_BOX[temp & 0xff];
      temp = (temp ^ (RCON[i / 4 - 1] << 24)) >>> 0;
    }
    w[i] = (w[i - 4] ^ temp) >>> 0;
  }
  return w;
}

function addRoundKey(s: Uint8Array, w: Uint32Array, round: number): void {
  const base = round * 4;
  for (let c = 0; c < 4; c++) {
    const k = w[base + c];
    s[c * 4] ^= (k >>> 24) & 0xff;
    s[c * 4 + 1] ^= (k >>> 16) & 0xff;
    s[c * 4 + 2] ^= (k >>> 8) & 0xff;
    s[c * 4 + 3] ^= k & 0xff;
  }
}

function invSubBytes(s: Uint8Array): void {
  for (let i = 0; i < 16; i++) s[i] = INV_S_BOX[s[i]];
}

function invShiftRows(s: Uint8Array): void {
  let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
  t = s[2]; s[2] = s[10]; s[10] = t;
  t = s[6]; s[6] = s[14]; s[14] = t;
  t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
}

function invMixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i]     = gmul(a0, 0x0e) ^ gmul(a1, 0x0b) ^ gmul(a2, 0x0d) ^ gmul(a3, 0x09);
    s[i + 1] = gmul(a0, 0x09) ^ gmul(a1, 0x0e) ^ gmul(a2, 0x0b) ^ gmul(a3, 0x0d);
    s[i + 2] = gmul(a0, 0x0d) ^ gmul(a1, 0x09) ^ gmul(a2, 0x0e) ^ gmul(a3, 0x0b);
    s[i + 3] = gmul(a0, 0x0b) ^ gmul(a1, 0x0d) ^ gmul(a2, 0x09) ^ gmul(a3, 0x0e);
  }
}

function aes128EcbDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const roundKeys = expandKey(key);
  const out = new Uint8Array(data.length);
  for (let offset = 0; offset < data.length; offset += 16) {
    const s = new Uint8Array(data.subarray(offset, offset + 16));
    addRoundKey(s, roundKeys, 10);
    for (let round = 9; round >= 1; round--) {
      invShiftRows(s);
      invSubBytes(s);
      addRoundKey(s, roundKeys, round);
      invMixColumns(s);
    }
    invShiftRows(s);
    invSubBytes(s);
    addRoundKey(s, roundKeys, 0);
    out.set(s, offset);
  }
  return out;
}

function decryptViewText(viewTextRaw: Uint8Array, compressed: boolean): Uint8Array {
  const header = u32(viewTextRaw, 0);
  const tagId = header & 0x3ff;
  let size = (header >>> 20) & 0xfff;
  let headerSize = 4;
  if (size === 0xfff) {
    size = u32(viewTextRaw, 4);
    headerSize = 8;
  }
  if (tagId !== 28 || headerSize + size > viewTextRaw.length || size < 256) {
    throw new Error('유효하지 않은 배포용 HWP 스트림입니다.');
  }
  const payload = new Uint8Array(viewTextRaw.subarray(headerSize, headerSize + 256));
  let seed = u32(payload, 0);
  const rand = () => {
    seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
    return (seed >>> 16) & 0x7fff;
  };
  let i = 0, n = 0, key = 0;
  while (i < 256) {
    if (n === 0) {
      key = rand() & 0xff;
      n = (rand() & 0x0f) + 1;
    }
    if (i >= 4) payload[i] ^= key;
    i++;
    n--;
  }
  const keyOffset = 4 + (payload[0] & 0x0f);
  const aesKey = payload.slice(keyOffset, keyOffset + 16);
  const encryptedData = viewTextRaw.subarray(headerSize + size);
  const alignedLen = encryptedData.length - (encryptedData.length % 16);
  const decrypted = aes128EcbDecrypt(encryptedData.subarray(0, alignedLen), aesKey);
  if (compressed) {
    try {
      return decompressStream(decrypted);
    } catch {
      return decrypted;
    }
  }
  return decrypted;
}

// ─── Text Width & Line-Wrap Simulation ──────────────────────────

const ASCII_W = [
  300, 320, 320, 610, 610, 830, 724, 320, 320, 320, 550, 550, 320, 550, 320, 550,
  550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 320, 320, 550, 550, 550, 550,
  830, 706, 605, 685, 719, 627, 617, 683, 734, 305, 315, 660, 605, 839, 734, 732,
  603, 705, 660, 627, 664, 731, 706, 910, 705, 705, 626, 320, 550, 320, 550, 550,
  320, 569, 597, 552, 597, 536, 356, 562, 635, 287, 288, 582, 287, 907, 635, 588,
  597, 579, 478, 496, 356, 635, 563, 720, 542, 543, 486, 320, 320, 320, 550, 0,
];

function charWidthEm1000(cp: number): number {
  if (cp >= 0x20 && cp <= 0x7e) return ASCII_W[cp - 0x20];
  if (cp >= 0xac00 && cp <= 0xd7a3) return 970;
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)) return 1000;
  if ((cp >= 0x3008 && cp <= 0x3011) || (cp >= 0x3014 && cp <= 0x301b)) return 500;
  return cp >= 0x2000 ? 970 : 550;
}

function measureTextWidth(text: string, height: number, ratioPct: number, spacingPct = 0): number {
  let em = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const w = cp === 0x20 ? 500 : charWidthEm1000(cp);
    em += w * (1 + spacingPct / 100);
  }
  return (em / 1000) * height * (ratioPct / 100);
}

const FORBID_START = new Set([...'!%),.:;?]}¢°′″℃〉》」』】〕₩~…·、。〃']);
const FORBID_END = new Set([...'$([{£¥〈《「『【〔']);

function simulateWrap(
  text: string,
  firstWidth: number,
  contWidth: number,
  height: number,
  ratioPct: number,
  spacingPct = 0
): { lines: number; starts: number[] } {
  const k = (height * ratioPct) / 100 / 1000;
  const charW = (ch: string) => {
    const cp = ch.codePointAt(0)!;
    return (cp === 0x20 ? 500 : charWidthEm1000(cp)) * (1 + spacingPct / 100) * k;
  };
  const rangeW = (from: number, to: number) => {
    let w = 0;
    for (const ch of text.slice(from, to)) w += charW(ch);
    return w;
  };
  const units = text.match(/ +|[^ ]+/gu) ?? [];
  const starts = [0];
  let lineW = 0;
  let avail = firstWidth;
  let pos = 0;
  const lineStart = () => starts[starts.length - 1];
  const breakBefore = (unitPos: number, w: number) => {
    let bp = unitPos;
    const u = text[unitPos];
    if (u !== undefined && FORBID_START.has(u) && bp - 1 > lineStart() && text[bp - 1] !== ' ') bp--;
    while (bp - 1 > lineStart() && FORBID_END.has(text[bp - 1])) bp--;
    if (bp <= lineStart()) bp = unitPos;
    starts.push(bp);
    avail = contWidth;
    lineW = rangeW(bp, unitPos) + w;
  };
  for (const u of units) {
    if (u[0] === ' ') {
      lineW += charW(' ') * u.length;
      pos += u.length;
      continue;
    }
    const w = rangeW(pos, pos + u.length);
    if (lineW + w <= avail + 0.5) {
      lineW += w;
      pos += u.length;
      continue;
    }
    if (lineW === 0 || w > contWidth + 0.5) {
      let sub = 0;
      for (const ch of u) {
        const c = charW(ch);
        if (lineW + c > avail + 0.5 && lineW > 0) breakBefore(pos + sub, 0);
        lineW += c;
        sub += ch.length;
      }
      pos += u.length;
      continue;
    }
    breakBefore(pos, w);
    pos += u.length;
  }
  return { lines: starts.length, starts };
}

// ─── Styles & Layout Math ───────────────────────────────────────

interface RenderCharStyle {
  height: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color?: string;
  ratio: number;
  spacing: number;
  fontFamily?: string;
  face?: string;
}

interface RenderParaGeom {
  lineSpacingType: string;
  lineSpacingValue: number;
  marginLeft: number;
  marginRight: number;
  marginIntent: number;
  spaceBefore: number;
  spaceAfter: number;
}

interface RenderBorderEdge {
  type: string;
  widthPt: number;
  color: string;
}

interface RenderBorderFill {
  left?: RenderBorderEdge;
  right?: RenderBorderEdge;
  top?: RenderBorderEdge;
  bottom?: RenderBorderEdge;
  fill?: string;
}

interface RenderStyles {
  charPr: Map<string, RenderCharStyle>;
  paraAlign: Map<string, ParaAlign>;
  paraGeom: Map<string, RenderParaGeom>;
  borderFill: Map<string, RenderBorderFill>;
}

const DEFAULT_CHAR: RenderCharStyle = {
  height: 1000,
  bold: false,
  italic: false,
  underline: false,
  ratio: 100,
  spacing: 0,
};

const DEFAULT_PARA_GEOM: RenderParaGeom = {
  lineSpacingType: 'PERCENT',
  lineSpacingValue: 160,
  marginLeft: 0,
  marginRight: 0,
  marginIntent: 0,
  spaceBefore: 0,
  spaceAfter: 0,
};

function hwpFaceToCssStack(face?: string | null): string {
  const trimmed = (face ?? '').trim();
  if (!trimmed) return SVG_FONT_FAMILY;
  const isSerif = /바탕|명조|Batang|Myeong|궁서|Gungsuh|Serif|신명/i.test(trimmed);
  const generic = isSerif
    ? `'HCR Batang','함초롬바탕','Batang','Noto Serif KR',serif`
    : `'Pretendard','Malgun Gothic','맑은 고딕','HCR Dotum','Noto Sans KR',sans-serif`;
  const clean = trimmed.replace(/['"\\]/g, '');
  return `'${clean}',${generic}`;
}

function toInt32(v: string | null | undefined, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n > 0x7fffffff ? n - 0x100000000 : n;
}

interface SpanConstraint {
  a: number;
  b: number;
  size: number;
}

function solveBoundaries(constraints: SpanConstraint[], count: number, total?: number): number[] {
  const x = new Array<number | undefined>(count + 1).fill(undefined);
  x[0] = 0;
  if (total != null && total > 0) x[count] = total;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < count + 8) {
    changed = false;
    for (const c of constraints) {
      if (c.a < 0 || c.b > count || c.a >= c.b) continue;
      const xa = x[c.a];
      const xb = x[c.b];
      if (xa != null && xb == null) {
        x[c.b] = xa + c.size;
        changed = true;
      } else if (xb != null && xa == null) {
        x[c.a] = xb - c.size;
        changed = true;
      }
    }
  }
  let i = 0;
  while (i <= count) {
    if (x[i] != null) { i++; continue; }
    let lo = i - 1;
    let hi = i;
    while (hi <= count && x[hi] == null) hi++;
    const loV = x[lo] as number;
    const hiV = hi <= count ? (x[hi] as number) : loV + (hi - lo) * 1000;
    const n = hi - lo;
    for (let k = 1; k < n; k++) x[lo + k] = loV + ((hiV - loV) * k) / n;
    if (hi > count) x[count] = hiV;
    i = hi;
  }
  const out = x as number[];
  for (let k = 1; k <= count; k++) if (out[k] < out[k - 1]) out[k] = out[k - 1];
  return out;
}

function solveRowHeights(
  cells: { rowAddr: number; rowSpan: number; height: number; contentH?: number }[],
  rowCount: number
): number[] {
  const h = new Array<number>(rowCount).fill(0);
  for (const c of cells) {
    if (c.rowSpan === 1 && c.rowAddr >= 0 && c.rowAddr < rowCount) {
      h[c.rowAddr] = Math.max(h[c.rowAddr], c.height);
    }
  }
  for (const c of cells) {
    if (c.rowSpan <= 1) continue;
    const rows: number[] = [];
    for (let r = c.rowAddr; r < Math.min(c.rowAddr + c.rowSpan, rowCount); r++) rows.push(r);
    const known = rows.reduce((s, r) => s + h[r], 0);
    const missing = rows.filter((r) => h[r] === 0);
    if (missing.length > 0 && c.height > known) {
      const each = (c.height - known) / missing.length;
      for (const r of missing) h[r] = each;
    }
  }
  for (const c of cells) {
    if (c.rowSpan === 1 && c.contentH != null && c.rowAddr >= 0 && c.rowAddr < rowCount) {
      if (c.contentH > h[c.rowAddr]) h[c.rowAddr] = c.contentH;
    }
  }
  return h;
}

// ─── XML & DOM Helpers ──────────────────────────────────────────

function createXmlParser(): DOMParser {
  return new DOMParser({
    onError(level: string, msg: string) {
      if (level === 'fatalError') throw new Error(`XML 파싱 오류: ${msg}`);
    },
  });
}

function ln(el: Element): string {
  return (el.tagName || el.localName || '').replace(/^[^:]+:/, '');
}

function elements(el: Element): Element[] {
  const out: Element[] = [];
  const children = el.childNodes;
  if (!children) return out;
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === 1) out.push(children[i] as Element);
  }
  return out;
}

function findChildByLocalName(parent: Element, name: string): Element | null {
  for (const ch of elements(parent)) {
    if (ln(ch) === name) return ch;
  }
  return null;
}

function findFirst(el: Element, name: string, depth = 0): Element | null {
  if (depth > 48) return null;
  for (const ch of elements(el)) {
    if (ln(ch) === name) return ch;
    const found = findFirst(ch, name, depth + 1);
    if (found) return found;
  }
  return null;
}

function num(el: Element | null, attr: string, fallback = 0): number {
  return el ? toInt32(el.getAttribute(attr), fallback) : fallback;
}

function escapeXml(s: string): string {
  let clean = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) clean += s[i];
  }
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HWPX Header Styles Parser ──────────────────────────────────

function parseRenderStyles(headXml: string): RenderStyles {
  const styles: RenderStyles = {
    charPr: new Map(),
    paraAlign: new Map(),
    paraGeom: new Map(),
    borderFill: new Map(),
  };
  const doc = createXmlParser().parseFromString(headXml, 'text/xml');
  const root = doc.documentElement as unknown as Element | null;
  if (!root) return styles;

  const hangulFonts = new Map<string, string>();
  const faces = findFirst(root, 'fontfaces');
  if (faces) {
    let group: Element | null = null;
    for (const ch of elements(faces)) {
      if (ln(ch) !== 'fontface') continue;
      if (!group) group = ch;
      if ((ch.getAttribute('lang') ?? '').toUpperCase() === 'HANGUL') {
        group = ch;
        break;
      }
    }
    if (group) {
      for (const f of elements(group)) {
        if (ln(f) !== 'font') continue;
        const id = f.getAttribute('id');
        const face = f.getAttribute('face');
        if (id != null && face) hangulFonts.set(id, face);
      }
    }
  }

  const parseEdge = (el: Element | null): RenderBorderEdge | undefined => {
    if (!el) return undefined;
    const type = el.getAttribute('type') ?? 'NONE';
    if (type === 'NONE') return undefined;
    const w = parseFloat(el.getAttribute('width') ?? '');
    return {
      type,
      widthPt: (Number.isFinite(w) ? w : 0.12) * MM_TO_PT,
      color: el.getAttribute('color') ?? '#000000',
    };
  };

  const walk = (el: Element) => {
    const tag = ln(el);
    if (tag === 'charPr') {
      const id = el.getAttribute('id');
      if (id != null) {
        const ratioEl = findChildByLocalName(el, 'ratio');
        const spacingEl = findChildByLocalName(el, 'spacing');
        const underlineEl = findChildByLocalName(el, 'underline');
        const textColor = el.getAttribute('textColor');
        const fontRef = findChildByLocalName(el, 'fontRef');
        const fontId = fontRef?.getAttribute('hangul') ?? fontRef?.getAttribute('latin');
        const face = fontId != null ? hangulFonts.get(fontId) : undefined;
        styles.charPr.set(id, {
          height: Number(el.getAttribute('height')) || 1000,
          bold: findChildByLocalName(el, 'bold') != null,
          italic: findChildByLocalName(el, 'italic') != null,
          underline: underlineEl != null && (underlineEl.getAttribute('type') ?? 'NONE') !== 'NONE',
          color: textColor && textColor !== '#000000' && textColor.toLowerCase() !== 'none' ? textColor : undefined,
          ratio: Number(ratioEl?.getAttribute('hangul')) || 100,
          spacing: Number(spacingEl?.getAttribute('hangul')) || 0,
          fontFamily: hwpFaceToCssStack(face),
          face,
        });
      }
    } else if (tag === 'paraPr') {
      const id = el.getAttribute('id');
      if (id != null) {
        const align = findFirst(el, 'align');
        styles.paraAlign.set(id, ((align?.getAttribute('horizontal') as ParaAlign) || 'JUSTIFY'));
        const g: RenderParaGeom = { ...DEFAULT_PARA_GEOM };
        const ls = findFirst(el, 'lineSpacing');
        if (ls) {
          g.lineSpacingType = ls.getAttribute('type') ?? 'PERCENT';
          g.lineSpacingValue = Number(ls.getAttribute('value')) || 160;
        }
        const margin = findFirst(el, 'margin');
        if (margin) {
          const v = (n: string) => Number(findFirst(margin, n)?.getAttribute('value')) || 0;
          g.marginLeft = v('left');
          g.marginRight = v('right');
          g.marginIntent = v('intent');
          g.spaceBefore = v('prev');
          g.spaceAfter = v('next');
        }
        styles.paraGeom.set(id, g);
      }
    } else if (tag === 'borderFill') {
      const id = el.getAttribute('id');
      if (id != null) {
        const bf: RenderBorderFill = {
          left: parseEdge(findChildByLocalName(el, 'leftBorder')),
          right: parseEdge(findChildByLocalName(el, 'rightBorder')),
          top: parseEdge(findChildByLocalName(el, 'topBorder')),
          bottom: parseEdge(findChildByLocalName(el, 'bottomBorder')),
        };
        const winBrush = findFirst(el, 'winBrush');
        const face = winBrush?.getAttribute('faceColor');
        if (face && face.toLowerCase() !== 'none') bf.fill = face;
        styles.borderFill.set(id, bf);
      }
    }
    for (const ch of elements(el)) walk(ch);
  };

  walk(root);
  return styles;
}

// ─── SVG Layout Renderer (Shared by HWPX and HWP5) ──────────────

interface PageGeom { PW: number; PH: number; ML: number; MT: number; BODY_W: number; BODY_H: number }
interface Seg { textpos: number; vertpos: number; horzpos: number; horzsize: number; textheight: number; baseline: number }
interface ParaChar { ch: string; prId: string | null }
interface ParaObj { el: Element; tag: string; index: number; inline: boolean; width: number; height: number; omL: number; omR: number }
interface ParaModel { chars: ParaChar[]; segs: Seg[]; objs: ParaObj[]; paraPrId: string | null }

const OBJ_TAGS = new Set(['tbl', 'pic', 'container', 'equation', 'rect', 'ellipse', 'polygon', 'curv', 'line', 'arc', 'ole', 'textart']);
const SHAPE_TAGS = new Set(['rect', 'ellipse', 'line', 'polygon', 'curv', 'arc']);
const CHAR_CTRL_1SLOT = new Set(['lineBreak', 'hyphen', 'nbSpace', 'fwSpace']);

function pushFillers(chars: ParaChar[], n: number, prId: string | null): void {
  for (let i = 0; i < n; i++) chars.push({ ch: '', prId });
}

function pushTextSlots(t: Element, chars: ParaChar[], prId: string | null, depth: number): void {
  if (depth > 32) return;
  const kids = t.childNodes;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.nodeType === 3 || c.nodeType === 4) {
      for (const cp of c.textContent ?? '') {
        chars.push({ ch: cp, prId });
        if (cp.length === 2) chars.push({ ch: '', prId });
      }
    } else if (c.nodeType === 1) {
      const el = c as Element;
      const tag = ln(el);
      if (tag === 'tab') pushFillers(chars, 8, prId);
      else if (CHAR_CTRL_1SLOT.has(tag)) chars.push({ ch: tag === 'nbSpace' || tag === 'fwSpace' ? ' ' : '', prId });
      else pushTextSlots(el, chars, prId, depth + 1);
    }
  }
}

function buildPara(p: Element): ParaModel {
  const chars: ParaChar[] = [];
  const objs: ParaObj[] = [];
  let segs: Seg[] = [];
  for (const runEl of elements(p)) {
    const tag = ln(runEl);
    if (tag === 'run') {
      const prId = runEl.getAttribute('charPrIDRef');
      for (const ch of elements(runEl)) {
        const cn = ln(ch);
        if (cn === 't') {
          pushTextSlots(ch, chars, prId, 0);
        } else if (OBJ_TAGS.has(cn)) {
          const sz = findChildByLocalName(ch, 'sz');
          const pos = findChildByLocalName(ch, 'pos');
          const w = num(sz, 'width') || num(findChildByLocalName(ch, 'curSz'), 'width') || num(findChildByLocalName(ch, 'orgSz'), 'width');
          const h = num(sz, 'height') || num(findChildByLocalName(ch, 'curSz'), 'height') || num(findChildByLocalName(ch, 'orgSz'), 'height');
          const inline = pos?.getAttribute('treatAsChar') === '1';
          const om = inline && cn === 'tbl' ? findChildByLocalName(ch, 'outMargin') : null;
          objs.push({
            el: ch, tag: cn, index: chars.length, inline, width: w, height: h,
            omL: num(om, 'left'), omR: num(om, 'right'),
          });
          pushFillers(chars, 8, prId);
        } else {
          pushFillers(chars, 8, prId);
        }
      }
    } else if (tag === 'linesegarray') {
      segs = elements(runEl)
        .filter((s) => ln(s) === 'lineseg')
        .map((s) => ({
          textpos: num(s, 'textpos'),
          vertpos: num(s, 'vertpos'),
          horzpos: num(s, 'horzpos'),
          horzsize: num(s, 'horzsize'),
          textheight: num(s, 'textheight', 1000),
          baseline: num(s, 'baseline', 850),
        }));
    }
  }
  return { chars, segs, objs, paraPrId: p.getAttribute('paraPrIDRef') };
}

interface CellModel {
  el: Element;
  ca: number; ra: number; cs: number; rs: number;
  w: number; h: number;
  bfId: string | null;
  sub: Element | null;
  marginL: number; marginR: number; marginT: number; marginB: number;
}

function collectCells(tbl: Element): CellModel[] {
  const inMargin = findChildByLocalName(tbl, 'inMargin');
  const defL = num(inMargin, 'left', 141), defR = num(inMargin, 'right', 141);
  const defT = num(inMargin, 'top', 141), defB = num(inMargin, 'bottom', 141);
  const cells: CellModel[] = [];
  for (const tr of elements(tbl)) {
    if (ln(tr) !== 'tr') continue;
    for (const tc of elements(tr)) {
      if (ln(tc) !== 'tc') continue;
      const addr = findChildByLocalName(tc, 'cellAddr');
      const span = findChildByLocalName(tc, 'cellSpan');
      const csz = findChildByLocalName(tc, 'cellSz');
      const cm = findChildByLocalName(tc, 'cellMargin');
      if (!addr || !csz) continue;
      cells.push({
        el: tc,
        ca: Math.max(0, num(addr, 'colAddr')),
        ra: Math.max(0, num(addr, 'rowAddr')),
        cs: Math.max(1, num(span, 'colSpan', 1)),
        rs: Math.max(1, num(span, 'rowSpan', 1)),
        w: num(csz, 'width'),
        h: num(csz, 'height'),
        bfId: tc.getAttribute('borderFillIDRef'),
        sub: findChildByLocalName(tc, 'subList'),
        marginL: cm ? num(cm, 'left', defL) : defL,
        marginR: cm ? num(cm, 'right', defR) : defR,
        marginT: cm ? num(cm, 'top', defT) : defT,
        marginB: cm ? num(cm, 'bottom', defB) : defB,
      });
    }
  }
  return cells;
}

function cellContentExtent(cell: CellModel): number {
  if (!cell.sub) return 0;
  let ext = 0;
  for (const p of elements(cell.sub)) {
    if (ln(p) !== 'p') continue;
    const m = buildPara(p);
    for (const s of m.segs) ext = Math.max(ext, s.vertpos + s.textheight);
    const baseV = m.segs[0]?.vertpos ?? 0;
    for (const o of m.objs) {
      if (o.inline) {
        const h = o.tag === 'tbl' ? Math.max(o.height, measureTableHeight(o.el)) : o.height;
        ext = Math.max(ext, baseV + h);
      }
    }
  }
  return ext;
}

function measureTableHeight(tbl: Element): number {
  const cells = collectCells(tbl);
  if (cells.length === 0 || cells.length > 4096) return 0;
  const nRows = Math.max(...cells.map((c) => c.ra + c.rs));
  const rowH = solveRowHeights(
    cells.map((c) => ({ rowAddr: c.ra, rowSpan: c.rs, height: c.h, contentH: c.rs === 1 ? cellContentExtent(c) : undefined })),
    nRows
  );
  return rowH.reduce((a, b) => a + b, 0);
}

// ─── Reflow Fallback for Uncached Paragraphs ────────────────────

function reflowPara(p: Element, doc: Document, styles: RenderStyles, areaW: number, startV: number) {
  const m = buildPara(p);
  if (m.segs.length > 0) return null;

  const realIdx: number[] = [];
  let text = '';
  for (let i = 0; i < m.chars.length; i++) {
    const ch = m.chars[i].ch;
    if (ch === '') continue;
    for (let u = 0; u < ch.length; u++) realIdx.push(i);
    text += ch;
  }

  const geom = styles.paraGeom.get(m.paraPrId ?? '') ?? DEFAULT_PARA_GEOM;
  let domChar = DEFAULT_CHAR;
  for (const c of m.chars) {
    if (c.ch !== '' && c.prId != null) {
      const st = styles.charPr.get(c.prId);
      if (st) { domChar = st; break; }
    }
  }
  const height = domChar.height || 1000;
  const ratio = domChar.ratio || 100;
  const spacingPct = domChar.spacing || 0;
  const marginL = geom.marginLeft;
  const avail = Math.max(1000, areaW - marginL - geom.marginRight);
  const contWidth = Math.max(500, avail + Math.min(0, geom.marginIntent));
  const contHorz = marginL - Math.min(0, geom.marginIntent);

  const wrap = text.length === 0
    ? { lines: 1, starts: [0] }
    : simulateWrap(text, avail, contWidth, height, ratio, spacingPct);

  const pitch = geom.lineSpacingType === 'PERCENT'
    ? Math.round((height * geom.lineSpacingValue) / 100)
    : Math.round(height * 1.6);
  const baseline = Math.round(height * 0.85);
  const spacing = Math.max(0, pitch - height);

  let floatBelow = 0;
  let objBottom = startV;
  for (const o of m.objs) {
    const effH = o.tag === 'tbl' ? Math.max(o.height, measureTableHeight(o.el)) : o.height;
    const om = findChildByLocalName(o.el, 'outMargin');
    const outT = num(om, 'top'), outB = num(om, 'bottom');
    if (o.inline) {
      objBottom = Math.max(objBottom, startV + outT + effH + outB + spacing);
      continue;
    }
    const wrapAttr = o.el.getAttribute('textWrap') ?? '';
    if (wrapAttr === 'TOP_AND_BOTTOM') {
      floatBelow = Math.max(floatBelow, outT + effH + outB);
    } else {
      objBottom = Math.max(objBottom, startV + outT + effH + outB);
    }
  }
  const textStartV = startV + floatBelow;
  const lsa = doc.createElement('hp:linesegarray');
  for (let li = 0; li < wrap.starts.length; li++) {
    const startReal = wrap.starts[li];
    const textpos = startReal < realIdx.length ? realIdx[startReal] : 0;
    const vertpos = textStartV + li * pitch;
    const isFirst = li === 0;
    const seg = doc.createElement('hp:lineseg');
    seg.setAttribute('textpos', String(textpos));
    seg.setAttribute('vertpos', String(vertpos));
    seg.setAttribute('vertsize', String(height));
    seg.setAttribute('textheight', String(height));
    seg.setAttribute('baseline', String(baseline));
    seg.setAttribute('spacing', String(spacing));
    seg.setAttribute('horzpos', String(isFirst ? marginL : contHorz));
    seg.setAttribute('horzsize', String(isFirst ? avail : contWidth));
    seg.setAttribute('flags', '393216');
    lsa.appendChild(seg);
  }
  p.appendChild(lsa);
  return { paraBottom: Math.max(textStartV + wrap.starts.length * pitch, objBottom), spaceAfter: geom.spaceAfter };
}

function reflowBlockFlow(container: Element, doc: Document, styles: RenderStyles, areaW: number, bodyH: number): void {
  let cursorV = 0;
  let prevSpaceAfter = 0;
  for (const p of elements(container)) {
    if (ln(p) !== 'p') continue;
    for (const run of elements(p)) {
      if (ln(run) !== 'run') continue;
      for (const obj of elements(run)) {
        if (ln(obj) !== 'tbl') continue;
        for (const tr of elements(obj)) {
          if (ln(tr) !== 'tr') continue;
          for (const tc of elements(tr)) {
            if (ln(tc) !== 'tc') continue;
            const csz = findChildByLocalName(tc, 'cellSz');
            const cm = findChildByLocalName(tc, 'cellMargin');
            const cellW = num(csz, 'width');
            const mL = cm ? num(cm, 'left', 141) : 141;
            const mR = cm ? num(cm, 'right', 141) : 141;
            const sub = findChildByLocalName(tc, 'subList');
            if (sub) reflowBlockFlow(sub, doc, styles, Math.max(500, cellW - mL - mR), 0);
          }
        }
      }
    }
    const g = styles.paraGeom.get(p.getAttribute('paraPrIDRef') ?? '');
    const startV = cursorV + prevSpaceAfter + (g?.spaceBefore ?? 0);
    const res = reflowPara(p, doc, styles, areaW, startV);
    if (!res) {
      const lsa = findChildByLocalName(p, 'linesegarray');
      if (lsa) {
        let bottom = Number.NEGATIVE_INFINITY;
        for (const seg of elements(lsa)) {
          if (ln(seg) !== 'lineseg') continue;
          const th = Math.max(num(seg, 'vertsize', 1000), num(seg, 'textheight', 1000));
          bottom = Math.max(bottom, num(seg, 'vertpos') + th + num(seg, 'spacing'));
        }
        if (Number.isFinite(bottom)) {
          cursorV = bottom;
          prevSpaceAfter = g?.spaceAfter ?? 0;
        }
      }
      continue;
    }
    const paraH = res.paraBottom - startV;
    if (bodyH > 0 && startV > 0 && res.paraBottom > bodyH && paraH <= bodyH) {
      for (const lsa of elements(p)) {
        if (ln(lsa) !== 'linesegarray') continue;
        for (const seg of elements(lsa)) {
          if (ln(seg) === 'lineseg') seg.setAttribute('vertpos', String(num(seg, 'vertpos') - startV));
        }
      }
      cursorV = paraH;
    } else {
      cursorV = res.paraBottom;
    }
    prevSpaceAfter = res.spaceAfter;
  }
}

// ─── SVG Drawing Engine ─────────────────────────────────────────

const pt = (u: number): string => String(Math.round(u) / 100);
const ptNum = (u: number): number => Math.round(u) / 100;

interface DrawCtx {
  pages: string[][];
  page: number;
  geom: PageGeom;
  styles: RenderStyles;
  images: Map<string, { dataUri: string; symId?: string }>;
  defs: string[];
  pageH: number;
}

function emit(ctx: DrawCtx, s: string): void {
  ctx.pages[ctx.page].push(s);
}

function charW(c: ParaChar, styles: RenderStyles): number {
  const st = (c.prId != null ? styles.charPr.get(c.prId) : undefined) ?? DEFAULT_CHAR;
  return measureTextWidth(c.ch, st.height, st.ratio, st.spacing);
}

function drawPara(p: Element, ox: number, oy: number, areaW: number, ctx: DrawCtx, depth: number, segPages?: number[]): void {
  if (depth > 16) return;
  const m = buildPara(p);
  if (m.segs.length === 0) {
    for (const o of m.objs) drawObject(o, ox, oy, ctx, depth);
    return;
  }
  const align = (m.paraPrId != null ? ctx.styles.paraAlign.get(m.paraPrId) : undefined) ?? 'JUSTIFY';
  const plans = m.segs.map((seg, idx) => {
    const start = seg.textpos;
    const end = idx + 1 < m.segs.length ? m.segs[idx + 1].textpos : Math.max(m.chars.length, start);
    let textW = 0, objW = 0;
    for (let i = start; i < end && i < m.chars.length; i++) textW += charW(m.chars[i], ctx.styles);
    for (const o of m.objs) if (o.inline && o.index >= start && o.index < end) objW += o.omL + o.width + o.omR;
    const isLast = idx === m.segs.length - 1;
    let xoff = 0, scale = 1;
    const avail = seg.horzsize - objW;
    if (textW > 0 && (!isLast || align === 'DISTRIBUTE' || align === 'DISTRIBUTE_SPACE')) {
      scale = avail > 0 ? avail / textW : 1;
    } else if (textW + objW > 0 && isLast) {
      const w = textW + objW;
      if (align === 'CENTER') xoff = Math.max(0, (seg.horzsize - w) / 2);
      else if (align === 'RIGHT') xoff = Math.max(0, seg.horzsize - w);
    }
    scale = Math.min(4, Math.max(0.25, Number.isFinite(scale) && scale > 0 ? scale : 1));
    return { seg, xoff, scale, start, end };
  });

  const baseV = m.segs[0].vertpos;

  for (let li = 0; li < plans.length; li++) {
    const plan = plans[li];
    if (segPages && segPages[li] !== undefined) ctx.page = segPages[li];
    const { seg } = plan;
    let i = plan.start;
    let cursor = ox + seg.horzpos + plan.xoff;
    const y = oy + seg.vertpos + seg.baseline;
    while (i < plan.end && i < m.chars.length) {
      if (m.chars[i].ch === '') {
        for (const o of m.objs) if (o.inline && o.index === i) cursor += o.omL + o.width + o.omR;
        i++;
        continue;
      }
      const prId = m.chars[i].prId;
      let j = i;
      let piece = '';
      while (j < plan.end && j < m.chars.length && m.chars[j].prId === prId && m.chars[j].ch !== '') {
        piece += m.chars[j].ch;
        j++;
      }
      const cut = piece.search(/ {2,}/);
      if (cut > 0) { piece = piece.slice(0, cut); j = i + cut; }
      else if (cut === 0) {
        const runEnd = piece.match(/^ +/)![0].length;
        piece = piece.slice(0, runEnd);
        j = i + runEnd;
      }
      const st = (prId != null ? ctx.styles.charPr.get(prId) : undefined) ?? DEFAULT_CHAR;
      const sw = measureTextWidth(piece, st.height, st.ratio, st.spacing) * plan.scale;
      if (piece.trim().length > 0) {
        const attrs: string[] = [`x="${pt(cursor)}"`, `y="${pt(y)}"`, `font-size="${pt(st.height)}"`];
        if (st.fontFamily) attrs.push(`font-family="${escapeXml(st.fontFamily)}"`);
        if ([...piece].length > 1 && sw > 50) {
          attrs.push(`textLength="${pt(sw)}"`, `lengthAdjust="${plan.scale < 1 ? 'spacingAndGlyphs' : 'spacing'}"`);
        }
        if (st.bold) attrs.push(`font-weight="bold"`);
        if (st.italic) attrs.push(`font-style="italic"`);
        if (st.underline) attrs.push(`text-decoration="underline"`);
        if (st.color) attrs.push(`fill="${escapeXml(st.color)}"`);
        emit(ctx, `<text ${attrs.join(' ')}>${escapeXml(piece)}</text>`);
      }
      cursor += sw;
      i = j;
    }
  }

  for (const o of m.objs) {
    if (o.inline) {
      let planIdx = 0;
      for (let k = 0; k < plans.length; k++) {
        const pl = plans[k];
        if (pl.start <= o.index && (o.index < pl.end || k === plans.length - 1)) planIdx = k;
      }
      const plan = plans[planIdx];
      if (segPages && segPages[planIdx] !== undefined) ctx.page = segPages[planIdx];
      let adv = 0;
      for (let k = plan.start; k < o.index && k < m.chars.length; k++) adv += charW(m.chars[k], ctx.styles) * plan.scale;
      for (const prevObj of m.objs) if (prevObj.inline && prevObj.index >= plan.start && prevObj.index < o.index) adv += prevObj.omL + prevObj.width + prevObj.omR;
      const x = ox + plan.seg.horzpos + plan.xoff + adv + o.omL;
      const yTop = oy + plan.seg.vertpos + Math.max(0, plan.seg.baseline - o.height);
      drawObject(o, x, yTop, ctx, depth);
    } else {
      if (segPages && segPages[0] !== undefined) ctx.page = segPages[0];
      const { x, y } = anchorObject(o, ox, oy, baseV, areaW, ctx);
      drawObject(o, x, y, ctx, depth);
    }
  }
}

function anchorObject(o: ParaObj, ox: number, oy: number, baseV: number, areaW: number, ctx: DrawCtx): { x: number; y: number } {
  const { PW, PH, ML, MT, BODY_W, BODY_H } = ctx.geom;
  const pos = findChildByLocalName(o.el, 'pos');
  const om = findChildByLocalName(o.el, 'outMargin');
  const omT = num(om, 'top'), omB = num(om, 'bottom');
  const w = o.width, h = o.tag === 'tbl' ? Math.max(o.height, measureTableHeight(o.el)) : o.height;
  if (!pos) return { x: ox, y: oy + baseV };
  const vo = num(pos, 'vertOffset');
  const ho = num(pos, 'horzOffset');
  const vrel = pos.getAttribute('vertRelTo') ?? 'PARA';
  const hrel = pos.getAttribute('horzRelTo') ?? 'PARA';
  const va = pos.getAttribute('vertAlign') ?? 'TOP';
  const ha = pos.getAttribute('horzAlign') ?? 'LEFT';
  const wrap = o.el.getAttribute('textWrap') ?? 'TOP_AND_BOTTOM';

  let y: number;
  if (vrel === 'PAPER') y = va === 'BOTTOM' ? PH - h - vo : va === 'CENTER' ? (PH - h) / 2 + vo : vo;
  else if (vrel === 'PAGE') y = va === 'BOTTOM' ? MT + BODY_H - h - vo : va === 'CENTER' ? MT + (BODY_H - h) / 2 + vo : MT + vo;
  else if (wrap === 'TOP_AND_BOTTOM') {
    const pushed = baseV - (omT + h + omB);
    const anchor = pushed >= -100 ? pushed : baseV;
    y = oy + anchor + omT + vo;
  } else {
    y = oy + baseV + vo;
  }

  let x: number;
  if (hrel === 'PAGE') x = ha === 'RIGHT' ? ML + BODY_W - w - ho : ha === 'CENTER' ? ML + (BODY_W - w) / 2 + ho : ML + ho;
  else if (hrel === 'PAPER') x = ha === 'RIGHT' ? PW - w - ho : ha === 'CENTER' ? (PW - w) / 2 + ho : ho;
  else x = ha === 'RIGHT' ? ox + areaW - w - ho : ha === 'CENTER' ? ox + (areaW - w) / 2 + ho : ox + ho;
  return { x, y };
}

function drawObject(o: ParaObj, x: number, y: number, ctx: DrawCtx, depth: number): void {
  if (o.tag === 'tbl') drawTable(o.el, x, y, ctx, depth + 1);
  else if (o.tag === 'pic') drawPic(o.el, x, y, ctx);
  else if (o.tag === 'container') {
    for (const ch of elements(o.el)) {
      const tag = ln(ch);
      if (!OBJ_TAGS.has(tag)) continue;
      const sz = findChildByLocalName(ch, 'sz');
      const off = findChildByLocalName(ch, 'offset');
      const sub: ParaObj = { el: ch, tag, index: 0, inline: true, width: num(sz, 'width'), height: num(sz, 'height'), omL: 0, omR: 0 };
      drawObject(sub, x + num(off, 'x'), y + num(off, 'y'), ctx, depth + 1);
    }
  } else if (SHAPE_TAGS.has(o.tag)) {
    drawShape(o, x, y, ctx, depth);
  }
}

function drawShape(o: ParaObj, x: number, y: number, ctx: DrawCtx, depth: number): void {
  const el = o.el;
  const orgSz = findChildByLocalName(el, 'orgSz');
  const curSz = findChildByLocalName(el, 'curSz');
  const ow = num(orgSz, 'width'), oh = num(orgSz, 'height');
  const w = num(curSz, 'width') || ow || o.width;
  const h = num(curSz, 'height') || oh || o.height;
  const sx = ow > 0 ? w / ow : 1;
  const sy = oh > 0 ? h / oh : 1;

  const lineShape = findChildByLocalName(el, 'lineShape');
  const lstyle = lineShape?.getAttribute('style') ?? 'SOLID';
  const strokeCol = lineShape?.getAttribute('color') || '#000000';
  const hasStroke = lstyle !== 'NONE';
  const strokeW = hasStroke ? Math.max(0.2, (num(lineShape, 'width', 33) / 100) * MM_TO_PT) : 0;
  const dash = /DASH|DOT/.test(lstyle) ? ` stroke-dasharray="${lstyle.includes('DOT') ? '1,1.5' : '3,1.5'}"` : '';
  const strokeAttr = hasStroke ? ` stroke="${escapeXml(strokeCol)}" stroke-width="${strokeW.toFixed(2)}"${dash}` : '';

  const winBrush = findFirst(el, 'winBrush');
  const face = winBrush?.getAttribute('faceColor');
  const fill = face && face.toLowerCase() !== 'none' ? face : 'none';
  const fillAttr = ` fill="${fill === 'none' ? 'none' : escapeXml(fill)}"`;

  if (o.tag === 'rect') emit(ctx, `<rect x="${pt(x)}" y="${pt(y)}" width="${pt(w)}" height="${pt(h)}"${fillAttr}${strokeAttr}/>`);
  else if (o.tag === 'ellipse' || o.tag === 'arc') emit(ctx, `<ellipse cx="${pt(x + w / 2)}" cy="${pt(y + h / 2)}" rx="${pt(w / 2)}" ry="${pt(h / 2)}"${fillAttr}${strokeAttr}/>`);
  else if (o.tag === 'line') {
    const s = findChildByLocalName(el, 'startPt'), e = findChildByLocalName(el, 'endPt');
    const x1 = x + num(s, 'x') * sx, y1 = y + num(s, 'y') * sy;
    const x2 = x + num(e, 'x') * sx, y2 = y + num(e, 'y') * sy;
    emit(ctx, `<line x1="${pt(x1)}" y1="${pt(y1)}" x2="${pt(x2)}" y2="${pt(y2)}" stroke="${escapeXml(strokeCol)}" stroke-width="${(strokeW || 0.3).toFixed(2)}"${dash}/>`);
  } else if (o.tag === 'polygon' || o.tag === 'curv') {
    const pts: string[] = [];
    for (const c of elements(el)) if (ln(c) === 'pt') pts.push(`${pt(x + num(c, 'x') * sx)},${pt(y + num(c, 'y') * sy)}`);
    if (pts.length >= 2) emit(ctx, `<polygon points="${pts.join(' ')}"${fillAttr}${strokeAttr}/>`);
  }
  const dt = findChildByLocalName(el, 'drawText');
  const sub = dt ? findChildByLocalName(dt, 'subList') : null;
  if (sub) {
    for (const p of elements(sub)) if (ln(p) === 'p') drawPara(p, x, y, w, ctx, depth + 1);
  }
}

function edgeLine(x1: number, y1: number, x2: number, y2: number, e: RenderBorderEdge): string {
  const dash = /DASH|DOT/.test(e.type) ? ` stroke-dasharray="${e.type.includes('DOT') ? '1,1.5' : '3,1.5'}"` : '';
  return `<line x1="${pt(x1)}" y1="${pt(y1)}" x2="${pt(x2)}" y2="${pt(y2)}" stroke="${escapeXml(e.color)}" stroke-width="${e.widthPt.toFixed(2)}"${dash}/>`;
}

function drawTable(tbl: Element, tx: number, ty: number, ctx: DrawCtx, depth: number): void {
  if (depth > 16) return;
  const tblSz = findChildByLocalName(tbl, 'sz');
  const cells = collectCells(tbl);
  if (cells.length === 0 || cells.length > 4096) return;

  const nCols = Math.max(...cells.map((c) => c.ca + c.cs));
  const nRows = Math.max(...cells.map((c) => c.ra + c.rs));
  const colX = solveBoundaries(cells.map((c) => ({ a: c.ca, b: c.ca + c.cs, size: c.w })), nCols, num(tblSz, 'width') || undefined);
  const rowH = solveRowHeights(
    cells.map((c) => ({ rowAddr: c.ra, rowSpan: c.rs, height: c.h, contentH: c.rs === 1 ? cellContentExtent(c) : undefined })),
    nRows
  );
  const rowY: number[] = [0];
  for (let r = 0; r < nRows; r++) rowY.push(rowY[r] + rowH[r]);

  const geom = cells.map((c) => ({
    c,
    x: tx + colX[c.ca],
    y: ty + rowY[c.ra],
    w: colX[Math.min(c.ca + c.cs, nCols)] - colX[c.ca],
    h: rowY[Math.min(c.ra + c.rs, nRows)] - rowY[c.ra],
  }));

  for (const g of geom) {
    const bf = g.c.bfId != null ? ctx.styles.borderFill.get(g.c.bfId) : undefined;
    if (bf?.fill) emit(ctx, `<rect x="${pt(g.x)}" y="${pt(g.y)}" width="${pt(g.w)}" height="${pt(g.h)}" fill="${escapeXml(bf.fill)}"/>`);
  }
  for (const g of geom) {
    const { c } = g;
    if (!c.sub) continue;
    const innerH = g.h - c.marginT - c.marginB;
    const extent = cellContentExtent(c);
    const va = c.sub.getAttribute('vertAlign') ?? 'TOP';
    let yoff = 0;
    if (va === 'CENTER') yoff = Math.max(0, (innerH - extent) / 2);
    else if (va === 'BOTTOM') yoff = Math.max(0, innerH - extent);
    for (const p of elements(c.sub)) {
      if (ln(p) !== 'p') continue;
      drawPara(p, g.x + c.marginL, g.y + c.marginT + yoff, g.w - c.marginL - c.marginR, ctx, depth + 1);
    }
  }
  for (const g of geom) {
    const bf = g.c.bfId != null ? ctx.styles.borderFill.get(g.c.bfId) : undefined;
    if (!bf) continue;
    if (bf.top) emit(ctx, edgeLine(g.x, g.y, g.x + g.w, g.y, bf.top));
    if (bf.bottom) emit(ctx, edgeLine(g.x, g.y + g.h, g.x + g.w, g.y + g.h, bf.bottom));
    if (bf.left) emit(ctx, edgeLine(g.x, g.y, g.x, g.y + g.h, bf.left));
    if (bf.right) emit(ctx, edgeLine(g.x + g.w, g.y, g.x + g.w, g.y + g.h, bf.right));
  }
}

function drawPic(pic: Element, x: number, y: number, ctx: DrawCtx): void {
  const sz = findChildByLocalName(pic, 'sz');
  const w = num(sz, 'width', 5669), h = num(sz, 'height', 5669);
  const img = findFirst(pic, 'img');
  const ref = img?.getAttribute('binaryItemIDRef');
  const loaded = ref != null ? ctx.images.get(ref) : undefined;
  if (!loaded) {
    emit(ctx, `<rect x="${pt(x)}" y="${pt(y)}" width="${pt(w)}" height="${pt(h)}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.5"/>`);
    return;
  }
  if (!loaded.symId) {
    loaded.symId = `bin${ctx.defs.length}`;
    ctx.defs.push(
      `<symbol id="${loaded.symId}" viewBox="0 0 100 100" preserveAspectRatio="none">` +
      `<image width="100" height="100" preserveAspectRatio="none" href="${loaded.dataUri}"/></symbol>`
    );
  }
  const clip = findChildByLocalName(pic, 'imgClip');
  const imgDim = findChildByLocalName(pic, 'imgDim');
  const orgSz = findChildByLocalName(pic, 'orgSz');
  const dimW = num(imgDim, 'dimwidth'), dimH = num(imgDim, 'dimheight');
  const refW = dimW > 0 ? dimW : num(orgSz, 'width');
  const refH = dimH > 0 ? dimH : num(orgSz, 'height');
  const cl = num(clip, 'left'), ct = num(clip, 'top');
  const cr = num(clip, 'right', refW), cb = num(clip, 'bottom', refH);
  const cropped = refW > 0 && refH > 0 && clip != null && (cl > 0 || ct > 0 || cr < refW || cb < refH) && cr > cl && cb > ct;
  if (cropped) {
    emit(
      ctx,
      `<svg x="${pt(x)}" y="${pt(y)}" width="${pt(w)}" height="${pt(h)}" viewBox="${pt(cl)} ${pt(ct)} ${pt(cr - cl)} ${pt(cb - ct)}" preserveAspectRatio="none">` +
      `<use href="#${loaded.symId}" x="0" y="0" width="${pt(refW)}" height="${pt(refH)}"/></svg>`
    );
  } else {
    emit(ctx, `<use href="#${loaded.symId}" x="${pt(x)}" y="${pt(y)}" width="${pt(w)}" height="${pt(h)}"/>`);
  }
}

interface PageSvgItem {
  svg: string;
  widthPt: number;
  heightPt: number;
}

function renderSectionRootsToPageSvgs(
  sections: { root: Element; index: number }[],
  styles: RenderStyles,
  images: Map<string, { dataUri: string; symId?: string }>
): PageSvgItem[] {
  const defs: string[] = [];
  const renderedSections: { pages: string[][]; PW: number; pageH: number }[] = [];

  for (const { root } of sections) {
    const pagePr = findFirst(root, 'pagePr');
    const margin = pagePr ? findChildByLocalName(pagePr, 'margin') : null;
    let PW = num(pagePr, 'width', 59528), PH = num(pagePr, 'height', 84188);
    if (pagePr?.getAttribute('landscape') === 'NARROWLY' && PW < PH) {
      const t = PW; PW = PH; PH = t;
    }
    const ML = num(margin, 'left', 8504);
    const MT = num(margin, 'top', 5668) + num(margin, 'header', 0);
    const BODY_H = PH - MT - num(margin, 'bottom', 4252) - num(margin, 'footer', 0);
    const BODY_W = PW - ML - num(margin, 'right', 8504);
    const geom: PageGeom = { PW, PH, ML, MT, BODY_W, BODY_H };

    const doc = root.ownerDocument as unknown as Document;
    reflowBlockFlow(root, doc, styles, BODY_W, BODY_H);

    const colPr = findFirst(root, 'colPr');
    const multiCol = num(colPr, 'colCount', 1) > 1;
    const paraSegPages = new Map<Element, number[]>();
    let nPages = 1;
    let maxTopV = 0;
    let prevV = Number.NEGATIVE_INFINITY;
    let prevH = Number.NEGATIVE_INFINITY;
    let cur = 0;
    for (const p of elements(root)) {
      if (ln(p) !== 'p') continue;
      const lsa = findChildByLocalName(p, 'linesegarray');
      const segEls = lsa ? elements(lsa).filter((s) => ln(s) === 'lineseg') : [];
      const pagesOf: number[] = [];
      let paraFirst = true;
      for (const s of segEls) {
        const v = num(s, 'vertpos');
        const h = num(s, 'horzpos');
        const brk = v < prevV ? (!multiCol || h <= prevH) : (paraFirst && v === prevV && h <= prevH);
        if (brk) cur++;
        paraFirst = false;
        pagesOf.push(cur);
        maxTopV = Math.max(maxTopV, v + num(s, 'textheight', 1000));
        prevV = v;
        prevH = h;
      }
      paraSegPages.set(p, pagesOf);
      nPages = Math.max(nPages, cur + 1);
    }

    const pageH = nPages === 1 ? Math.max(PH, MT + maxTopV + 2000) : PH;
    const ctx: DrawCtx = {
      pages: Array.from({ length: nPages }, () => []),
      page: 0,
      geom,
      styles,
      images,
      defs,
      pageH,
    };
    for (const p of elements(root)) {
      if (ln(p) !== 'p') continue;
      drawPara(p, ML, MT, BODY_W, ctx, 0, paraSegPages.get(p));
    }
    renderedSections.push({ pages: ctx.pages, PW, pageH });
  }

  const out: PageSvgItem[] = [];
  let pageNo = 0;
  for (const rs of renderedSections) {
    for (const buf of rs.pages) {
      pageNo++;
      const body = buf.join('\n');
      const used = new Set<string>();
      for (const m of body.matchAll(/href="#(bin\d+)"/g)) used.add(m[1]);
      const pageDefs = defs.filter((d) => {
        const m = /<symbol id="(bin\d+)"/.exec(d);
        return m ? used.has(m[1]) : true;
      });
      const clipId = `pgclip${pageNo}`;
      const widthPt = ptNum(rs.PW);
      const heightPt = ptNum(rs.pageH);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pt(rs.PW)} ${pt(rs.pageH)}" width="${widthPt * 2}px" height="${heightPt * 2}px" font-family="${SVG_FONT_FAMILY}" xml:space="preserve">\n` +
        `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${pt(rs.PW)}" height="${pt(rs.pageH)}"/></clipPath>${pageDefs.join('')}</defs>\n` +
        `<rect width="${pt(rs.PW)}" height="${pt(rs.pageH)}" fill="white"/>\n` +
        `<g clip-path="url(#${clipId})">\n${body}\n</g>\n</svg>`;
      out.push({ svg, widthPt, heightPt });
    }
  }
  return out;
}

// ─── HWPX (ZIP) Loader ──────────────────────────────────────────

function sniffMime(name: string, bytes: Uint8Array): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png') || (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50)) return 'image/png';
  if (lower.endsWith('.bmp') || (bytes.length > 2 && bytes[0] === 0x42 && bytes[1] === 0x4d)) return 'image/bmp';
  if (lower.endsWith('.gif') || (bytes.length > 3 && bytes[0] === 0x47 && bytes[1] === 0x49)) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

async function renderHwpxToPageSvgs(input: Uint8Array): Promise<PageSvgItem[]> {
  const zip = await JSZip.loadAsync(input);
  const secFiles = zip.file(/Contents\/section\d+\.xml$/i).sort((a, b) => a.name.localeCompare(b.name));
  if (secFiles.length === 0) throw new Error('HWPX 섹션(Contents/section0.xml)을 찾을 수 없습니다.');

  const headFile = zip.file('Contents/header.xml') ?? zip.file('Contents/head.xml');
  const styles: RenderStyles = headFile
    ? parseRenderStyles(await headFile.async('string'))
    : { charPr: new Map(), paraAlign: new Map(), paraGeom: new Map(), borderFill: new Map() };

  const secXmls: string[] = [];
  for (const f of secFiles) secXmls.push(await f.async('string'));

  const binmap = new Map<string, string>();
  const hpf = zip.file(/content\.hpf$/i)[0];
  if (hpf) {
    const man = await hpf.async('string');
    for (const m of man.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\bhref="(BinData\/[^"]+)"[^>]*>/g)) binmap.set(m[1], m[2]);
    for (const m of man.matchAll(/<[^>]*\bhref="(BinData\/[^"]+)"[^>]*\bid="([^"]+)"[^>]*>/g)) binmap.set(m[2], m[1]);
  }

  const images = new Map<string, { dataUri: string; symId?: string }>();
  const refs = new Set<string>();
  for (const xml of secXmls) for (const m of xml.matchAll(/binaryItemIDRef="([^"]+)"/g)) refs.add(m[1]);
  for (const ref of refs) {
    let href = binmap.get(ref);
    if (!href) {
      const cand = zip.file(new RegExp(`BinData/.*${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))[0];
      href = cand?.name;
    }
    if (!href) continue;
    const f = zip.file(href) ?? zip.file('Contents/' + href);
    if (!f) continue;
    const bytes = await f.async('uint8array');
    images.set(ref, { dataUri: `data:${sniffMime(href, bytes)};base64,${encodeBase64(bytes)}` });
  }

  const roots: { root: Element; index: number }[] = [];
  for (let si = 0; si < secXmls.length; si++) {
    const doc = createXmlParser().parseFromString(secXmls[si], 'text/xml');
    const root = doc.documentElement as unknown as Element;
    if (root) roots.push({ root, index: si });
  }
  return renderSectionRootsToPageSvgs(roots, styles, images);
}

// ─── HWP 5.x (OLE2/CFB) Loader ──────────────────────────────────

interface HwpRecord {
  tagId: number;
  level: number;
  size: number;
  data: Uint8Array;
}

function readRecords(data: Uint8Array): HwpRecord[] {
  const records: HwpRecord[] = [];
  let offset = 0;
  while (offset + 4 <= data.length && records.length < 500_000) {
    const header = u32(data, offset);
    offset += 4;
    const tagId = header & 0x3ff;
    const level = (header >> 10) & 0x3ff;
    let size = (header >> 20) & 0xfff;
    if (size === 0xfff) {
      if (offset + 4 > data.length) break;
      size = u32(data, offset);
      offset += 4;
    }
    if (offset + size > data.length) break;
    records.push({ tagId, level, size, data: data.subarray(offset, offset + size) });
    offset += size;
  }
  return records;
}

function cid(s: string): number {
  return ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
}
function swap32(id: number): number {
  return (((id & 0xff) << 24) | (((id >>> 8) & 0xff) << 16) | (((id >>> 16) & 0xff) << 8) | ((id >>> 24) & 0xff)) >>> 0;
}

const CTRL_TBL = cid('tbl '), CTRL_GSO = cid('gso '), CTRL_SECD = cid('secd'), CTRL_COLD = cid('cold'), CTRL_EQED = cid('eqed');
const CHID_PIC = cid('$pic'), CHID_REC = cid('$rec'), CHID_LIN = cid('$lin'), CHID_ELL = cid('$ell'),
  CHID_POL = cid('$pol'), CHID_CUR = cid('$cur'), CHID_ARC = cid('$arc'), CHID_CON = cid('$con');
const KNOWN_IDS = new Set([CTRL_TBL, CTRL_GSO, CTRL_SECD, CTRL_COLD, CTRL_EQED, CHID_PIC, CHID_REC, CHID_LIN, CHID_ELL, CHID_POL, CHID_CUR, CHID_ARC, CHID_CON]);

function normId(raw: number): number {
  if (KNOWN_IDS.has(raw)) return raw;
  const sw = swap32(raw);
  return KNOWN_IDS.has(sw) ? sw : raw;
}

function colorHex(c: number): string | null {
  if ((c >>> 24) !== 0) return null;
  const h = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${h(c & 0xff)}${h((c >>> 8) & 0xff)}${h((c >>> 16) & 0xff)}`;
}

function borderEdgeOf(d: Uint8Array, o: number): RenderBorderEdge | undefined {
  const type = d[o];
  if (!type) return undefined;
  const mm = BORDER_WIDTH_MM[d[o + 1]] ?? 0.12;
  return { type: BORDER_TYPE[type] ?? 'SOLID', widthPt: mm * MM_TO_PT, color: colorHex(u32(d, o + 2)) ?? '#000000' };
}

function buildHwp5RenderStyles(records: HwpRecord[]): { styles: RenderStyles; binDataList: { kind: string; storageId: number }[] } {
  const idm = records.find((r) => r.tagId === TAG_ID_MAPPINGS);
  const hangulCount = idm && idm.data.length >= 8 ? u32(idm.data, 4) : Number.POSITIVE_INFINITY;
  const faces: string[] = [];
  const binDataList: { kind: string; storageId: number }[] = [];

  for (const r of records) {
    if (r.tagId === TAG_FACE_NAME && faces.length < hangulCount) {
      if (r.data.length >= 3) {
        const len = u16(r.data, 1);
        const end = 3 + len * 2;
        faces.push(end <= r.data.length ? decodeUtf16LE(r.data, 3, end) : '');
      }
    } else if (r.tagId === TAG_BIN_DATA && r.data.length >= 2) {
      const attr = u16(r.data, 0);
      const typeBits = attr & 0x000f;
      if (typeBits === 0) binDataList.push({ kind: 'link', storageId: 0 });
      else binDataList.push({ kind: typeBits === 2 ? 'storage' : 'embed', storageId: r.data.length >= 4 ? u16(r.data, 2) : 0 });
    }
  }

  const charPr: RenderStyles['charPr'] = new Map();
  let ci = 0;
  for (const r of records) {
    if (r.tagId !== TAG_DOC_CHAR_SHAPE) continue;
    const d = r.data;
    const id = String(ci++);
    if (d.length < 50) {
      charPr.set(id, { ...DEFAULT_CHAR });
      continue;
    }
    const face = faces[u16(d, 0)];
    const rel = d[28] || 100;
    const attr = u32(d, 46);
    const color = d.length >= 56 ? colorHex(u32(d, 52)) : null;
    charPr.set(id, {
      height: Math.max(100, Math.round((i32(d, 42) * rel) / 100)),
      bold: (attr & 2) !== 0,
      italic: (attr & 1) !== 0,
      underline: ((attr >>> 2) & 3) !== 0,
      ratio: d[14] || 100,
      spacing: i8(d, 21),
      ...(color && color !== '#000000' ? { color } : {}),
      fontFamily: hwpFaceToCssStack(face),
      face,
    });
  }

  const paraAlign: RenderStyles['paraAlign'] = new Map();
  const paraGeom: RenderStyles['paraGeom'] = new Map();
  let pi = 0;
  for (const r of records) {
    if (r.tagId !== TAG_DOC_PARA_SHAPE) continue;
    const d = r.data;
    const id = String(pi++);
    if (d.length < 28) {
      paraAlign.set(id, 'JUSTIFY');
      paraGeom.set(id, { ...DEFAULT_PARA_GEOM });
      continue;
    }
    const attr1 = u32(d, 0);
    paraAlign.set(id, PARA_ALIGNS[(attr1 >>> 2) & 7] ?? 'JUSTIFY');
    paraGeom.set(id, {
      lineSpacingType: LINE_SPACING_TYPES[attr1 & 3] ?? 'PERCENT',
      lineSpacingValue: d.length >= 54 ? u32(d, 50) : i32(d, 24),
      marginLeft: i32(d, 4),
      marginRight: i32(d, 8),
      marginIntent: i32(d, 12),
      spaceBefore: i32(d, 16),
      spaceAfter: i32(d, 20),
    });
  }

  const borderFill: RenderStyles['borderFill'] = new Map();
  let bi = 0;
  for (const r of records) {
    if (r.tagId !== TAG_BORDER_FILL) continue;
    const d = r.data;
    const bf: RenderBorderFill = {};
    if (d.length >= 26) {
      bf.left = borderEdgeOf(d, 2);
      bf.right = borderEdgeOf(d, 8);
      bf.top = borderEdgeOf(d, 14);
      bf.bottom = borderEdgeOf(d, 20);
      if (d.length >= 40 && (u32(d, 32) & 1)) {
        const bg = colorHex(u32(d, 36));
        if (bg) bf.fill = bg;
      }
    }
    borderFill.set(String(++bi), bf);
  }

  return { styles: { charPr, paraAlign, paraGeom, borderFill }, binDataList };
}

function isExtendedOnlyCtrlChar(ch: number): boolean {
  return (ch >= 1 && ch <= 3) || (ch >= 11 && ch <= 12) || (ch >= 14 && ch <= 18) || (ch >= 21 && ch <= 23);
}

const VREL = ['PAPER', 'PAGE', 'PARA', 'PARA'], HREL = ['PAPER', 'PAGE', 'COLUMN', 'PARA'];
const VALIGN = ['TOP', 'CENTER', 'BOTTOM', 'TOP', 'BOTTOM'], HALIGN = ['LEFT', 'CENTER', 'RIGHT', 'LEFT', 'RIGHT'];
const WRAP = ['SQUARE', 'TOP_AND_BOTTOM', 'BEHIND_TEXT', 'IN_FRONT_OF_TEXT'];
const CELL_VALIGN = ['TOP', 'CENTER', 'BOTTOM', 'TOP'];

function objCommon(d: Uint8Array) {
  if (d.length < 36) {
    return {
      tac: true, wrap: 'SQUARE', w: 0, h: 0,
      posXml: `<hp:sz width="0" height="0"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`,
    };
  }
  const a = u32(d, 4);
  const tac = (a & 1) !== 0;
  const w = u32(d, 16), h = u32(d, 20);
  const posXml =
    `<hp:sz width="${w}" height="${h}"/>` +
    `<hp:pos treatAsChar="${tac ? 1 : 0}" vertRelTo="${VREL[(a >>> 3) & 3]}" horzRelTo="${HREL[(a >>> 8) & 3]}" vertAlign="${VALIGN[(a >>> 5) & 7] ?? 'TOP'}" horzAlign="${HALIGN[(a >>> 10) & 7] ?? 'LEFT'}" vertOffset="${i32(d, 8)}" horzOffset="${i32(d, 12)}"/>` +
    `<hp:outMargin left="${u16(d, 28)}" right="${u16(d, 30)}" top="${u16(d, 32)}" bottom="${u16(d, 34)}"/>`;
  return { tac, wrap: WRAP[(a >>> 21) & 7] ?? 'SQUARE', w, h, posXml };
}

function textChar(ch: number): string {
  if (ch >= 0xa000 && ch <= 0xa48c) {
    const mapped = mapPuaText(String.fromCodePoint(ch + (0xf0000 - 0xa000)));
    return /[\u{F0000}-\u{FFFFF}]/u.test(mapped) ? '' : mapped;
  }
  if (ch === 0xfffe || ch === 0xffff || (ch >= 0xd800 && ch <= 0xdfff)) return ' ';
  return String.fromCharCode(ch);
}

interface CtrlRef { idx: number; id: number; start: number; end: number; used?: boolean }

function paragraphsXml(records: HwpRecord[], start: number, end: number, level: number, imageRef: (id: number) => string | null, depth: number): string {
  if (depth > 16) return '';
  let out = '';
  let i = start;
  while (i < end) {
    const r = records[i];
    if (r.tagId === TAG_PARA_HEADER && r.level === level) {
      let j = i + 1;
      while (j < end && records[j].level > level) j++;
      out += paragraphXml(records, i, j, level, imageRef, depth);
      i = j;
    } else i++;
  }
  return out;
}

function paragraphXml(records: HwpRecord[], i: number, j: number, level: number, imageRef: (id: number) => string | null, depth: number): string {
  const hdr = records[i];
  const paraShapeId = hdr.data.length >= 10 ? u16(hdr.data, 8) : 0;
  const texts: Uint8Array[] = [];
  const shapes: Array<[number, number]> = [];
  const segs: Uint8Array[] = [];
  const ctrls: CtrlRef[] = [];
  let k = i + 1;
  while (k < j) {
    const r = records[k];
    if (r.level === level + 1) {
      if (r.tagId === TAG_PARA_TEXT) texts.push(r.data);
      else if (r.tagId === TAG_CHAR_SHAPE) {
        for (let o = 0; o + 8 <= r.data.length; o += 8) shapes.push([u32(r.data, o), u32(r.data, o + 4)]);
      } else if (r.tagId === TAG_PARA_LINE_SEG) segs.push(r.data);
      else if (r.tagId === TAG_CTRL_HEADER && r.data.length >= 4) {
        let e = k + 1;
        while (e < j && records[e].level > level + 1) e++;
        ctrls.push({ idx: k, id: normId(u32(r.data, 0)), start: k + 1, end: e });
        k = e;
        continue;
      }
    }
    k++;
  }

  const totalTextLen = texts.reduce((acc, t) => acc + t.length, 0);
  const text = new Uint8Array(totalTextLen);
  let offset = 0;
  for (const t of texts) { text.set(t, offset); offset += t.length; }

  const ctrlElement = (ctrlIdx: number, rawId: number): string => {
    const id = normId(rawId);
    let c: CtrlRef | undefined = ctrls[ctrlIdx];
    if (!c || c.used || c.id !== id) c = ctrls.find((x) => !x.used && x.id === id);
    if (!c) return '<hp:ctrl/>';
    c.used = true;
    switch (c.id) {
      case CTRL_TBL: return tableXml(records, c, level, imageRef, depth);
      case CTRL_GSO: return gsoXml(records, c, level, imageRef, depth);
      case CTRL_SECD: return secPrXml(records, c);
      case CTRL_COLD: {
        const a = records[c.idx].data.length >= 8 ? u32(records[c.idx].data, 4) : 0;
        return `<hp:colPr colCount="${Math.max(1, (a >>> 2) & 0xff)}"/>`;
      }
      case CTRL_EQED: {
        const oc = objCommon(records[c.idx].data);
        return `<hp:equation textWrap="${oc.wrap}">${oc.posXml}</hp:equation>`;
      }
      default: return '<hp:ctrl/>';
    }
  };

  let out = `<hp:p paraPrIDRef="${paraShapeId}" styleIDRef="0">`;
  let shapeIdx = 0;
  let run: string[] = [];
  let textBuf = '';
  const flushText = () => { if (textBuf) { run.push(`<hp:t>${escapeXml(textBuf)}</hp:t>`); textBuf = ''; } };
  const openRun = (id: number) => { out += `<hp:run charPrIDRef="${id}">`; };
  const closeRun = () => { flushText(); out += run.join('') + '</hp:run>'; run = []; };
  openRun(shapes[0]?.[1] ?? 0);

  let pos = 0, ctrlIdx = 0, o = 0;
  const switchShape = () => {
    while (shapeIdx + 1 < shapes.length && pos >= shapes[shapeIdx + 1][0]) {
      shapeIdx++;
      closeRun();
      openRun(shapes[shapeIdx][1]);
    }
  };
  while (o + 1 < text.length) {
    switchShape();
    const ch = u16(text, o);
    o += 2;
    if (ch === 0x0d) break;
    if (ch >= 0x20) {
      if (ch >= 0xd800 && ch <= 0xdbff && o + 1 < text.length) {
        const lo = u16(text, o);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          textBuf += String.fromCharCode(ch, lo);
          o += 2;
          pos += 2;
          continue;
        }
      }
      textBuf += textChar(ch);
      pos++;
      continue;
    }
    switch (ch) {
      case 0x09: flushText(); run.push('<hp:tab/>'); o += 14; pos += 8; break;
      case 0x0a:
        flushText(); run.push('<hp:lineBreak/>'); pos++;
        if (o + 16 <= text.length && u16(text, o) === 0x000b) {
          run.push(ctrlElement(ctrlIdx++, u32(text, o + 2)));
          o += 16;
          pos += 8;
        }
        break;
      case 0x00: flushText(); run.push('<hp:lineBreak/>'); pos++; break;
      case 0x1e: flushText(); run.push('<hp:nbSpace/>'); pos++; break;
      case 0x1f: flushText(); run.push('<hp:fwSpace/>'); pos++; break;
      case 0x18: case 0x19: case 0x1a: case 0x1b: case 0x1c: case 0x1d:
        flushText(); run.push('<hp:hyphen/>'); pos++; break;
      default: {
        const isInline = (ch >= 4 && ch <= 9) || ch === 19 || ch === 20;
        if ((isExtendedOnlyCtrlChar(ch) || isInline) && o + 14 <= text.length) {
          flushText();
          if (isExtendedOnlyCtrlChar(ch)) run.push(ctrlElement(ctrlIdx++, u32(text, o)));
          else run.push('<hp:ctrl/>');
          o += 14;
          pos += 8;
        } else pos++;
      }
    }
  }
  closeRun();

  const rest = ctrls.filter((c) => !c.used && (c.id === CTRL_TBL || c.id === CTRL_GSO || c.id === CTRL_SECD || c.id === CTRL_COLD));
  if (rest.length > 0) {
    openRun(shapes[0]?.[1] ?? 0);
    for (const c of rest) run.push(ctrlElement(ctrls.indexOf(c), c.id));
    closeRun();
  }
  if (segs.length > 0) {
    out += '<hp:linesegarray>';
    for (const s of segs) {
      for (let off = 0; off + 36 <= s.length; off += 36) {
        out += `<hp:lineseg textpos="${u32(s, off)}" vertpos="${i32(s, off + 4)}" vertsize="${i32(s, off + 8)}" textheight="${i32(s, off + 12)}" baseline="${i32(s, off + 16)}" spacing="${i32(s, off + 20)}" horzpos="${i32(s, off + 24)}" horzsize="${i32(s, off + 28)}" flags="${u32(s, off + 32)}"/>`;
      }
    }
    out += '</hp:linesegarray>';
  }
  return out + '</hp:p>';
}

function secPrXml(records: HwpRecord[], c: CtrlRef): string {
  for (let k = c.start; k < c.end; k++) {
    const r = records[k];
    if (r.tagId !== TAG_PAGE_DEF || r.data.length < 36) continue;
    const d = r.data;
    const landscape = d.length >= 40 && (u32(d, 36) & 1) === 1 ? 'NARROWLY' : 'WIDELY';
    return `<hp:secPr><hp:pagePr landscape="${landscape}" width="${u32(d, 0)}" height="${u32(d, 4)}"><hp:margin left="${u32(d, 8)}" right="${u32(d, 12)}" top="${u32(d, 16)}" bottom="${u32(d, 20)}" header="${u32(d, 24)}" footer="${u32(d, 28)}" gutter="${u32(d, 32)}"/></hp:pagePr></hp:secPr>`;
  }
  return '<hp:secPr/>';
}

function tableXml(records: HwpRecord[], c: CtrlRef, level: number, imageRef: (id: number) => string | null, depth: number): string {
  const common = objCommon(records[c.idx].data);
  let tableIdx = -1;
  for (let k = c.start; k < c.end; k++) if (records[k].tagId === TAG_TABLE && records[k].data.length >= 18) { tableIdx = k; break; }
  if (tableIdx < 0) return '<hp:ctrl/>';
  const t = records[tableIdx].data;
  const rows = u16(t, 4), cols = u16(t, 6);
  const inMargin = `<hp:inMargin left="${u16(t, 10)}" right="${u16(t, 12)}" top="${u16(t, 14)}" bottom="${u16(t, 16)}"/>`;
  const cellLevel = level + 2;
  let cells = '';
  let k = tableIdx + 1;
  while (k < c.end) {
    const r = records[k];
    if (r.tagId === TAG_LIST_HEADER && r.level === cellLevel) {
      let e = k + 1;
      while (e < c.end) {
        const x = records[e];
        if (x.level < cellLevel) break;
        if (x.level === cellLevel && (x.tagId === TAG_LIST_HEADER || x.tagId === TAG_TABLE)) break;
        e++;
      }
      const d = records[k].data;
      if (d.length >= 34) {
        const attr = u32(d, 2);
        const vAlign = CELL_VALIGN[(attr >>> 5) & 3];
        const paras = paragraphsXml(records, k + 1, e, cellLevel, imageRef, depth + 1);
        cells +=
          `<hp:tc borderFillIDRef="${u16(d, 32)}"><hp:subList vertAlign="${vAlign}">${paras}</hp:subList>` +
          `<hp:cellAddr colAddr="${u16(d, 8)}" rowAddr="${u16(d, 10)}"/><hp:cellSpan colSpan="${Math.max(1, u16(d, 12))}" rowSpan="${Math.max(1, u16(d, 14))}"/>` +
          `<hp:cellSz width="${u32(d, 16)}" height="${u32(d, 20)}"/><hp:cellMargin left="${u16(d, 24)}" right="${u16(d, 26)}" top="${u16(d, 28)}" bottom="${u16(d, 30)}"/></hp:tc>`;
      }
      k = e;
      continue;
    }
    k++;
  }
  if (!cells) return '<hp:ctrl/>';
  return `<hp:tbl textWrap="${common.wrap}" rowCnt="${rows}" colCnt="${cols}" cellSpacing="0">${common.posXml}${inMargin}<hp:tr>${cells}</hp:tr></hp:tbl>`;
}

interface ShapeComp { idx: number; chid: number; xoff: number; yoff: number; orgW: number; orgH: number; curW: number; curH: number }

function readShapeComp(records: HwpRecord[], idx: number, nested = false): ShapeComp | null {
  const d = records[idx].data;
  const b = nested ? 0 : 4;
  if (d.length < b + 32) return null;
  return {
    idx, chid: normId(u32(d, b)),
    xoff: i32(d, b + 4), yoff: i32(d, b + 8),
    orgW: u32(d, b + 16), orgH: u32(d, b + 20),
    curW: u32(d, b + 24), curH: u32(d, b + 28),
  };
}

function shapeElement(records: HwpRecord[], sc: ShapeComp, scIdx: number, end: number, posXml: string, drawText: string, imageRef: (id: number) => string | null, wrap?: string): string {
  const sizes = `<hp:orgSz width="${sc.orgW}" height="${sc.orgH}"/><hp:curSz width="${sc.curW}" height="${sc.curH}"/>`;
  const wa = wrap ? ` textWrap="${wrap}"` : '';
  const find = (tag: number): Uint8Array | null => {
    for (let k = scIdx + 1; k < end; k++) if (records[k].tagId === tag) return records[k].data;
    return null;
  };
  if (sc.chid === CHID_PIC) {
    const p = find(TAG_SHAPE_COMPONENT_PICTURE);
    let img = '<hp:img/>', clip = '';
    if (p && p.length >= 73) {
      const ref = imageRef(u16(p, 71));
      img = ref ? `<hp:img binaryItemIDRef="${ref}"/>` : '<hp:img/>';
      const cl = i32(p, 44), ct = i32(p, 48), cr = i32(p, 52), cb = i32(p, 56);
      if ((cl > 0 || ct > 0 || cr > 0 || cb > 0) && sc.orgW - cr > cl && sc.orgH - cb > ct) {
        clip = `<hp:imgClip left="${Math.max(0, cl)}" top="${Math.max(0, ct)}" right="${sc.orgW - Math.max(0, cr)}" bottom="${sc.orgH - Math.max(0, cb)}"/>`;
      }
    }
    return `<hp:pic${wa}>${posXml}${sizes}<hp:imgDim dimwidth="${sc.orgW}" dimheight="${sc.orgH}"/>${clip}${img}</hp:pic>`;
  }
  const line = `<hp:lineShape color="#000000" width="12" style="SOLID"/>`;
  if (sc.chid === CHID_LIN) {
    const l = find(TAG_SHAPE_COMPONENT_LINE);
    const pts = l && l.length >= 16
      ? `<hp:startPt x="${i32(l, 0)}" y="${i32(l, 4)}"/><hp:endPt x="${i32(l, 8)}" y="${i32(l, 12)}"/>`
      : `<hp:startPt x="0" y="0"/><hp:endPt x="${sc.orgW}" y="${sc.orgH}"/>`;
    return `<hp:line${wa}>${posXml}${sizes}${line}${pts}</hp:line>`;
  }
  if (sc.chid === CHID_POL || sc.chid === CHID_CUR) {
    const g = find(sc.chid === CHID_POL ? TAG_SHAPE_COMPONENT_POLYGON : TAG_SHAPE_COMPONENT_CURVE);
    let pts = '';
    if (g && g.length >= 2) {
      const n = Math.min(i16(g, 0), 4096);
      for (let k = 0; k < n && 2 + k * 8 + 8 <= g.length; k++) {
        pts += `<hp:pt x="${i32(g, 2 + k * 8)}" y="${i32(g, 6 + k * 8)}"/>`;
      }
    }
    const tag = sc.chid === CHID_POL ? 'polygon' : 'curv';
    return `<hp:${tag}${wa}>${posXml}${sizes}${line}${pts}${drawText}</hp:${tag}>`;
  }
  const tag = sc.chid === CHID_REC ? 'rect' : sc.chid === CHID_ELL ? 'ellipse' : sc.chid === CHID_ARC ? 'arc' : 'ole';
  return `<hp:${tag}${wa}>${posXml}${sizes}${line}${drawText}</hp:${tag}>`;
}

function gsoXml(records: HwpRecord[], c: CtrlRef, level: number, imageRef: (id: number) => string | null, depth: number): string {
  const common = objCommon(records[c.idx].data);
  let scIdx = -1;
  for (let k = c.start; k < c.end; k++) if (records[k].tagId === TAG_SHAPE_COMPONENT) { scIdx = k; break; }
  const sc = scIdx >= 0 ? readShapeComp(records, scIdx) : null;
  if (!sc) return `<hp:ole textWrap="${common.wrap}">${common.posXml}</hp:ole>`;
  let textList = -1;
  for (let k = scIdx + 1; k < c.end; k++) if (records[k].tagId === TAG_LIST_HEADER && records[k].level === level + 2) { textList = k; break; }
  const geomEnd = textList >= 0 ? textList : c.end;
  const drawText = textList >= 0 ? `<hp:drawText><hp:subList>${paragraphsXml(records, textList + 1, c.end, level + 2, imageRef, depth + 1)}</hp:subList></hp:drawText>` : '';
  return shapeElement(records, sc, scIdx, geomEnd, common.posXml, drawText, imageRef, common.wrap);
}

function detectImageMime(data: Uint8Array): string | null {
  if (data.length < 4) return null;
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (data[0] === 0x42 && data[1] === 0x4d) return 'image/bmp';
  return null;
}

function renderHwp5ToPageSvgs(input: Uint8Array): PageSvgItem[] {
  const cfb = CFB.parse(input, { type: 'array' });
  const findEntry = (path: string): Uint8Array | null => {
    const entry = CFB.find(cfb, path);
    return entry?.content ? new Uint8Array(entry.content as ArrayLike<number>) : null;
  };

  const headerData = findEntry('/FileHeader');
  if (!headerData || headerData.length < 40) throw new Error('HWP FileHeader 스트림을 찾을 수 없습니다.');
  const sig = new TextDecoder('utf-8').decode(headerData.subarray(0, 32)).replace(/\0+$/, '');
  if (sig !== 'HWP Document File') throw new Error('유효한 HWP 5.x 문서가 아닙니다.');
  const flags = u32(headerData, 36);
  if (flags & FLAG_DRM) throw new Error('DRM으로 보호된 한글 문서는 웹에서 열 수 없습니다.');
  if (flags & FLAG_ENCRYPTED) throw new Error('암호로 보호된 한글 문서는 웹에서 열 수 없습니다.');

  const compressed = (flags & FLAG_COMPRESSED) !== 0;
  const distribution = (flags & FLAG_DISTRIBUTION) !== 0;

  const rawDocInfo = findEntry('/DocInfo');
  const docInfoBytes = rawDocInfo ? (compressed ? decompressStream(rawDocInfo) : rawDocInfo) : new Uint8Array(0);
  const docInfoRecords = docInfoBytes.length > 0 ? readRecords(docInfoBytes) : [];
  const { styles, binDataList } = buildHwp5RenderStyles(docInfoRecords);

  const binDataMap = new Map<number, { data: Uint8Array; name: string }>();
  const binRe = /(?:^|\/)BIN([0-9A-Fa-f]{4,8})(?:\.[^./\\]*)?$/;
  for (const entry of cfb.FileIndex || []) {
    if (!entry?.name || !entry.content) continue;
    const m = entry.name.match(binRe);
    if (!m) continue;
    const idx = parseInt(m[1], 16);
    let data = new Uint8Array(entry.content as ArrayLike<number>);
    if (!detectImageMime(data)) {
      try {
        const inf = decompressStream(data);
        if (inf.length > 0) data = inf;
      } catch {
        // Uncompressed
      }
    }
    binDataMap.set(idx, { data, name: entry.name });
  }

  const images = new Map<string, { dataUri: string; symId?: string }>();
  const imageRef = (binDataId: number): string | null => {
    if (binDataId <= 0) return null;
    const item = binDataList[binDataId - 1];
    if (item?.kind === 'link') return null;
    const storageId = item && item.storageId > 0 ? item.storageId : binDataId;
    const ref = `bin${storageId}`;
    if (images.has(ref)) return ref;
    const entry = binDataMap.get(storageId);
    if (!entry) return ref;
    const mime = detectImageMime(entry.data);
    if (!mime) return null;
    images.set(ref, { dataUri: `data:${mime};base64,${encodeBase64(entry.data)}` });
    return ref;
  };

  const secRecords: HwpRecord[][] = [];
  for (let i = 0; i < 64; i++) {
    if (distribution) {
      const raw = findEntry(`/ViewText/Section${i}`);
      if (!raw) break;
      secRecords.push(readRecords(decryptViewText(raw, compressed)));
    } else {
      const raw = findEntry(`/BodyText/Section${i}`);
      if (!raw) break;
      secRecords.push(readRecords(compressed ? decompressStream(raw) : raw));
    }
  }
  if (secRecords.length === 0) throw new Error('HWP 본문 섹션을 찾을 수 없습니다.');

  const roots: { root: Element; index: number }[] = [];
  for (let si = 0; si < secRecords.length; si++) {
    const xml =
      `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
      paragraphsXml(secRecords[si], 0, secRecords[si].length, 0, imageRef, 0) +
      `</hs:sec>`;
    const doc = createXmlParser().parseFromString(xml, 'text/xml');
    const root = doc.documentElement as unknown as Element;
    if (root) roots.push({ root, index: si });
  }
  return renderSectionRootsToPageSvgs(roots, styles, images);
}

// ─── SVG Pages → Canvas Rasterize → PDF-lib Synthesis ───────────

async function svgPageToPngBytes(pageSvg: PageSvgItem): Promise<Uint8Array> {
  const scale = 2.0; // High-DPI classroom projection clarity
  const widthPx = Math.max(100, Math.round(pageSvg.widthPt * scale));
  const heightPx = Math.max(100, Math.round(pageSvg.heightPt * scale));

  const blob = new Blob([pageSvg.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('한글 페이지 SVG 이미지를 렌더링하지 못했습니다.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 컨텍스트를 생성할 수 없습니다.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 인코딩 실패'))), 'image/png');
    });
    canvas.width = 0;
    canvas.height = 0;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function convertHwpToPdfInBrowser(
  sourceBytes: Uint8Array,
  format: 'hwp' | 'hwpx'
): Promise<{ bytes: Uint8Array; layout: 'passed' | 'overlap' | 'unavailable' }> {
  const isHwpxMagic =
    sourceBytes.length >= 4 &&
    sourceBytes[0] === 0x50 &&
    sourceBytes[1] === 0x4b &&
    sourceBytes[2] === 0x03 &&
    sourceBytes[3] === 0x04;
  const isHwp5Magic =
    sourceBytes.length >= 8 &&
    sourceBytes[0] === 0xd0 &&
    sourceBytes[1] === 0xcf &&
    sourceBytes[2] === 0x11 &&
    sourceBytes[3] === 0xe0;

  let pageSvgs: PageSvgItem[];
  if (isHwpxMagic || (format === 'hwpx' && !isHwp5Magic)) {
    pageSvgs = await renderHwpxToPageSvgs(sourceBytes);
  } else if (isHwp5Magic || format === 'hwp') {
    pageSvgs = renderHwp5ToPageSvgs(sourceBytes);
  } else {
    throw new Error('지원하지 않는 한글 문서 형식입니다. HWP 5.x 또는 HWPX 파일을 선택해 주세요.');
  }

  if (pageSvgs.length === 0) {
    throw new Error('변환된 한글 문서 페이지가 없습니다.');
  }

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (const pageSvg of pageSvgs) {
    const pngBytes = await svgPageToPngBytes(pageSvg);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([pageSvg.widthPt, pageSvg.heightPt]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageSvg.widthPt,
      height: pageSvg.heightPt,
    });
  }

  const pdfBytes = new Uint8Array(await pdfDoc.save());
  return { bytes: pdfBytes, layout: 'passed' };
}
