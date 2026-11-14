import { startServer, Dev } from "./lib.mjs";
const s = await startServer({ capBytes: 5_000_000 });
try {
  const a = await new Dev(s.port, "setA", "devA").connect();
  const b = await new Dev(s.port, "setA", "devB").connect();
  console.log("presence", (await a.rpc({ op: "presence" })).h);
  const r = await a.rpc({ op: "hold", g: "chat:1", line: true }, new TextEncoder().encode("hello"));
  console.log("hold", r.h);
  const f = await b.rpc({ op: "fetch-after", g: "chat:1", seq: 0 });
  console.log("fetch", f.frames.length, f.h);
  const st = await a.rpc({ op: "stats" }); console.log(st.h.stats);
  a.close(); b.close();
} finally { s.stop(); }
