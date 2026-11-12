-- LOCAL TESTING ONLY. Assertion and sign-in helpers for the SQL test suite.
create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create or replace function tests.eq(p_got anyelement, p_want anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL: % (got %, want %)', p_msg, p_got, p_want; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Runs p_sql and expects an error whose message matches p_pattern.
create or replace function tests.throws(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm !~* p_pattern then raise exception 'FAIL: % (wrong error: %)', p_msg, sqlerrm; end if;
    raise notice 'ok - %', p_msg;
    return;
  end;
  raise exception 'FAIL: % (no error raised)', p_msg;
end $$;

create or replace function tests.lives(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'ok - %', p_msg;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise exception 'FAIL: % (error: %)', p_msg, sqlerrm;
end $$;

-- Act as a signed-in user, an anonymous visitor, or the database owner.
create or replace function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
create or replace function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
create or replace function tests.service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create or replace function tests.owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Count rows visible to the current role.
create or replace function tests.visible(p_table text, p_where text default 'true') returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from %s where %s', p_table, p_where) into n;
  return n;
end $$;

-- A timestamp in Malaysia time, p_days from today.
create or replace function tests.myt(p_days int, p_time time) returns timestamptz language sql stable as $$
  select ((biz_today() + p_days) + p_time) at time zone 'Asia/Kuala_Lumpur'
$$;

grant execute on all functions in schema tests to public;
