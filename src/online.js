// Online play over Supabase, with no SDK: plain fetch for sign-in and the REST API, and a small WebSocket client for
// Realtime broadcast (live race rooms). Everything is off until src/onlineconfig.js has a URL and key (see ONLINE.md).
// Sign-in is anonymous (no email or password): the session token is kept in localStorage on this device.
import { ONLINE } from "./onlineconfig.js";
import { TEST } from "./env.js";
// tests never talk to the real server: only to a stand-in when the page asks for one with ?online=1
const TEST_OFF = TEST && !new URLSearchParams(location.search).has("online");

// A secret key (sb_secret_..., or an old-style service_role JWT) gives full control of the database to whoever has it.
// It must never be in the game; if one is pasted in by mistake, online play stays off rather than use it.
export function isSecretKey(k) {
  if (/^sb_secret_/.test(k)) return true;
  try { return JSON.parse(atob(String(k).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch (_) { return false; }
}
export const onlineReady = () => !TEST_OFF && !!(ONLINE.url && ONLINE.anonKey) && !isSecretKey(ONLINE.anonKey);
const KEY = "apexOnline";
let sess = null;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; } };
const keep = (s) => { sess = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };

async function call(path, opt = {}, auth = true) {
  const headers = { apikey: ONLINE.anonKey, "Content-Type": "application/json", ...(opt.headers || {}) };
  if (auth && sess) headers.Authorization = "Bearer " + sess.access_token;
  const r = await fetch(ONLINE.url.replace(/\/$/, "") + path, { ...opt, headers });
  const text = await r.text(), body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error((body && (body.message || body.msg || body.error_description || body.error)) || "HTTP " + r.status);
  return body;
}

// signs in (anonymously, once per device) and refreshes the token when it's near expiry; returns the user id
export async function signIn() {
  if (!onlineReady()) throw new Error("Online play isn't set up yet");
  sess = sess || load();
  const now = Date.now() / 1000;
  if (sess && sess.expires_at > now + 60) return sess.user.id;
  if (sess && sess.refresh_token) {
    try { const s = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: sess.refresh_token }) }, false); keep(s); return s.user.id; } catch (_) { /* fall through to a new sign-in */ }
  }
  const s = await call("/auth/v1/signup", { method: "POST", body: JSON.stringify({ data: {} }) }, false);
  if (!s.access_token) throw new Error("Anonymous sign-in is switched off in the Supabase project");
  keep(s); return s.user.id;
}
export const token = () => (sess ? sess.access_token : undefined); // a publishable key is not a JWT, so only send a real session token

// creates or updates this driver's profile (name + friend code)
export async function saveProfile(name, code) {
  const id = await signIn();
  await call("/rest/v1/profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, name: name || "Driver", friend_code: code }) });
}
export async function postLap(track, seconds, car) {
  await signIn();
  await call("/rest/v1/laps", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ track, ms: Math.round(seconds * 1000), car }) });
}
const enc = encodeURIComponent;
export async function topLaps(track, limit = 100) {
  return call(`/rest/v1/leaderboard?track=eq.${enc(track)}&order=ms.asc&limit=${limit}&select=user_id,name,ms,car`, {}, !!sess);
}
export async function friendLaps(track) {
  const me = await signIn();
  const fr = await call("/rest/v1/friends?select=friend_id");
  const ids = [me, ...fr.map((f) => f.friend_id)].join(",");
  return call(`/rest/v1/leaderboard?track=eq.${enc(track)}&user_id=in.(${ids})&order=ms.asc&select=user_id,name,ms,car`);
}
export async function addFriend(code) {
  await signIn();
  return call("/rest/v1/rpc/add_friend", { method: "POST", body: JSON.stringify({ code }) });
}
export const myId = () => (sess && sess.user ? sess.user.id : null);

// ---------- live rooms: Supabase Realtime broadcast (Phoenix channel protocol over a WebSocket) ----------
export class Room {
  constructor(code, onMsg, onState) {
    this.code = code; this.onMsg = onMsg; this.onState = onState || (() => {});
    this.topic = "realtime:apex-" + code; this.ref = 0; this.open = false;
    const u = ONLINE.url.replace(/^http/, "ws").replace(/\/$/, "") + "/realtime/v1/websocket?apikey=" + enc(ONLINE.anonKey) + "&vsn=1.0.0";
    const ws = (this.ws = new WebSocket(u));
    ws.onopen = () => {
      this.send0({ topic: this.topic, event: "phx_join", payload: { config: { broadcast: { self: false, ack: false }, presence: { key: "" }, postgres_changes: [], private: false }, ...(token() ? { access_token: token() } : {}) }, ref: String(++this.ref), join_ref: "1" });
      this.beat = setInterval(() => this.send0({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++this.ref) }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.topic !== this.topic) return;
      if (m.event === "phx_reply" && m.payload && m.payload.status === "ok" && !this.open) { this.open = true; this.onState("open"); }
      else if (m.event === "phx_reply" && m.payload && m.payload.status === "error") this.onState("error", JSON.stringify(m.payload.response || {}));
      else if (m.event === "broadcast" && m.payload) this.onMsg(m.payload.event, m.payload.payload || {});
    };
    ws.onclose = () => { this.open = false; clearInterval(this.beat); this.onState("closed"); };
    ws.onerror = () => this.onState("error", "connection failed");
  }
  send0(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  // event: short name; payload: small plain object
  send(event, payload) { if (this.open) this.send0({ topic: this.topic, event: "broadcast", payload: { type: "broadcast", event, payload }, ref: String(++this.ref), join_ref: "1" }); }
  close() { clearInterval(this.beat); try { this.send0({ topic: this.topic, event: "phx_leave", payload: {}, ref: String(++this.ref), join_ref: "1" }); this.ws.close(); } catch (_) {} }
}
export function roomCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = ""; for (let i = 0; i < 5; i++) c += a[Math.floor(Math.random() * a.length)]; return c; }
