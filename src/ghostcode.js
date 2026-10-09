// Share a ghost lap as a text code (no servers): the recording is delta-encoded as small integers, deflated with
// the browser's built-in CompressionStream when there is one, and written as base64. Paste a friend's code to race it.
const PREFIX = "APXG1";

async function pipe(bytes, Stream, fmt) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream(fmt));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
const unb64 = (s) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

// ghost: { t, s: [x, y, z, h, ...] }, track id, car id, driver name
export async function encodeGhost(ghost, track, car, name = "Friend") {
  const ints = [], last = [0, 0, 0, 0], sc = [10, 10, 10, 100];
  for (let i = 0; i < ghost.s.length; i++) { const k = i % 4, v = Math.round(ghost.s[i] * sc[k]); ints.push(v - last[k]); last[k] = v; }
  const json = JSON.stringify({ k: track, c: car, n: String(name).slice(0, 16), t: ghost.t, d: ints });
  let bytes = new TextEncoder().encode(json), z = "0";
  if (typeof CompressionStream === "function") { try { bytes = await pipe(bytes, CompressionStream, "deflate-raw"); z = "1"; } catch (_) { /* send it uncompressed */ } }
  return `${PREFIX}${z}.${b64(bytes)}`;
}

// Returns { track, car, name, ghost: { t, s } } or throws Error("bad code")
export async function decodeGhost(code) {
  const m = String(code).trim().match(/^APXG1([01])\.([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("bad code");
  let bytes = unb64(m[2]);
  if (m[1] === "1") { if (typeof DecompressionStream !== "function") throw new Error("bad code"); bytes = await pipe(bytes, DecompressionStream, "deflate-raw"); }
  const o = JSON.parse(new TextDecoder().decode(bytes));
  if (!o || typeof o.k !== "string" || !Array.isArray(o.d) || o.d.length % 4 || !(o.t > 0)) throw new Error("bad code");
  const s = [], last = [0, 0, 0, 0], sc = [10, 10, 10, 100];
  o.d.forEach((dv, i) => { const k = i % 4; last[k] += Number(dv) || 0; s.push(last[k] / sc[k]); });
  return { track: o.k, car: String(o.c || ""), name: String(o.n || "Friend").slice(0, 16), ghost: { t: o.t, s } };
}
