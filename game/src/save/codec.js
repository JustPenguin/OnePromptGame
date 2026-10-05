// Save <-> shareable text code.  OWNER: Agent E.
// The game runs inside a sandboxed iframe: no downloads, no prompt(), maybe no clipboard.  So a save is exported as one
// line of text the player can copy (or select + Ctrl+C from a textarea) and pastes back in to restore it.
//
//   KRGP1.<base64url(deflate-raw(json))>.<crc32 hex>     (CompressionStream available)
//   KRGP0.<base64url(json utf8)>.<crc32 hex>             (plain fallback)
// The CRC catches truncated / mangled pastes before we ever try to parse.
const te = new TextEncoder();
const td = new TextDecoder();

let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function toB64Url(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** @param {object} data a save blob   @param {{ghosts?:boolean}} [opts] ghosts are big, so they are off by default */
export async function encodeSave(data, opts = {}) {
  const payload = opts.ghosts ? data : { ...data, ghosts: {} };
  let bytes = te.encode(JSON.stringify(payload));
  let tag = 'KRGP0';
  if (typeof CompressionStream !== 'undefined') {
    try { bytes = await pipe(bytes, new CompressionStream('deflate-raw')); tag = 'KRGP1'; } catch { /* keep plain */ }
  }
  return `${tag}.${toB64Url(bytes)}.${crc32(bytes)}`;
}

/** @returns {Promise<{ok:true,data:object}|{ok:false,error:string}>} */
export async function decodeSave(text) {
  try {
    const clean = String(text ?? '').replace(/\s+/g, '');
    const m = /^(KRGP[01])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(clean);
    if (!m) return { ok: false, error: clean.length < 12 ? 'That does not look like a Kart Rush save code.' : 'The code is incomplete or damaged. Copy it again in full.' };
    let bytes = fromB64Url(m[2]);
    if (crc32(bytes) !== m[3]) return { ok: false, error: 'The code is damaged (checksum mismatch). Copy it again in full.' };
    if (m[1] === 'KRGP1') {
      if (typeof DecompressionStream === 'undefined') return { ok: false, error: 'This browser cannot unpack compressed codes.' };
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    const data = JSON.parse(td.decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'The save inside the code is not valid.' };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: 'Could not read that code (' + (e?.message ?? 'unknown error') + ').' };
  }
}
