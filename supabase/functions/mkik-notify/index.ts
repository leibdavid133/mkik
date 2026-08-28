/* ============================================================================
   mkik-notify - a Kamarai Tudástár értesítései (Resend)

   Két művelet:
     gap       - fedezet nélküli kérdés: a szabályzat felelőse kap jelzést,
                 mert ez szabályozási hiányt jelent, nem rendszerhibát
     deprecate - új dokumentum-verzió: mindenki jelzést kap, aki a régiből
                 kapott korábban választ

   Demó-őszinteség: a bemutató fiókok mkik.hu-s címei nem léteznek, ezért
   minden levél a beállított valódi postafiókba megy, de a levélben ott áll,
   hogy éles rendszerben ki lenne a címzett.
   ============================================================================ */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM      = Deno.env.get("MKIK_MAIL_FROM") ?? "Kamarai Tudástár <kamara@lda-solution.com>";
const NOTIFY_TO      = Deno.env.get("MKIK_NOTIFY_TO") ?? "";

/* Szórásvédelem: a zsűri kérdezgetése ne árassza el a postafiókot. */
const DEDUPE_MINUTES = 10;
const MAX_PER_HOUR   = 10;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/* ---------------------------------------------------------------- levélsablon */

function shell(kicker: string, title: string, inner: string, intendedTo?: string): string {
  return `<!DOCTYPE html><html lang="hu"><body style="margin:0;background:#F0F3F4;font-family:'Open Sans','Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 0"><tr><td align="center">
  <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E0DDD6">
    <tr><td style="background:#346B54;padding:20px 30px">
      <p style="margin:0;font-family:'Roboto Condensed',Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#A9D6BF;font-weight:700">${esc(kicker)}</p>
      <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:19px;color:#fff;font-weight:700">${esc(title)}</p>
    </td></tr>
    <tr><td style="padding:24px 30px;color:#373737;font-size:14px;line-height:1.65">${inner}</td></tr>
    ${intendedTo ? `<tr><td style="background:#FBF0CE;padding:12px 30px;border-top:1px solid #E0DDD6">
      <p style="margin:0;font-size:12px;color:#6B6B6B"><b>Bemutató üzemmód.</b> Éles rendszerben ez a levél ide ment volna: <b>${esc(intendedTo)}</b></p>
    </td></tr>` : ""}
    <tr><td style="background:#F0F3F4;padding:14px 30px;border-top:1px solid #E0DDD6">
      <p style="margin:0;font-size:11px;color:#949494">Kamarai Tudástár &middot; belső dokumentumkereső &middot; automatikus értesítés</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function kv(label: string, value: string): string {
  return `<tr><td style="padding:5px 0;color:#6B6B6B;font-size:12.5px;width:150px;vertical-align:top">${esc(label)}</td>
          <td style="padding:5px 0;color:#373737;font-size:13.5px">${esc(value)}</td></tr>`;
}

async function sendMail(kind: string, subject: string, html: string, intendedTo: string | null, refId: number | null) {
  if (!RESEND_API_KEY || !NOTIFY_TO) {
    await logMail(kind, NOTIFY_TO || "(nincs beállítva)", intendedTo, subject, refId, false, "hiányzó RESEND_API_KEY vagy MKIK_NOTIFY_TO");
    return { ok: false, error: "e-mail nincs konfigurálva" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: MAIL_FROM, to: NOTIFY_TO, subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    await logMail(kind, NOTIFY_TO, intendedTo, subject, refId, res.ok, res.ok ? null : JSON.stringify(body));
    return res.ok ? { ok: true, id: body.id } : { ok: false, error: body };
  } catch (e) {
    await logMail(kind, NOTIFY_TO, intendedTo, subject, refId, false, String(e));
    return { ok: false, error: String(e) };
  }
}

async function logMail(kind: string, to: string, intended: string | null, subject: string,
                       refId: number | null, ok: boolean, error: string | null) {
  await db("mkik_notifications", {
    method: "POST",
    headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({ kind, to_email: to, intended_to: intended, subject,
                           ref_query_id: refId, ok, error }),
  }).catch(() => {});
}

/* ---------------------------------------------------------------- hiány-jelzés */

/* ---------------------------------------------------------------- beszélgetés
   Minden megválaszolt kérdésről megy egy levél: a kérdés, a rendszer válasza,
   és a hivatkozott dokumentum a szó szerinti részlettel. Így a beszélgetés
   e-mailben is visszakereshető, nem csak a naplóban. */
async function handleAnswer(body: Record<string, any>) {
  const query = String(body.query || "").trim();
  if (!query)             return json({ error: "hiányzó kérdés" }, 400);
  if (query.length > 500) return json({ error: "túl hosszú kérdés" }, 400);

  const user   = body.user || {};
  const src    = body.source || {};
  const valasz = String(body.answer || "").slice(0, 1500);
  const idezet = String(src.quote || "").slice(0, 1500);
  const gyenge = body.verdict === "weak";

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const cnt = await db(`mkik_notifications?select=id&kind=eq.answer&sent_at=gte.${hourAgo}`);
  if (cnt.ok) {
    const rows = await cnt.json();
    if (Array.isArray(rows) && rows.length >= MAX_PER_HOUR)
      return json({ ok: true, skipped: "óradarab-korlát" });
  }

  const inner = `
    <p style="margin:0 0 14px"><b>${esc(user.name || "ismeretlen munkatárs")}</b>
       (${esc(user.role || "-")}) kérdést tett fel a Kamarai Tudástárban.</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${kv("Kérdés", query)}
      ${kv("Kamara", user.chamber || "-")}
      ${kv("Megbízhatóság", gyenge ? "gyenge illeszkedés - ellenőrzendő" : "fedezet a szabályzatban")}
    </table>
    <p style="margin:18px 0 6px;font-size:12px;color:#6B6B6B;text-transform:uppercase;letter-spacing:.08em"><b>A rendszer válasza</b></p>
    <p style="margin:0 0 16px;padding:12px 14px;background:#F0F3F4;border-left:3px solid #5DB47C">${esc(valasz)}</p>
    <p style="margin:0 0 6px;font-size:12px;color:#6B6B6B;text-transform:uppercase;letter-spacing:.08em"><b>Hivatkozott dokumentum</b></p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${kv("Dokumentum", src.doc || "-")}
      ${kv("Szakasz", src.section || "-")}
      ${kv("Oldal", src.page ? String(src.page) + ". oldal" : "-")}
      ${kv("Verzió", src.version ? "v" + src.version + " - hatályos " + (src.effective || "-") : "-")}
    </table>
    ${idezet ? `<p style="margin:14px 0 0;padding:12px 14px;background:#fff;border:1px solid #E0DDD6;border-left:3px solid #B8873B;font-size:13px">
      <i>Szó szerint a szabályzatból:</i><br>${esc(idezet)}</p>` : ""}`;

  return await sendMail("answer", `Kérdés megválaszolva: "${query.slice(0, 80)}"`,
                        shell("Kamarai Tudástár", "Beszélgetés összefoglalója", inner), null, null);
}

/* ---------------------------------------------------------------- visszajelzés
   Ha nincs fedezet, a kérdező kap egy visszajelzést, hogy nem maradt
   válasz nélkül: a kollégák megkeresik. A levél a kamara arculatában megy. */
async function handleFollowup(body: Record<string, any>) {
  const query = String(body.query || "").trim();
  if (!query) return json({ error: "hiányzó kérdés" }, 400);

  const user = body.user || {};
  const cimzett = user.email || null;

  const inner = `
    <p style="margin:0 0 14px">Tisztelt ${esc(user.name || "Kollégánk")}!</p>
    <p style="margin:0 0 14px">Az alábbi kérdésére a betöltött belső szabályzatokban
       <b>nem találtunk fedezetet</b>, ezért a rendszer nem adott rá választ:</p>
    <p style="margin:0 0 16px;padding:12px 14px;background:#F0F3F4;border-left:3px solid #C63F3F">${esc(query)}</p>
    <p style="margin:0 0 14px">A kérdést továbbítottuk az illetékes kollégának,
       <b>hamarosan jelentkezik</b> Önnél. A kérdés egyben bekerült a hiánylistába is,
       amely megmutatja, hol érdemes a belső szabályozást kiegészíteni.</p>
    <p style="margin:0;color:#6B6B6B;font-size:13px">Köszönjük, hogy jelezte -
       a meg nem válaszolt kérdés is segít jobbá tenni a szabályozást.</p>`;

  return await sendMail("followup", "Kérdésére hamarosan válaszolunk",
                        shell("Kamarai Tudástár", "Kollégánk hamarosan jelentkezik", inner),
                        cimzett, null);
}

async function handleGap(body: Record<string, any>) {
  const query = String(body.query || "").trim();
  if (!query)             return json({ error: "hiányzó kérdés" }, 400);
  if (query.length > 500) return json({ error: "túl hosszú kérdés" }, 400);

  const user    = body.user || {};
  const subject = `Nincs fedezet: "${query.slice(0, 90)}"`;
  const manual  = !!body.manual;

  /* Óradarab-korlát mindenkire vonatkozik. */
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const cntRes  = await db(`mkik_notifications?select=id&kind=eq.gap&sent_at=gte.${hourAgo}`);
  if (cntRes.ok) {
    const rows = await cntRes.json();
    if (Array.isArray(rows) && rows.length >= MAX_PER_HOUR)
      return json({ ok: true, skipped: "óradarab-korlát" });
  }

  /* Ismétlés-szűrés: ugyanaz a kérdés 10 percen belül nem megy ki újra.
     A kézi bejelentés ezt szándékosan átlépi. */
  if (!manual) {
    const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
    const dup   = await db(`mkik_notifications?select=id&kind=eq.gap&sent_at=gte.${since}&subject=eq.${encodeURIComponent(subject)}`);
    if (dup.ok) {
      const rows = await dup.json();
      if (Array.isArray(rows) && rows.length) return json({ ok: true, skipped: "ismétlés" });
    }
  }

  const near = Array.isArray(body.near) ? body.near.slice(0, 3) : [];
  const nearHtml = near.length
    ? `<p style="margin:18px 0 8px;font-family:'Roboto Condensed',Arial,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:#6B6B6B">Ez állt a legközelebb</p>` +
      near.map((n: any) =>
        `<div style="border-left:3px solid #E0DDD6;padding:8px 0 8px 12px;margin-bottom:8px">
           <div style="font-size:12px;color:#6B6B6B">${esc(n.doc || "")}${n.section ? " &middot; " + esc(n.section) : ""}${n.page ? " &middot; " + esc(String(n.page)) + ". oldal" : ""}</div>
           <div style="font-size:13px;color:#373737;margin-top:3px">${esc(String(n.text || "").slice(0, 260))}…</div>
         </div>`).join("")
    : `<p style="margin:18px 0 0;font-size:13px;color:#6B6B6B">A rendszer egyetlen közeli szakaszt sem talált.</p>`;

  const inner =
    `<p style="margin:0 0 16px">Egy kamarai munkatárs olyan kérdést tett fel, amelyre a betöltött szabályzatokban <b>nincs fedezet</b>. A rendszer szándékosan nem fogalmazott meg tippet.</p>
     <div style="background:#F7F8F9;border:1px solid #E0DDD6;padding:14px 16px;margin-bottom:16px">
       <div style="font-family:Georgia,serif;font-size:16px;color:#373737">„${esc(query)}"</div>
     </div>
     <table width="100%" cellpadding="0" cellspacing="0">
       ${kv("Kérdező", user.name || "ismeretlen")}
       ${kv("Szerepkör", user.role || "-")}
       ${kv("Kamara", body.chamber || "-")}
       ${kv("Időpont", new Date().toLocaleString("hu-HU"))}
       ${kv("Jelzés módja", manual ? "kézi bejelentés a felületről" : "automatikus")}
     </table>
     ${nearHtml}
     <p style="margin:18px 0 0;font-size:13px;color:#6B6B6B">Ha a kérdés jogos, a terület szabályozása hiányos vagy nem megtalálható. A hiánylista a rendszerben gyakoriság szerint gyűlik.</p>`;

  const r = await sendMail("gap", subject, shell("Hiányjelzés", "Fedezet nélküli kérdés", inner, user.email || null), user.email || null, null);
  return json({ ok: r.ok, sent: r.ok, error: r.ok ? undefined : r.error });
}

/* ---------------------------------------------------------------- elavulás-jelzés */

async function handleDeprecate(body: Record<string, any>) {
  const docId   = String(body.docId || "").trim();
  const version = String(body.version || "").trim();
  if (!docId)   return json({ error: "hiányzó dokumentum" }, 400);
  if (!version) return json({ error: "hiányzó verziószám" }, 400);

  const docTitle  = String(body.docTitle || docId);
  const effective = String(body.effective || "");
  const note      = String(body.note || "").slice(0, 800);
  const by        = String(body.by || "rendszergazda");

  /* Kik kaptak korábban választ ebből a dokumentumból, és még nincs jelölve elavultként? */
  const res = await db(
    `mkik_queries?select=id,asked_at,question,user_id,user_name,user_email,user_role,section,page,doc_version` +
    `&doc_id=eq.${encodeURIComponent(docId)}&result=in.(ok,weak)&stale_since=is.null&order=asked_at.desc&limit=500`
  );
  if (!res.ok) return json({ error: "lekérdezés sikertelen", detail: await res.text() }, 500);
  const rows: any[] = await res.json();

  /* Verziótörténet - akkor is rögzül, ha senkit nem érint. */
  await db("mkik_doc_versions", {
    method: "POST", headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({ doc_id: docId, doc_title: docTitle, version, effective,
                           note, published_by: by, affected: rows.length }),
  }).catch(() => {});

  if (!rows.length)
    return json({ ok: true, affected: 0, recipients: 0, note: "nincs érintett korábbi válasz" });

  /* Munkatársanként egy levél. */
  const byUser = new Map<string, any[]>();
  for (const r of rows) {
    const k = r.user_id || r.user_email || "ismeretlen";
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(r);
  }

  let sent = 0;
  for (const [, list] of byUser) {
    const u = list[0];
    const items = list.slice(0, 12).map((r: any) => {
      const d = new Date(r.asked_at).toLocaleDateString("hu-HU");
      return `<div style="border-left:3px solid #C63F3F;padding:8px 0 8px 12px;margin-bottom:10px">
                <div style="font-size:12px;color:#6B6B6B">${esc(d)}${r.section ? " &middot; " + esc(r.section) : ""}${r.page ? " &middot; " + esc(String(r.page)) + ". oldal" : ""}</div>
                <div style="font-family:Georgia,serif;font-size:14.5px;color:#373737;margin-top:3px">„${esc(r.question)}"</div>
              </div>`;
    }).join("");

    const inner =
      `<p style="margin:0 0 16px">A <b>${esc(docTitle)}</b> új verziója lépett hatályba. Korábban kaptál választ ebből a szabályzatból, ezért lehet, hogy amit akkor megtudtál, <b>ma már nem az érvényes szabály</b>.</p>
       <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
         ${kv("Dokumentum", docTitle)}
         ${kv("Új verzió", version)}
         ${effective ? kv("Hatályos", effective) : ""}
         ${kv("Közzétette", by)}
         ${kv("Érintett kérdésed", String(list.length))}
       </table>
       ${note ? `<div style="background:#F7F8F9;border:1px solid #E0DDD6;padding:12px 14px;margin-bottom:18px">
                   <div style="font-family:'Roboto Condensed',Arial,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:#6B6B6B;margin-bottom:5px">Mi változott</div>
                   <div style="font-size:13.5px;color:#373737">${esc(note)}</div>
                 </div>` : ""}
       <p style="margin:0 0 8px;font-family:'Roboto Condensed',Arial,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:#6B6B6B">Ezekre kaptál választ a régi verzióból</p>
       ${items}
       <p style="margin:16px 0 0;font-size:13px;color:#6B6B6B">Tedd fel újra a kérdést a Kamarai Tudástárban - a rendszer már az új verzióból válaszol.</p>`;

    const subject = `Változott a szabályzat: ${docTitle} v${version}`;
    const r = await sendMail("deprecate", subject,
      shell("Elavulás-jelzés", "Amit korábban kérdeztél, arra ma más a válasz", inner, u.user_email || null),
      u.user_email || null, u.id || null);
    if (r.ok) sent++;
  }

  /* A napló érintett sorai megjelölve - a felületen azonnal látszik. */
  const ids = rows.map((r) => r.id);
  await db(`mkik_queries?id=in.(${ids.join(",")})`, {
    method: "PATCH", headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({
      stale_since:  new Date().toISOString(),
      stale_reason: `${docTitle} v${version}${effective ? " (hatályos " + effective + ")" : ""}`,
    }),
  }).catch(() => {});

  return json({ ok: true, affected: rows.length, recipients: byUser.size, sent });
}

/* ---------------------------------------------------------------- belépés */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "csak POST" }, 405);

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return json({ error: "érvénytelen JSON" }, 400); }

  const action = String(body.action || "");
  if (action === "answer")   return await handleAnswer(body);
  if (action === "followup") return await handleFollowup(body);
  if (action === "gap")      return await handleGap(body);
  if (action === "deprecate") return await handleDeprecate(body);
  return json({ error: "ismeretlen művelet" }, 400);
});
