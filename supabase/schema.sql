-- =====================================================================
--  GABY HUB DEV — Base de données Supabase
--  À coller dans : Supabase > SQL Editor > New query > Run
--  Tu peux le relancer sans risque (il ne supprime aucune donnée).
--
--  ⚠️ AVANT DE LANCER : remplace  ADMIN_EMAIL_ICI  (ligne ~16)
--     par TON adresse email (celle avec laquelle tu te connecteras à admin.html).
-- =====================================================================

-- ---------- 1. ADMINS -------------------------------------------------
create table if not exists public.admins (
  email text primary key
);
insert into public.admins(email) values (lower('ntwaligag@gmail.com'))
  on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------- 2. TABLES -------------------------------------------------
-- Une ligne par visite (session de navigation)
create table if not exists public.visits (
  id          uuid primary key,
  visitor_id  uuid not null,               -- identifiant anonyme du navigateur
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  duration_s  int not null default 0,      -- temps passé sur le site
  pages       text[] not null default '{}',
  referrer    text,
  user_agent  text,
  lang        text,
  screen      text,
  user_email  text                          -- rempli si la personne est connectée à GabyCodeHub
);
create index if not exists visits_started_idx on public.visits(started_at desc);

-- Une ligne par partie jouée
create table if not exists public.game_sessions (
  id          uuid primary key,
  visit_id    uuid,
  visitor_id  uuid,
  game        text not null check (game in ('snake','word','bugs','memory')),
  mode        text,
  started_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  duration_s  int not null default 0,
  score       int not null default 0,
  ended       boolean not null default false,
  user_email  text
);
create index if not exists games_started_idx on public.game_sessions(started_at desc);

-- Chaque demande de code d'accès GabyCodeHub (= chaque email envoyé)
create table if not exists public.access_requests (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  email       text not null,
  pseudo      text,
  game        text,
  status      text not null default 'envoye'   -- 'envoye' ou 'erreur'
);

-- Chaque fois qu'un membre connecté regarde le code d'un jeu
create table if not exists public.code_views (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid not null,
  email       text,
  game        text
);

-- Messages du formulaire de contact
create table if not exists public.contact_messages (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  message     text not null,
  is_read     boolean not null default false
);

-- ---------- 3. SÉCURITÉ (RLS) -----------------------------------------
-- Personne ne peut lire les tables, sauf l'admin.
-- Les visiteurs écrivent uniquement via les fonctions plus bas.
alter table public.admins           enable row level security;
alter table public.visits           enable row level security;
alter table public.game_sessions    enable row level security;
alter table public.access_requests  enable row level security;
alter table public.code_views       enable row level security;
alter table public.contact_messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['visits','game_sessions','access_requests','code_views','contact_messages','admins'] loop
    execute format('drop policy if exists admin_read on public.%I', t);
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('drop policy if exists admin_delete on public.%I', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists admin_update on public.contact_messages;
create policy admin_update on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 4. FONCTIONS APPELÉES PAR LE SITE -------------------------
create or replace function public.track_visit(
  p_id uuid, p_visitor uuid, p_page text, p_referrer text, p_ua text, p_lang text, p_screen text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into visits(id, visitor_id, pages, referrer, user_agent, lang, screen, user_email)
  values (p_id, p_visitor, array[left(coalesce(p_page,'accueil'),40)], left(p_referrer,300), left(p_ua,300),
          left(p_lang,20), left(p_screen,20), auth.jwt() ->> 'email')
  on conflict (id) do update set
    last_seen  = now(),
    pages      = case when cardinality(visits.pages) >= 100 then visits.pages
                      else visits.pages || left(coalesce(p_page,'accueil'),40) end,
    user_email = coalesce(auth.jwt() ->> 'email', visits.user_email)
  where visits.started_at > now() - interval '1 day';
end $$;

create or replace function public.track_heartbeat(p_id uuid, p_duration int)
returns void language sql security definer set search_path = public as $$
  update visits set
    last_seen  = now(),
    duration_s = greatest(duration_s, least(coalesce(p_duration,0), 86400)),
    user_email = coalesce(auth.jwt() ->> 'email', user_email)
  where id = p_id and started_at > now() - interval '1 day';
$$;

create or replace function public.track_game(
  p_id uuid, p_visit uuid, p_visitor uuid, p_game text, p_mode text, p_duration int, p_score int, p_ended boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into game_sessions(id, visit_id, visitor_id, game, mode, duration_s, score, ended, user_email)
  values (p_id, p_visit, p_visitor, p_game, left(p_mode,20), least(greatest(coalesce(p_duration,0),0),86400),
          least(greatest(coalesce(p_score,0),0),1000000), coalesce(p_ended,false), auth.jwt() ->> 'email')
  on conflict (id) do update set
    updated_at = now(),
    duration_s = greatest(game_sessions.duration_s, least(coalesce(p_duration,0),86400)),
    score      = least(greatest(coalesce(p_score,0),0),1000000),
    ended      = game_sessions.ended or coalesce(p_ended,false)
  where game_sessions.started_at > now() - interval '1 day';
end $$;

create or replace function public.request_access(p_email text, p_pseudo text, p_game text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email invalide'; end if;
  if (select count(*) from access_requests where lower(email)=lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'trop de demandes';
  end if;
  insert into access_requests(email, pseudo, game, status)
  values (lower(left(p_email,200)), left(p_pseudo,40), left(p_game,20), case when p_status='erreur' then 'erreur' else 'envoye' end);
end $$;

create or replace function public.log_code_view(p_game text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  insert into code_views(user_id, email, game) values (auth.uid(), auth.jwt() ->> 'email', left(p_game,20));
end $$;

create or replace function public.send_contact(p_name text, p_email text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_name)),0) = 0 or coalesce(length(trim(p_message)),0) = 0 then raise exception 'champs vides'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email invalide'; end if;
  if (select count(*) from contact_messages where lower(email)=lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'trop de messages';
  end if;
  insert into contact_messages(name, email, message) values (left(p_name,80), lower(left(p_email,200)), left(p_message,4000));
end $$;

-- Liste des membres GabyCodeHub (comptes créés par email), réservée à l'admin
create or replace function public.admin_members()
returns table(id uuid, email text, pseudo text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''admin'; end if;
  return query select u.id, u.email::text, (u.raw_user_meta_data ->> 'pseudo')::text, u.created_at, u.last_sign_in_at
               from auth.users u order by u.created_at desc;
end $$;

-- Droits d'exécution
revoke all on function public.admin_members() from public, anon;
grant execute on function public.is_admin()                                                   to anon, authenticated;
grant execute on function public.track_visit(uuid,uuid,text,text,text,text,text)              to anon, authenticated;
grant execute on function public.track_heartbeat(uuid,int)                                     to anon, authenticated;
grant execute on function public.track_game(uuid,uuid,uuid,text,text,int,int,boolean)          to anon, authenticated;
grant execute on function public.request_access(text,text,text,text)                           to anon, authenticated;
grant execute on function public.send_contact(text,text,text)                                  to anon, authenticated;
grant execute on function public.log_code_view(text)                                           to authenticated;
grant execute on function public.admin_members()                                               to authenticated;

-- ---------- 5. NETTOYAGE (RGPD) ---------------------------------------
-- Optionnel : à lancer de temps en temps pour supprimer les données de plus de 13 mois.
-- delete from public.visits        where started_at < now() - interval '13 months';
-- delete from public.game_sessions where started_at < now() - interval '13 months';
