insert into public.shifts (staff_id, date, start_time, end_time, note)
select p.id, v.d::date, '08:15', '19:00', 'Key Holder/Joy Creator'
from (values ('Reece Gilliam','2026-11-02'), ('Rylee Gilliam','2026-11-03'), ('Rylee Gilliam','2026-11-04')) as v(n, d)
join public.profiles p on p.name = v.n;
