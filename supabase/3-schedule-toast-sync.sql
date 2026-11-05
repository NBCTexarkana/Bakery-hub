-- Runs the Toast sales pull automatically.
-- Do this LAST, after the toast-sync function is deployed and its secrets are set.
--
-- Before running, replace the two placeholders below:
--   YOUR-PROJECT-REF  -> the ID in your Supabase project URL (https://YOUR-PROJECT-REF.supabase.co)
--   YOUR-SYNC-KEY     -> the same SYNC_KEY value you saved as an Edge Function secret
-- Then paste into Supabase > SQL Editor > New query and click Run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 15 minutes. Each run refreshes today and yesterday, so late
-- adjustments (voids, clock-out edits) land in yesterday's numbers too.
select cron.schedule(
  'toast-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/toast-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', 'YOUR-SYNC-KEY'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Keep the sync log small: delete entries older than 30 days, nightly.
select cron.schedule(
  'trim-sync-log',
  '30 9 * * *',
  $$ delete from public.sync_log where ran_at < now() - interval '30 days' $$
);

-- To check it's running:   select * from public.sync_log order by ran_at desc limit 10;
-- To stop it:              select cron.unschedule('toast-sync-every-15-min');
