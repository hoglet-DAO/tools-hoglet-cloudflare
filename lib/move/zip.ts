/**
 * Minimal ZIP writer, store method only.
 *
 * Exists so a project can be exported as a real `.zip` without pulling in a dependency for what is a
 * fully specified, ~100-line format. Only "store" (no compression) is implemented: the payload is Move
 * source, which is small, and DEFLATE would mean shipping an implementation of it to save a few kilobytes.
 *
 * The layout is written out rather than summarised because every field is positional — one wrong offset
 * produces an archive that opens in some tools and not others, which is far worse than one that fails
 * outright.
 *
 *   [local header + data] * n
 *   [central directory header] * n
 *   [end of central directory]
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** UTF-8 filename flag, so non-ASCII paths survive the round trip. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

/** IEEE 802.3 polynomial, reflected. Standard CRC-32, which ZIP requires per entry. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS time and date, which is what the format stores. Fixed rather than "now" so exports are reproducible. */
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

export interface ZipEntry {
  /** Forward-slash path inside the archive. Backslashes would create flat, oddly named entries. */
  path: string;
  content: string;
}

/** Grows by doubling; the final size is not known until every entry is measured. */
class ByteWriter {
  private buf = new Uint8Array(1024);
  private len = 0;

  private ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u16(v: number) {
    this.ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
  }

  u32(v: number) {
    this.ensure(4);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 24) & 0xff;
  }

  bytes(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  get offset() {
    return this.len;
  }

  toUint8Array() {
    return this.buf.slice(0, this.len);
  }
}

/**
 * Builds a ZIP archive from text entries.
 *
 * Rejects duplicate paths rather than writing them: a ZIP with two entries under one name extracts
 * differently depending on the tool, so an archive whose contents depend on the extractor is not
 * something to hand a user silently.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const out = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.path.replace(/\\/g, "/"));
    if (seen.has(entry.path)) {
      throw new Error(`duplicate entry in archive: ${entry.path}`);
    }
    seen.add(entry.path);

    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const offset = out.offset;

    out.u32(LOCAL_SIG);
    out.u16(20); // version needed
    out.u16(FLAG_UTF8);
    out.u16(METHOD_STORE);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(crc);
    out.u32(data.length); // compressed == uncompressed under store
    out.u32(data.length);
    out.u16(name.length);
    out.u16(0); // extra field length
    out.bytes(name);
    out.bytes(data);

    central.push({ name, crc, size: data.length, offset });
  }

  const centralStart = out.offset;

  for (const entry of central) {
    out.u32(CENTRAL_SIG);
    out.u16(20); // version made by
    out.u16(20); // version needed
    out.u16(FLAG_UTF8);
    out.u16(METHOD_STORE);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(entry.crc);
    out.u32(entry.size);
    out.u32(entry.size);
    out.u16(entry.name.length);
    out.u16(0); // extra
    out.u16(0); // comment
    out.u16(0); // disk number start
    out.u16(0); // internal attributes
    out.u32(0); // external attributes
    out.u32(entry.offset);
    out.bytes(entry.name);
  }

  const centralSize = out.offset - centralStart;

  out.u32(EOCD_SIG);
  out.u16(0); // this disk
  out.u16(0); // disk with central directory
  out.u16(central.length);
  out.u16(central.length);
  out.u32(centralSize);
  out.u32(centralStart);
  out.u16(0); // comment length

  return out.toUint8Array();
}