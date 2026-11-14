// WHY: the Worker only routes. The room name comes from the (stub-)authenticated key in the
// URL, never from an id the client chooses separately (design 5.6 item 1).
import { Relay } from "./relay.js";
export { Relay };
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const key = u.searchParams.get("key"); // stands in for the first device's public key
    if (!key) return new Response("no key", { status: 400 });
    const id = env.RELAY.idFromName(key); // real design: hash of the first device's public key
    return env.RELAY.get(id).fetch(req);
  },
};
