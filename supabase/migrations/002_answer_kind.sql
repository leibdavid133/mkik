-- Az értesítés-típusok bővítése: a megválaszolt kérdésekről is megy levél.
-- Ha a 001_mkik.sql már lefutott, ez a migráció igazítja ki a feltételt.
alter table public.mkik_notifications drop constraint if exists mkik_notifications_kind_check;
alter table public.mkik_notifications add constraint mkik_notifications_kind_check
  check (kind in ('gap','deprecate','answer'));
