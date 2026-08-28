-- ============================================================================
-- Kamarai Tudástár - adatbázis
-- Az LDA Supabase projektben fut, mkik_ prefixszel, az éles LDA tábláktól
-- elkülönítve. A böngésző soha nem ér hozzá közvetlenül: minden írás és
-- olvasás a két edge functionön keresztül megy, szolgáltatói kulccsal.
-- ============================================================================

-- ---------------------------------------------------------------- lekérdezések
create table if not exists public.mkik_queries (
  id            bigserial primary key,
  asked_at      timestamptz not null default now(),

  question      text        not null,
  q_norm        text        not null,          -- kisbetűs, ékezet nélküli alak; ismétlés-szűréshez
  result        text        not null check (result in ('ok','weak','nocov','circle')),

  user_id       text,
  user_name     text,
  user_email    text,
  user_role     text,
  chamber       text,

  doc_id        text,                          -- melyik dokumentumból jött a válasz
  doc_title     text,
  doc_version   text,
  section       text,
  page          integer,

  coverage      numeric,
  score         numeric,
  cost_ft       numeric default 0,

  stale_since   timestamptz,                   -- elavulttá nyilvánítás időpontja
  stale_reason  text,

  client        text                           -- melyik gépről; a felületen "más gépről"
);

create index if not exists mkik_queries_doc_idx    on public.mkik_queries (doc_id);
create index if not exists mkik_queries_asked_idx  on public.mkik_queries (asked_at desc);
create index if not exists mkik_queries_norm_idx   on public.mkik_queries (q_norm, asked_at desc);

-- ---------------------------------------------------------------- kiküldött levelek
create table if not exists public.mkik_notifications (
  id           bigserial primary key,
  sent_at      timestamptz not null default now(),
  kind         text not null check (kind in ('gap','deprecate')),
  to_email     text not null,
  intended_to  text,                            -- éles rendszerben ide menne
  subject      text,
  ref_query_id bigint references public.mkik_queries(id) on delete set null,
  ok           boolean not null default false,
  error        text
);

create index if not exists mkik_notifications_sent_idx on public.mkik_notifications (sent_at desc);
create index if not exists mkik_notifications_kind_idx on public.mkik_notifications (kind, sent_at desc);

-- ---------------------------------------------------------------- verziótörténet
create table if not exists public.mkik_doc_versions (
  id            bigserial primary key,
  published_at  timestamptz not null default now(),
  doc_id        text not null,
  doc_title     text,
  version       text not null,
  effective     text,
  note          text,
  published_by  text,
  affected      integer default 0               -- hány korábbi választ érintett
);

create index if not exists mkik_doc_versions_doc_idx on public.mkik_doc_versions (doc_id, published_at desc);

-- ---------------------------------------------------------------- hozzáférés
-- RLS bekapcsolva, publikus policy szándékosan NINCS. Az anon és a bejelentkezett
-- szerepkör így semmit nem lát; kizárólag a service_role (az edge functionök)
-- férnek hozzá. A napló így nem szivárog ki a böngészőn keresztül.
alter table public.mkik_queries       enable row level security;
alter table public.mkik_notifications enable row level security;
alter table public.mkik_doc_versions  enable row level security;
