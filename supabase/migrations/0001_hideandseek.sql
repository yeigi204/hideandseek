-- Hide and Seek: Spiele, Event-Log und Live-Standorte.
-- Die Tabellen sind per RLS gesperrt; Zugriff nur über die Funktionen unten,
-- die den (geheimen) Spielcode verlangen.

create table if not exists public.hs_games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.hs_events (
  seq bigint generated always as identity primary key,
  game_id uuid not null references public.hs_games(id) on delete cascade,
  player_id text,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists hs_events_game_seq_idx on public.hs_events (game_id, seq);

create table if not exists public.hs_locations (
  game_id uuid not null references public.hs_games(id) on delete cascade,
  player_id text not null,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table public.hs_games enable row level security;
alter table public.hs_events enable row level security;
alter table public.hs_locations enable row level security;
revoke all on table public.hs_games, public.hs_events, public.hs_locations from anon, authenticated;

-- Spiel erstellen: 6-stelliger Code aus 32 eindeutigen Zeichen (ohne I, O, 0, 1)
create or replace function public.hs_create_game(p_player_id text, p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_id uuid;
  i int;
begin
  if p_payload is null or octet_length(p_payload::text) > 32768 then
    raise exception 'invalid payload';
  end if;
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    begin
      insert into public.hs_games (code) values (v_code) returning id into v_id;
      exit;
    exception when unique_violation then
      -- neuer Versuch
    end;
  end loop;
  insert into public.hs_events (game_id, player_id, type, payload)
  values (v_id, left(p_player_id, 64), 'game_created', p_payload);
  return json_build_object('code', v_code);
end;
$$;

create or replace function public.hs_add_event(p_code text, p_player_id text, p_type text, p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid;
  v_seq bigint;
  v_at timestamptz;
begin
  if p_type is null or p_type !~ '^[a-z_]{1,40}$' then
    raise exception 'invalid event type';
  end if;
  if p_payload is null or octet_length(p_payload::text) > 16384 then
    raise exception 'invalid payload';
  end if;
  -- Sperre pro Spiel: Events werden strikt nacheinander nummeriert und sichtbar.
  select id into v_game from public.hs_games where code = upper(p_code) for update;
  if v_game is null then
    raise exception 'game not found';
  end if;
  if (select count(*) from public.hs_events where game_id = v_game) >= 20000 then
    raise exception 'event limit reached';
  end if;
  insert into public.hs_events (game_id, player_id, type, payload)
  values (v_game, left(p_player_id, 64), p_type, p_payload)
  returning seq, created_at into v_seq, v_at;
  return json_build_object('seq', v_seq, 'at', floor(extract(epoch from v_at) * 1000)::bigint);
end;
$$;

create or replace function public.hs_get_events(p_code text, p_after bigint)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_game uuid;
begin
  select id into v_game from public.hs_games where code = upper(p_code);
  if v_game is null then
    raise exception 'game not found';
  end if;
  return json_build_object(
    'server_time', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'events', coalesce((
      select json_agg(e order by e.seq)
      from (
        select seq, player_id, type, payload, floor(extract(epoch from created_at) * 1000)::bigint as at
        from public.hs_events
        where game_id = v_game and seq > coalesce(p_after, 0)
        order by seq
        limit 1000
      ) e
    ), '[]'::json)
  );
end;
$$;

create or replace function public.hs_set_location(p_code text, p_player_id text, p_lat double precision, p_lng double precision, p_accuracy double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid position';
  end if;
  select id into v_game from public.hs_games where code = upper(p_code);
  if v_game is null then
    raise exception 'game not found';
  end if;
  insert into public.hs_locations (game_id, player_id, lat, lng, accuracy, updated_at)
  values (v_game, left(p_player_id, 64), p_lat, p_lng, p_accuracy, now())
  on conflict (game_id, player_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.hs_clear_location(p_code text, p_player_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.hs_locations l
  using public.hs_games g
  where g.code = upper(p_code) and l.game_id = g.id and l.player_id = p_player_id;
end;
$$;

create or replace function public.hs_get_locations(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_game uuid;
begin
  select id into v_game from public.hs_games where code = upper(p_code);
  if v_game is null then
    raise exception 'game not found';
  end if;
  return json_build_object(
    'server_time', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    'locations', coalesce((
      select json_agg(json_build_object(
        'player_id', player_id,
        'lat', lat,
        'lng', lng,
        'accuracy', accuracy,
        'updated_at', floor(extract(epoch from updated_at) * 1000)::bigint
      ))
      from public.hs_locations
      where game_id = v_game
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.hs_create_game(text, jsonb) from public;
revoke all on function public.hs_add_event(text, text, text, jsonb) from public;
revoke all on function public.hs_get_events(text, bigint) from public;
revoke all on function public.hs_set_location(text, text, double precision, double precision, double precision) from public;
revoke all on function public.hs_clear_location(text, text) from public;
revoke all on function public.hs_get_locations(text) from public;

grant execute on function public.hs_create_game(text, jsonb) to anon, authenticated;
grant execute on function public.hs_add_event(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.hs_get_events(text, bigint) to anon, authenticated;
grant execute on function public.hs_set_location(text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.hs_clear_location(text, text) to anon, authenticated;
grant execute on function public.hs_get_locations(text) to anon, authenticated;
