/* ============================================================================
   mkik-log - a Kamarai Tudástár közös naplója

   Két művelet:
     insert - egy kérdés-esemény rögzítése
     list   - az utolsó N bejegyzés, gépfüggetlenül

   A böngésző soha nem beszél közvetlenül a táblával: a szolgáltatói kulcs
   itt marad, a felület csak ezt a végpontot ismeri.
   ============================================================================ */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* Kisbetűs, ékezet nélküli alak - az ismétlődő kérdések felismeréséhez. */
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RESULTS = ["ok", "weak", "nocov", "circle"];

async function db(path: string, init: RequestInit = {}) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "csak POST" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "érvénytelen JSON" }, 400); }

  const action = String(body.action || "");

  /* ------------------------------------------------------------ listázás */
  if (action === "list") {
    const limit = Math.min(Math.max(parseInt(String(body.limit ?? 200), 10) || 200, 1), 500);
    const res = await db(
      `mkik_queries?select=id,asked_at,question,result,user_id,user_name,user_role,chamber,` +
      `doc_title,section,page,doc_version,stale_since,stale_reason,client` +
      `&order=asked_at.desc&limit=${limit}`
    );
    if (!res.ok) return json({ error: "lekérdezés sikertelen", detail: await res.text() }, 500);
    return json({ ok: true, rows: await res.json() });
  }

  /* ------------------------------------------------------------ rögzítés */
  if (action !== "insert") return json({ error: "ismeretlen művelet" }, 400);

  const row = (body.row || {}) as Record<string, unknown>;
  const question = String(row.question || "").trim();
  const result   = String(row.result || "");

  if (!question)                    return json({ error: "hiányzó kérdés" }, 400);
  if (question.length > 500)        return json({ error: "túl hosszú kérdés" }, 400);
  if (!RESULTS.includes(result))    return json({ error: "ismeretlen eredmény" }, 400);

  const rec = {
    question,
    q_norm:      norm(question),
    result,
    user_id:     row.user_id     ? String(row.user_id).slice(0, 80)     : null,
    user_name:   row.user_name   ? String(row.user_name).slice(0, 120)  : null,
    user_email:  row.user_email  ? String(row.user_email).slice(0, 160) : null,
    user_role:   row.user_role   ? String(row.user_role).slice(0, 120)  : null,
    chamber:     row.chamber     ? String(row.chamber).slice(0, 160)    : null,
    doc_id:      row.doc_id      ? String(row.doc_id).slice(0, 80)      : null,
    doc_title:   row.doc_title   ? String(row.doc_title).slice(0, 200)  : null,
    doc_version: row.doc_version ? String(row.doc_version).slice(0, 40) : null,
    section:     row.section     ? String(row.section).slice(0, 200)    : null,
    page:        Number.isFinite(Number(row.page)) ? Number(row.page) : null,
    coverage:    Number.isFinite(Number(row.coverage)) ? Number(row.coverage) : null,
    score:       Number.isFinite(Number(row.score))    ? Number(row.score)    : null,
    cost_ft:     Number.isFinite(Number(row.cost_ft))  ? Number(row.cost_ft)  : 0,
    client:      row.client ? String(row.client).slice(0, 60) : null,
  };

  const res = await db("mkik_queries", {
    method:  "POST",
    headers: { "Prefer": "return=representation" },
    body:    JSON.stringify(rec),
  });

  if (!res.ok) return json({ error: "mentés sikertelen", detail: await res.text() }, 500);
  const saved = await res.json();
  return json({ ok: true, id: Array.isArray(saved) && saved[0] ? saved[0].id : null });
});
