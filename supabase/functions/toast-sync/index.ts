// toast-sync: pulls orders and time clock entries from Toast (read-only)
// and stores daily sales, hourly sales, item sales and labor cost.
//
// Secrets to set in Supabase > Edge Functions > Secrets:
//   TOAST_API_HOST        the "API Access URL" from your Toast credentials screen (e.g. https://....toasttab.com)
//   TOAST_CLIENT_ID       from your Toast credentials
//   TOAST_CLIENT_SECRET   from your Toast credentials
//   TOAST_RESTAURANT_GUID your location's restaurant ID (GUID)
//   SYNC_KEY              any long random password you make up; the scheduler sends it
//   STORE_TIMEZONE        optional, defaults to America/Chicago
//   OVERTIME_MULTIPLIER   optional, defaults to 1.5
//
// Called two ways:
//   - by the scheduler, with header x-sync-key: <SYNC_KEY>
//   - by a manager pressing "Sync now" in the app (their login is checked)
// Optional JSON body: { "date": "YYYY-MM-DD" } to refresh one specific day.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const env = (k: string, d = "") => (Deno.env.get(k) ?? d).trim();
const TZ = env("STORE_TIMEZONE", "America/Chicago");
const OT = Number(env("OVERTIME_MULTIPLIER", "1.5")) || 1.5;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// ---------- dates in the store's time zone ----------
function partsIn(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function shiftDate(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
const compact = (ymd: string) => ymd.replaceAll("-", "");
// Toast wants e.g. 2026-11-04T06:00:00.000-0000
const toastDT = (d: Date) => d.toISOString().replace("Z", "-0000");

// ---------- Toast API ----------
let token = "";
async function login() {
  const host = env("TOAST_API_HOST").replace(/\/+$/, "");
  const r = await fetch(`${host}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: env("TOAST_CLIENT_ID"),
      clientSecret: env("TOAST_CLIENT_SECRET"),
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!r.ok) throw new Error(`Toast login failed (${r.status}). Check TOAST_API_HOST, TOAST_CLIENT_ID and TOAST_CLIENT_SECRET.`);
  const j = await r.json();
  token = j?.token?.accessToken;
  if (!token) throw new Error("Toast login returned no access token.");
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function toastGet(path: string) {
  const host = env("TOAST_API_HOST").replace(/\/+$/, "");
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${host}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Toast-Restaurant-External-ID": env("TOAST_RESTAURANT_GUID"),
      },
    });
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (r.status === 401 || r.status === 403) {
      throw new Error(`Toast refused ${path.split("?")[0]} (${r.status}). Check that your Toast credentials include read access for orders and labor, and that TOAST_RESTAURANT_GUID is right.`);
    }
    if (!r.ok) throw new Error(`Toast ${path.split("?")[0]} failed (${r.status}).`);
    return await r.json();
  }
  throw new Error("Toast is rate limiting requests; will try again next run.");
}

// deno-lint-ignore no-explicit-any
type Any = any;

async function fetchOrders(ymd: string): Promise<Any[]> {
  const out: Any[] = [];
  for (let page = 1; page <= 60; page++) {
    const batch = await toastGet(`/orders/v2/ordersBulk?businessDate=${compact(ymd)}&pageSize=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
    await sleep(250); // stay well under Toast's 5 requests/second limit
  }
  return out;
}

async function fetchTimeEntries(ymd: string): Promise<Any[]> {
  // Ask for a window around the business day, then keep only entries for that business date.
  const [y, m, d] = ymd.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 2, 0, 0, 0));
  const all = await toastGet(
    `/labor/v1/timeEntries?startDate=${encodeURIComponent(toastDT(start))}&endDate=${encodeURIComponent(toastDT(end))}`,
  );
  const want = compact(ymd);
  return (Array.isArray(all) ? all : []).filter((e: Any) => String(e.businessDate ?? "") === want && !e.deleted);
}

// ---------- calculations ----------
function summarize(ymd: string, orders: Any[], entries: Any[]) {
  let net = 0, tax = 0, total = 0, count = 0;
  const hourly = new Map<number, { net: number; count: number }>();
  const items = new Map<string, { qty: number; sales: number }>();

  for (const o of orders) {
    if (o.voided || o.deleted) continue;
    let orderNet = 0, any = false;
    for (const c of o.checks ?? []) {
      if (c.voided || c.deleted) continue;
      any = true;
      orderNet += Number(c.amount ?? 0);          // pre-tax, after discounts
      tax += Number(c.taxAmount ?? 0);
      total += Number(c.totalAmount ?? 0);
      for (const s of c.selections ?? []) {
        if (s.voided) continue;
        const name = String(s.displayName ?? "Item").slice(0, 120);
        const it = items.get(name) ?? { qty: 0, sales: 0 };
        it.qty += Number(s.quantity ?? 1);
        it.sales += Number(s.price ?? 0);
        items.set(name, it);
      }
    }
    if (!any) continue;
    net += orderNet; count++;
    const opened = o.openedDate ? new Date(o.openedDate) : null;
    if (opened && !isNaN(opened.getTime())) {
      const h = partsIn(opened).hour;
      const b = hourly.get(h) ?? { net: 0, count: 0 };
      b.net += orderNet; b.count++;
      hourly.set(h, b);
    }
  }

  let laborCost = 0, laborHours = 0;
  const now = Date.now();
  for (const e of entries) {
    let reg = Number(e.regularHours ?? 0), ot = Number(e.overtimeHours ?? 0);
    if (!e.outDate && reg + ot === 0 && e.inDate) {
      // still clocked in: count time so far
      reg = Math.max(0, (now - new Date(e.inDate).getTime()) / 3_600_000);
    }
    const wage = Number(e.hourlyWage ?? 0); // salaried staff have no hourly wage in Toast
    laborHours += reg + ot;
    laborCost += reg * wage + ot * wage * OT;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    daily: {
      business_date: ymd, net_sales: r2(net), tax: r2(tax), total_collected: r2(total), order_count: count,
      labor_cost: r2(laborCost), labor_hours: r2(laborHours), updated_at: new Date().toISOString(),
    },
    hourly: [...hourly].map(([hour, v]) => ({ business_date: ymd, hour, net_sales: r2(v.net), order_count: v.count })),
    items: [...items].map(([item, v]) => ({ business_date: ymd, item, qty: v.qty, sales: r2(v.sales) })),
  };
}

async function store(s: ReturnType<typeof summarize>) {
  const d = s.daily.business_date;
  const e1 = (await admin.from("sales_daily").upsert(s.daily)).error;
  if (e1) throw new Error("Saving daily sales failed: " + e1.message);
  await admin.from("sales_hourly").delete().eq("business_date", d);
  if (s.hourly.length) {
    const e2 = (await admin.from("sales_hourly").insert(s.hourly)).error;
    if (e2) throw new Error("Saving hourly sales failed: " + e2.message);
  }
  await admin.from("sales_items").delete().eq("business_date", d);
  if (s.items.length) {
    const e3 = (await admin.from("sales_items").insert(s.items)).error;
    if (e3) throw new Error("Saving item sales failed: " + e3.message);
  }
}

// ---------- who is allowed to run this ----------
async function allowed(req: Request) {
  const key = req.headers.get("x-sync-key");
  if (key && env("SYNC_KEY") && key === env("SYNC_KEY")) return true;
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await admin.auth.getUser(jwt);
  if (!data?.user) return false;
  const { data: p } = await admin.from("profiles").select("role, active").eq("id", data.user.id).single();
  return !!p && p.active && (p.role === "owner" || p.role === "manager");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await allowed(req))) return json({ ok: false, error: "Not allowed" }, 401);

  const body = await req.json().catch(() => ({}));
  const today = partsIn(new Date()).date;
  const dates: string[] = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? [body.date]
    : [shiftDate(today, -1), today];

  try {
    for (const k of ["TOAST_API_HOST", "TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET", "TOAST_RESTAURANT_GUID"]) {
      if (!env(k)) throw new Error(`Missing secret ${k}.`);
    }
    await login();
    const done: unknown[] = [];
    for (const d of dates) {
      const orders = await fetchOrders(d);
      let entries: Any[] = [];
      let laborNote = "";
      try { entries = await fetchTimeEntries(d); }
      catch (e) { laborNote = ` (labor skipped: ${(e as Error).message})`; }
      const s = summarize(d, orders, entries);
      await store(s);
      done.push({ date: d, orders: s.daily.order_count, net_sales: s.daily.net_sales, labor_cost: s.daily.labor_cost, note: laborNote || undefined });
    }
    const msg = done.map((x: Any) => `${x.date}: ${x.orders} orders, $${x.net_sales} net, $${x.labor_cost} labor${x.note ?? ""}`).join(" | ");
    await admin.from("sync_log").insert({ ok: true, message: msg });
    return json({ ok: true, synced: done });
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    await admin.from("sync_log").insert({ ok: false, message });
    return json({ ok: false, error: message }, 500);
  }
});
