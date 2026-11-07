/* Texarkana Bakery Hub - web app (no build step). Talks to Supabase. */
(function () {
"use strict";
const CFG = window.BAKERY_CONFIG || {};
const INITIAL_HASH = location.hash; // read before Supabase consumes invite/recovery tokens
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

const REM_CATS = ["Food safety", "Ordering", "Equipment", "Cleaning", "Payroll & admin", "Events", "NBU", "Other"];
const INV_CATS = ["Ingredients", "Packaging", "Retail", "Supplies", "Other"];
const POSITIONS = ["Joy Creator", "Froster", "Baker", "Utility", "Shift Lead", "Key Holder", "Offsite Event", "Manager", "Owner"];
function splitPos(s) { return String(s || "").split(/\s*[,\/]\s*/).map(x => x.trim()).filter(Boolean); }
function posOptions(cur) { const extra = splitPos(cur).filter(x => !POSITIONS.includes(x)); return [...POSITIONS, ...extra]; }
const TARGET = Number(CFG.LABOR_TARGET_PCT) || 25;

const S = { profiles: [], reminders: [], messages: [], dms: [], inventory: [], vendors: [], orders: [], shifts: [], tshifts: [], cal: [], docs: [], recipes: [], sales: [], hourly: [], items: [], synclog: [] };
let session = null, me = null, MGR = false, OWNER = false;
let view = "today", msgTab = "team", dmWith = "", salesDate = "";
let calMonth = startOfMonth(new Date()), calSel = ymd(new Date()), weekStart = monday(new Date());
let invF = { q: "", area: "All", low: false, vendor: "All" };
let invTab = "items", countArea = "All", countVendor = "All", countDraft = {};
let booted = false, channel = null, starting = false;

/* ---------------- helpers ---------------- */
function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monday(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function today() { return ymd(new Date()); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function hm(t) { return (t || "").slice(0, 5); }
function fmtTime(t) { if (!t) return ""; let [h, m] = hm(t).split(":").map(Number); const ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; }
function fmtDate(s, opt) { return parse(s).toLocaleDateString(undefined, opt || { weekday: "short", month: "short", day: "numeric" }); }
function hours(a, b) { if (!a || !b) return 0; const [h1, m1] = hm(a).split(":").map(Number), [h2, m2] = hm(b).split(":").map(Number); let d = (h2 * 60 + m2) - (h1 * 60 + m1); if (d < 0) d += 1440; return d / 60; }
function ago(iso) { const t = new Date(iso).getTime(), s = (Date.now() - t) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " hr ago"; return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function fmtNum(n) { n = num(n); return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function money(n, dec) { return num(n).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 0 }); }
function pct(n) { return (Math.round(n * 10) / 10).toFixed(1) + "%"; }
function person(id) { return S.profiles.find(p => p.id === id); }
function nameOf(id) { const p = person(id); return p ? (p.name || "Someone") : "Someone"; }
function initials(n) { return String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?"; }
const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 2600); }
function $(id) { return document.getElementById(id); }

/* ---------------- data ---------------- */
async function q(promise, what) {
  const { data, error } = await promise;
  if (error) { console.error(what, error); toast("Couldn't " + what + ". " + (error.message || "")); return null; }
  return data;
}
const LOADERS = {
  profiles: () => sb.from("profiles").select("*").order("name"),
  reminders: () => sb.from("reminders").select("*"),
  messages: () => sb.from("messages").select("*").order("created_at", { ascending: false }).limit(300),
  dms: () => sb.from("direct_messages").select("*").order("created_at", { ascending: false }).limit(1000),
  inventory: () => sb.from("inventory_items").select("*"),
  orders: () => sb.from("vendor_orders").select("*").order("updated_at", { ascending: false }).limit(200),
  vendors: () => sb.from("vendors").select("*").order("name"),
  cal: () => sb.from("cal_events").select("*").gte("end_at", new Date(Date.now() - 45 * 864e5).toISOString()).order("start_at").limit(5000),
  tshifts: () => sb.from("toast_shifts").select("*").gte("start_at", new Date(Date.now() - 21 * 864e5).toISOString()).order("start_at").limit(3000),
  shifts: () => sb.from("shifts").select("*").gte("date", ymd(addDays(new Date(), -120))).lte("date", ymd(addDays(new Date(), 180))),
  docs: () => sb.from("documents").select("*").order("week_start", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(300),
  recipes: () => sb.from("recipes").select("*").order("name").limit(2000),
  sales: () => sb.from("sales_daily").select("*").order("business_date", { ascending: false }).limit(400),
  synclog: () => sb.from("sync_log").select("*").order("ran_at", { ascending: false }).limit(5),
};
const TABLE_TO_KEY = { profiles: "profiles", reminders: "reminders", messages: "messages", direct_messages: "dms", inventory_items: "inventory", vendors: "vendors", vendor_orders: "orders", shifts: "shifts", toast_shifts: "tshifts", cal_events: "cal", documents: "docs", recipes: "recipes", sales_daily: "sales" };
async function load(key) {
  if ((key === "sales" || key === "synclog") && !MGR) return;
  const data = await q(LOADERS[key](), "load " + key);
  if (data) S[key] = data;
}
const pending = new Set(); let reloadT = null;
function scheduleReload(key) {
  pending.add(key);
  clearTimeout(reloadT);
  reloadT = setTimeout(async () => {
    const keys = [...pending]; pending.clear();
    await Promise.all(keys.map(load));
    if (keys.includes("profiles")) refreshMe();
    if (keys.includes("sales")) { await load("synclog"); await loadSalesDetail(); }
    render();
  }, 250);
}
function refreshMe() {
  me = S.profiles.find(p => p.id === session.user.id) || me;
  MGR = !!me && me.active && (me.role === "owner" || me.role === "manager");
  OWNER = !!me && me.role === "owner";
}
async function loadSalesDetail() {
  if (!MGR || !salesDate) return;
  const [h, it] = await Promise.all([
    q(sb.from("sales_hourly").select("*").eq("business_date", salesDate).order("hour"), "load hourly sales"),
    q(sb.from("sales_items").select("*").eq("business_date", salesDate).order("sales", { ascending: false }).limit(10), "load item sales"),
  ]);
  S.hourly = h || []; S.items = it || [];
}
async function write(table, op, row, id) {
  let p;
  if (op === "insert") p = sb.from(table).insert(row);
  else if (op === "update") p = sb.from(table).update(row).eq("id", id);
  else p = sb.from(table).delete().eq("id", id);
  const { error } = await p;
  if (error) { toast(error.message.includes("row-level security") ? "You don't have permission to do that." : "Couldn't save: " + error.message); return false; }
  scheduleReload(TABLE_TO_KEY[table]);
  return true;
}

/* ---------------- reminders ---------------- */
function occurs(r, ds) {
  if (!r.date || ds < r.date) return false;
  const a = parse(r.date), b = parse(ds);
  switch (r.repeat) { case "daily": return true; case "weekly": return a.getDay() === b.getDay(); case "monthly": return a.getDate() === b.getDate(); case "yearly": return a.getDate() === b.getDate() && a.getMonth() === b.getMonth(); default: return ds === r.date; }
}
/* linked calendars (Outlook etc.) */
function evColor(e) { return /^#[0-9a-f]{6}$/i.test(e.color || "") ? e.color : "#2f6fd6"; }
function calOn(ds) {
  return S.cal.filter(e => e.all_day ? (e.start_date <= ds && ds < (e.end_date || e.start_date) || e.start_date === ds) : ymd(new Date(e.start_at)) === ds)
    .sort((a, b) => (b.all_day - a.all_day) || a.start_at.localeCompare(b.start_at));
}
function evTime(e) { if (e.all_day) return "All day"; const f = d => { const x = new Date(d); let h = x.getHours(); const m = x.getMinutes(), ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; }; return f(e.start_at) + "–" + f(e.end_at); }
function evRow(e) {
  return `<div class="item"><span aria-hidden="true" style="width:10px;height:10px;border-radius:50%;margin-top:6px;flex:none;background:${evColor(e)}"></span><div class="grow">
    <div class="t">${esc(e.title)}</div>
    <div class="row small muted" style="gap:6px;margin-top:2px"><span>${esc(evTime(e))}</span>${e.location ? `<span>${esc(e.location)}</span>` : ""}<span class="chip">${esc(e.feed_name)}</span>${e.managers_only ? '<span class="chip acc">Managers</span>' : ""}</div></div></div>`;
}
function remsOn(ds) { return S.reminders.filter(r => occurs(r, ds)).sort((a, b) => (b.priority === "critical") - (a.priority === "critical") || (a.time || "99").localeCompare(b.time || "99")); }
function isDone(r, ds) { return (r.done_dates || []).includes(ds); }
function isEvent(r) { return r.kind === "event"; }
function overdue() { const t = today(); return S.reminders.filter(r => !isEvent(r) && r.repeat === "none" && r.date < t && !isDone(r, r.date)); }
const REPEAT_LABEL = { none: "", daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
function remRow(r, ds, showDate) {
  const ev = isEvent(r), d = !ev && isDone(r, ds);
  return `<div class="item ${d ? "done" : ""}">
    ${ev ? `<span class="check" aria-hidden="true" style="display:inline-grid;place-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></span>`
      : `<input type="checkbox" class="check" data-act="remDone" data-id="${r.id}" data-date="${ds}" ${d ? "checked" : ""} ${MGR ? "" : "disabled"} aria-label="Mark ${esc(r.title)} done">`}
    <div class="grow">${MGR ? `<button class="link t" data-act="remEdit" data-id="${r.id}">${esc(r.title)}</button>` : `<span class="t">${esc(r.title)}</span>`}
      <div class="row small muted" style="gap:6px;margin-top:2px">
        ${r.priority === "critical" ? '<span class="chip crit">Critical</span>' : ""}
        ${ev ? '<span class="chip acc">Event</span>' : ""}
        ${showDate ? `<span>${esc(fmtDate(ds))}</span>` : ""}
        ${r.time ? `<span>${fmtTime(r.time)}</span>` : ""}
        ${r.category ? `<span class="chip">${esc(r.category)}</span>` : ""}
        ${REPEAT_LABEL[r.repeat] ? `<span>${REPEAT_LABEL[r.repeat]}</span>` : ""}
      </div>
      ${r.notes ? `<div class="small muted" style="margin-top:4px;white-space:pre-wrap">${esc(r.notes)}</div>` : ""}
    </div></div>`;
}
function remForm(r, date) {
  r = r || {};
  openForm({
    title: r.id ? "Edit calendar item" : "Add to calendar", submit: r.id ? "Save" : "Add to calendar", fields: [
      { id: "kind", label: "Type", type: "select", value: r.kind || "reminder", options: [["reminder", "Reminder (check it off when done)"], ["event", "Event (meeting, delivery, pickup, catering…)"]] },
      { id: "title", label: "What is it?", value: r.title, required: true, ph: "e.g. Health permit renewal due, or Catering pickup for First Baptist" },
      [{ id: "date", label: "Date", type: "date", value: r.date || date || today(), required: true }, { id: "time", label: "Time (optional)", type: "time", value: hm(r.time) }],
      [{ id: "repeat", label: "Repeats", type: "select", value: r.repeat || "none", options: [["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"], ["yearly", "Every year"]] },
       { id: "priority", label: "Priority", type: "select", value: r.priority || (r.kind === "event" ? "normal" : "critical"), options: [["critical", "Critical"], ["normal", "Normal"]] }],
      { id: "category", label: "Category", type: "select", value: r.category || "Other", options: REM_CATS },
      { id: "notes", label: "Notes", type: "textarea", value: r.notes }
    ],
    onSubmit: v => { v.time = v.time || null; return r.id ? write("reminders", "update", v, r.id) : write("reminders", "insert", v); },
    onDelete: r.id ? () => write("reminders", "delete", null, r.id) : null
  });
}

/* ---------------- generic form modal ---------------- */
function fieldHtml(f) {
  const id = "f_" + f.id, req = f.required ? "required" : "";
  let input;
  if (f.type === "select") input = `<select id="${id}" name="${f.id}">${f.options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(f.value ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
  else if (f.type === "textarea") input = `<textarea id="${id}" name="${f.id}" ${req}>${esc(f.value)}</textarea>`;
  else if (f.type === "checks") return `<fieldset style="border:0;padding:0;margin:0;min-width:0"><legend class="small" style="font-weight:600;color:var(--muted);margin-bottom:6px">${esc(f.label)}</legend><div class="row" style="gap:8px 16px">${f.options.map((o, i) => `<label class="row small" for="${id}_${i}" style="gap:6px;font-weight:500"><input type="checkbox" class="check" id="${id}_${i}" name="${f.id}" value="${esc(o)}" ${(f.value || []).includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div></fieldset>`;
  else if (f.type === "checkbox") return `<label class="row small" style="gap:8px;font-weight:600" for="${id}"><input type="checkbox" class="check" id="${id}" name="${f.id}" ${f.value ? "checked" : ""}> ${esc(f.label)}</label>`;
  else input = `<input id="${id}" name="${f.id}" type="${f.type || "text"}" value="${esc(f.value ?? "")}" ${req} ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} ${f.type === "number" ? 'step="any" inputmode="decimal"' : ""} ${f.list ? `list="${f.list}"` : ""} ${f.accept ? `accept="${f.accept}"` : ""} ${f.disabled ? "disabled" : ""}>`;
  return `<label class="f" for="${id}">${esc(f.label)}${input}</label>`;
}
function openForm(o) {
  const body = o.fields.map(f => Array.isArray(f) ? `<div class="two">${f.map(fieldHtml).join("")}</div>` : fieldHtml(f)).join("");
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><form class="dialog" id="dlg" novalidate>
    <h3>${esc(o.title)}</h3>${o.extra || ""}${body}<div class="err" id="dlgErr"></div>
    <div class="row" style="justify-content:flex-end">
      ${o.onDelete ? '<button type="button" class="danger" id="dlgDel" style="margin-right:auto">Delete</button>' : ""}
      <button type="button" data-act="close">Cancel</button><button class="primary" type="submit" id="dlgOk">${esc(o.submit || "Save")}</button>
    </div></form></div>`;
  const form = $("dlg");
  const first = form.querySelector("input:not([type=checkbox]),select,textarea"); if (first) first.focus();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const bad = [...form.querySelectorAll("[required]")].find(el => !el.value.trim());
    if (bad) { bad.focus(); $("dlgErr").textContent = "Fill in the required fields."; return; }
    const v = {};
    o.fields.flat().forEach(f => { if (f.type === "checks") { v[f.id] = [...form.querySelectorAll(`input[name="${f.id}"]:checked`)].map(x => x.value).join(", "); return; } const el = form.elements[f.id]; if (!el || f.disabled) return; let val = f.type === "checkbox" ? el.checked : f.type === "file" ? (el.files[0] || null) : el.value; if (f.type === "number") val = num(val); else if (typeof val === "string") val = val.trim(); v[f.id] = val; });
    $("dlgOk").disabled = true;
    const ok = await o.onSubmit(v);
    if (ok === false || (ok && ok.error)) { $("dlgOk").disabled = false; if (ok && ok.error) $("dlgErr").textContent = ok.error; return; }
    closeModal(); toast(o.done || "Saved");
  });
  const del = $("dlgDel");
  if (del) del.addEventListener("click", async () => {
    if (del.dataset.armed) { await o.onDelete(); closeModal(); toast("Deleted"); }
    else { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; }
  });
}
function closeModal() { $("modal").innerHTML = ""; }

/* ---------------- views ---------------- */
function vToday() {
  const t = today(), todays = remsOn(t), od = overdue();
  const week = []; for (let i = 1; i <= 7; i++) { const ds = ymd(addDays(new Date(), i)); remsOn(ds).filter(r => r.priority === "critical").forEach(r => week.push([r, ds])); }
  const TS = useToastSched();
  const shifts = TS
    ? [...S.tshifts.filter(s => tDay(s) === t).map(s => ({ k: s.start_at, who: hubName(s), start: tTime(s.start_at), end: tTime(s.end_at), note: s.job_title })),
       ...S.shifts.filter(s => s.date === t).map(s => ({ k: new Date(s.date + "T" + s.start_time).toISOString(), who: nameOf(s.staff_id), start: fmtTime(s.start_time), end: fmtTime(s.end_time), note: s.note }))].sort((a, b) => a.k.localeCompare(b.k))
    : S.shifts.filter(s => s.date === t).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")).map(s => ({ who: nameOf(s.staff_id), start: fmtTime(s.start_time), end: fmtTime(s.end_time), note: s.note }));
  const nowIso = new Date().toISOString();
  const myNext = TS
    ? [...myToast().filter(s => (s.end_at || s.start_at) >= nowIso).map(s => ({ k: s.start_at, date: tDay(s), start: tTime(s.start_at), end: tTime(s.end_at), note: s.job_title })),
       ...S.shifts.filter(s => s.staff_id === me.id && s.date >= t).map(s => ({ k: new Date(s.date + "T" + s.start_time).toISOString(), date: s.date, start: fmtTime(s.start_time), end: fmtTime(s.end_time), note: s.note }))].sort((a, b) => a.k.localeCompare(b.k)).slice(0, 4)
    : S.shifts.filter(s => s.staff_id === me.id && s.date >= t).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)).slice(0, 4).map(s => ({ date: s.date, start: fmtTime(s.start_time), end: fmtTime(s.end_time), note: s.note }));
  const low = S.inventory.filter(i => isLow(i)).sort(byName);
  const pins = S.messages.filter(m => m.pinned && (m.channel === "team" || MGR));
  const unread = S.dms.filter(d => d.recipient === me.id && !d.read_at).length;
  const sd = MGR ? S.sales.find(s => s.business_date === t) : null;
  return `<div class="head"><h2>${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</h2>${MGR ? `<button class="primary" data-act="remNew" data-date="${t}">Add to calendar</button>` : ""}</div>
  ${unread ? `<div class="banner">You have ${unread} unread private message${unread > 1 ? "s" : ""}. <a href="#messages" data-act="openPrivate" style="color:inherit">Open messages</a></div>` : ""}
  ${MGR && sd ? `<div class="kpis">${kpi("Net sales so far", money(sd.net_sales))}${kpi("Labor %", sd.net_sales > 0 ? pct(sd.labor_cost / sd.net_sales * 100) : "–", laborClass(sd))}${kpi("Orders", sd.order_count)}</div>` : ""}
  <div class="grid">
    ${nbuCard()}
    <section class="card"><h3>Today's calendar</h3>
      ${od.length ? `<div class="small" style="color:var(--crit);font-weight:700;margin-bottom:4px">Overdue</div><div class="list" style="margin-bottom:10px">${od.map(r => remRow(r, r.date, true)).join("")}</div>` : ""}
      ${todays.length ? `<div class="list">${todays.map(r => remRow(r, t)).join("")}</div>` : `<div class="empty">Nothing due today.</div>`}
      ${calOn(t).length ? `<div class="small" style="font-weight:700;margin:12px 0 2px">On your calendars</div><div class="list">${calOn(t).map(evRow).join("")}</div>` : ""}
    </section>
    <section class="card"><h3>Critical this week</h3>
      ${week.length ? `<div class="list">${week.map(([r, ds]) => remRow(r, ds, true)).join("")}</div>` : `<div class="empty">No critical reminders in the next 7 days.</div>`}
    </section>
    <section class="card"><h3>Working today</h3>
      ${shifts.length ? `<div class="list">${shifts.map(s => `<div class="item"><span class="av">${esc(initials(s.who))}</span><div class="grow"><div class="t">${esc(s.who)}</div><div class="small muted">${s.start}–${s.end}${s.note ? " · " + esc(s.note) : ""}</div></div></div>`).join("")}</div>` : `<div class="empty">No shifts scheduled today.</div>`}
    </section>
    <section class="card"><h3>My next shifts</h3>
      ${myNext.length ? `<div class="list">${myNext.map(s => `<div class="item"><div class="grow"><div class="t">${esc(fmtDate(s.date))}</div><div class="small muted">${s.start}–${s.end}${s.note ? " · " + esc(s.note) : ""}</div></div></div>`).join("")}</div>` : `<div class="empty">${TS ? "No upcoming Toast shifts matched to your email. Your Hub email needs to match your email in Toast." : "You're not on the schedule yet."}</div>`}
    </section>
    ${MGR ? `<section class="card"><h3>Stock to reorder</h3>
      ${low.length ? `<div class="list">${low.slice(0, 6).map(i => `<div class="item"><div class="grow"><span class="t">${esc(i.name)}</span> <span class="small muted">${esc(i.vendor || "")}</span></div><span class="chip ${num(i.on_hand) <= 0 ? "crit" : "warn"}">${fmtNum(i.on_hand)} / ${fmtNum(i.par)} ${esc(i.unit || "")}</span></div>`).join("")}</div><a class="btn" href="#orders" style="display:inline-block;margin-top:8px;text-decoration:none">Start an order</a>` : `<div class="empty">Everything is above par.</div>`}
    </section>` : ""}
    <section class="card"><h3>Pinned messages</h3>
      ${pins.length ? pins.slice(0, 4).map(m => `<div class="item"><div class="grow"><div class="small muted">${esc(nameOf(m.author))} · ${ago(m.created_at)}${m.channel === "managers" ? " · Managers" : ""}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</div></div></div>`).join("") : `<div class="empty">No pinned messages.</div>`}
    </section>
  </div>`;
}
function kpi(label, value, cls, cmp) { return `<div class="card kpi"><div class="lbl">${esc(label)}</div><div class="stat ${cls || ""}">${value}</div>${cmp ? `<div class="cmp">${cmp}</div>` : ""}</div>`; }
function laborClass(sd) { if (!sd || !(sd.net_sales > 0)) return ""; const p = sd.labor_cost / sd.net_sales * 100; return p <= TARGET ? "up" : p <= TARGET + 5 ? "" : "down"; }

/* ----- sales ----- */
function vSales() {
  if (!MGR) return `<div class="empty">Sales are only visible to managers.</div>`;
  const sd = S.sales.find(s => s.business_date === salesDate);
  const lw = S.sales.find(s => s.business_date === ymd(addDays(parse(salesDate), -7)));
  const cmp = (a, b, isMoney) => { if (!b || !(num(b) > 0)) return "No data for same day last week"; const d = (num(a) - num(b)) / num(b) * 100; return `<span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}%</span> vs last ${esc(fmtDate(ymd(addDays(parse(salesDate), -7)), { weekday: "long" }))} (${isMoney ? money(b) : fmtNum(b)})`; };
  const avg = sd && sd.order_count ? sd.net_sales / sd.order_count : 0;
  const lp = sd && sd.net_sales > 0 ? sd.labor_cost / sd.net_sales * 100 : null;
  const last = S.synclog[0];
  const days = [...Array(14)].map((_, i) => ymd(addDays(parse(salesDate), i - 13)));
  const series = days.map(d => { const r = S.sales.find(s => s.business_date === d); return { d, v: r ? num(r.net_sales) : 0, r }; });
  return `<div class="head"><h2>Sales &amp; labor</h2>
    <label class="f" for="salesDate" style="flex-direction:row;align-items:center;gap:8px">Day <input type="date" id="salesDate" value="${salesDate}" max="${today()}" style="width:auto"></label>
    <button data-act="syncNow" id="syncBtn">Sync now</button></div>
  <p class="small muted" style="margin:-8px 0 14px">${last ? `Last update from Toast ${esc(ago(last.ran_at))}${last.ok ? "" : ` <span class="chip crit">Problem</span> ${esc(last.message || "")}`}` : "No updates from Toast yet. Use Sync now, or check the setup steps."}</p>
  <div class="kpis">
    ${kpi("Net sales", sd ? money(sd.net_sales) : "–", "", sd ? cmp(sd.net_sales, lw && lw.net_sales, true) : "")}
    ${kpi("Labor %", lp == null ? "–" : pct(lp), laborClass(sd), `Target ${TARGET}% or less`)}
    ${kpi("Labor cost", sd ? money(sd.labor_cost) : "–", "", sd ? `${fmtNum(sd.labor_hours)} hours worked` : "")}
    ${kpi("Orders", sd ? sd.order_count : "–", "", sd ? cmp(sd.order_count, lw && lw.order_count) : "")}
    ${kpi("Average ticket", sd && sd.order_count ? money(avg, 2) : "–")}
  </div>
  <div class="grid">
    <section class="card"><h3>Last 14 days</h3>${barChart(series.map(x => ({ label: parse(x.d).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }), v: x.v, hi: x.d === salesDate })), v => money(v))}</section>
    <section class="card"><h3>By hour, ${esc(fmtDate(salesDate))}</h3>${S.hourly.length ? barChart(S.hourly.map(h => ({ label: fmtTime(pad(h.hour) + ":00"), v: num(h.net_sales) })), v => money(v)) : `<div class="empty">No hourly data for this day.</div>`}</section>
    <section class="card"><h3>Top items</h3>${S.items.length ? `<div class="scroll"><table><thead><tr><th>Item</th><th>Qty</th><th>Sales</th></tr></thead><tbody>${S.items.map(i => `<tr><td>${esc(i.item)}</td><td>${fmtNum(i.qty)}</td><td>${money(i.sales, 2)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No item data for this day.</div>`}</section>
  </div>
  <section class="card" style="margin-top:16px"><h3>Daily detail</h3><div class="scroll"><table><thead><tr><th>Day</th><th>Net sales</th><th>Orders</th><th>Avg ticket</th><th>Labor $</th><th>Labor %</th></tr></thead><tbody>
    ${series.slice().reverse().filter(x => x.r).map(({ d, r }) => `<tr><td><button class="link" data-act="salesPick" data-date="${d}">${esc(fmtDate(d))}</button></td><td>${money(r.net_sales)}</td><td>${r.order_count}</td><td>${r.order_count ? money(r.net_sales / r.order_count, 2) : "–"}</td><td>${money(r.labor_cost)}</td><td class="${laborClass(r)}">${r.net_sales > 0 ? pct(r.labor_cost / r.net_sales * 100) : "–"}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No sales data yet.</td></tr>`}
  </tbody></table></div></section>`;
}
function barChart(rows, fmt) {
  const W = 640, H = 220, L = 52, B = 26, T = 10, R = 8;
  const max = Math.max(1, ...rows.map(r => r.v));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const bw = (W - L - R) / rows.length;
  let g = "";
  for (let y = 0; y <= top + 1e-9; y += step) { const py = T + (H - T - B) * (1 - y / top); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${py}" y2="${py}"/><text x="${L - 6}" y="${py + 4}" text-anchor="end">${esc(fmt(y))}</text>`; }
  const every = Math.ceil(rows.length / 14);
  rows.forEach((r, i) => {
    const h = (H - T - B) * (r.v / top), x = L + i * bw + bw * 0.15;
    g += `<rect class="bar ${r.hi ? "hi" : ""}" x="${x}" y="${H - B - h}" width="${bw * 0.7}" height="${Math.max(0, h)}" rx="2"><title>${esc(r.label)}: ${esc(fmt(r.v))}</title></rect>`;
    if (i % every === 0) g += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${g}</svg>`;
}
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1)))); const n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

/* ----- calendar ----- */
function vCalendar() {
  const m = calMonth, start = monday(m), t = today();
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i); if (i >= 35 && d.getMonth() !== m.getMonth()) break;
    const ds = ymd(d), rs = remsOn(ds), evs = calOn(ds);
    cells += `<button class="day ${d.getMonth() !== m.getMonth() ? "out" : ""} ${ds === t ? "today" : ""} ${ds === calSel ? "sel" : ""}" data-act="calPick" data-date="${ds}" aria-label="${esc(fmtDate(ds, { weekday: "long", month: "long", day: "numeric" }))}, ${rs.length} reminders, ${evs.length} calendar events">
      <span class="n">${d.getDate()}</span>
      ${rs.slice(0, 3).map(r => `<span class="pill ${r.priority === "critical" ? "crit" : ""}">${esc(r.title)}</span>`).join("")}
      ${evs.slice(0, Math.max(0, 3 - rs.length)).map(e => `<span class="pill ev"><i style="background:${evColor(e)}"></i>${esc(e.title)}</span>`).join("")}
      ${rs.length + evs.length > 3 ? `<span class="pill more">+${rs.length + evs.length - 3} more</span>` : ""}
      <span class="dots">${rs.slice(0, 5).map(r => `<i class="${r.priority === "critical" ? "crit" : ""}"></i>`).join("")}${evs.slice(0, Math.max(0, 5 - rs.length)).map(e => `<i style="background:${evColor(e)}"></i>`).join("")}</span></button>`;
  }
  const sel = remsOn(calSel), selEv = calOn(calSel);
  return `<div class="head"><h2>${m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
    <button data-act="calPrev" aria-label="Previous month">‹</button><button data-act="calToday">Today</button><button data-act="calNext" aria-label="Next month">›</button>
    ${MGR ? `<button class="primary" data-act="remNew" data-date="${calSel}">Add to calendar</button>` : ""}</div>
  <div class="cal">
    <div class="card" style="padding:0;overflow:hidden"><div class="month">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div class="dow">${d}</div>`).join("")}${cells}</div></div>
    <section class="card"><h3>${esc(fmtDate(calSel, { weekday: "long", month: "long", day: "numeric" }))}</h3>
      ${sel.length ? `<div class="list">${sel.map(r => remRow(r, calSel)).join("")}</div>` : `<div class="empty">Nothing on the calendar this day.</div>`}
      ${selEv.length ? `<h3 style="margin-top:16px">On your calendars</h3><div class="list">${selEv.map(evRow).join("")}</div>` : ""}
    </section>
  </div>`;
}

/* ----- messages ----- */
function vMessages() {
  const unread = S.dms.filter(d => d.recipient === me.id && !d.read_at).length;
  const tabs = [["team", "Team board"], ...(MGR ? [["managers", "Managers only"]] : []), ["private", `Private${unread ? ` (${unread})` : ""}`]];
  if (msgTab === "managers" && !MGR) msgTab = "team";
  return `<div class="head"><h2>Messages</h2></div>
  <div class="sub" role="group" aria-label="Message boards">${tabs.map(([k, l]) => `<button data-act="msgTab" data-tab="${k}" aria-pressed="${msgTab === k}">${l}</button>`).join("")}</div>
  ${msgTab === "private" ? vPrivate() : vBoard(msgTab)}`;
}
function vBoard(ch) {
  const msgs = S.messages.filter(m => m.channel === ch).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  return `${ch === "managers" ? `<p class="muted small" style="margin:-4px 0 12px">Only the owner and managers can see this board.</p>` : ""}
  <div class="grid" style="grid-template-columns:minmax(0,1fr)">
  <form class="card" id="postForm" data-ch="${ch}" style="display:flex;flex-direction:column;gap:10px">
    <label class="f" for="msgText">New message <textarea id="msgText" maxlength="4000" placeholder="${ch === "team" ? "Shift notes, announcements, reminders for the next crew…" : "Notes for the management team…"}"></textarea></label>
    <div class="row" style="justify-content:flex-end"><button class="primary" type="submit">Post</button></div>
  </form>
  <section class="card">${msgs.length ? msgs.map(m => `<div class="msg ${m.pinned ? "pinned" : ""}"><span class="av">${esc(initials(nameOf(m.author)))}</span>
    <div style="min-width:0;flex:1"><div class="row small" style="gap:6px"><b>${esc(nameOf(m.author))}</b><span class="muted">${ago(m.created_at)}</span>${m.pinned ? '<span class="chip acc">Pinned</span>' : ""}</div>
    <div class="body">${esc(m.body)}</div>
    ${MGR || m.author === me.id ? `<div class="row" style="gap:2px;margin-top:4px">${MGR ? `<button class="ghost sm" data-act="msgPin" data-id="${m.id}">${m.pinned ? "Unpin" : "Pin"}</button>` : ""}<button class="ghost sm danger" data-act="msgDel" data-id="${m.id}">Delete</button></div>` : ""}</div></div>`).join("") : `<div class="empty">No messages yet.</div>`}</section></div>`;
}
function vPrivate() {
  const others = S.profiles.filter(p => p.id !== me.id && p.active);
  const last = id => { const m = S.dms.find(d => d.sender === id || d.recipient === id); return m ? m.created_at : ""; };
  const unreadFrom = id => S.dms.filter(d => d.sender === id && d.recipient === me.id && !d.read_at).length;
  others.sort((a, b) => last(b.id).localeCompare(last(a.id)) || byName(a, b));
  if (!dmWith && others.length) dmWith = others[0].id;
  const thread = S.dms.filter(d => (d.sender === dmWith && d.recipient === me.id) || (d.sender === me.id && d.recipient === dmWith)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return `<p class="muted small" style="margin:-4px 0 12px">Private messages can only be read by the two people in the conversation.</p>
  ${others.length ? `<div class="dm">
    <div class="card people">${others.map(p => { const u = unreadFrom(p.id); return `<button data-act="dmPick" data-id="${p.id}" aria-pressed="${p.id === dmWith}"><span class="av">${esc(initials(p.name))}</span><span style="flex:1;min-width:0">${esc(p.name || "Someone")}</span>${u ? `<span class="badge">${u}</span>` : ""}</button>`; }).join("")}</div>
    <section class="card" style="display:flex;flex-direction:column;gap:10px;min-width:0">
      <h3 style="margin:0">${esc(nameOf(dmWith))}</h3>
      <div class="thread" id="thread">${thread.length ? thread.map(d => `<div class="bubble ${d.sender === me.id ? "mine" : ""}">${esc(d.body)}<small>${ago(d.created_at)}</small></div>`).join("") : `<div class="empty">No messages yet. Say hello.</div>`}</div>
      <form id="dmForm" class="row" style="flex-wrap:nowrap;align-items:flex-end">
        <label for="dmText" class="f" style="flex:1">Message ${esc(nameOf(dmWith))}<textarea id="dmText" maxlength="4000" style="min-height:44px"></textarea></label>
        <button class="primary" type="submit">Send</button></form>
    </section></div>` : `<div class="empty">Once your team is invited, you can message anyone privately here.</div>`}`;
}
async function markRead() {
  if (view !== "messages" || msgTab !== "private" || !dmWith) return;
  const ids = S.dms.filter(d => d.sender === dmWith && d.recipient === me.id && !d.read_at).map(d => d.id);
  if (!ids.length) return;
  const { error } = await sb.from("direct_messages").update({ read_at: new Date().toISOString() }).in("id", ids);
  if (!error) scheduleReload("dms");
}

/* ----- inventory (supplies) ----- */
const AREAS = ["Dry storage", "Walk-in cooler", "Freezer", "Packaging", "Front counter", "Cleaning", "Other"];
function isLow(i) { return (num(i.par) > 0 || num(i.order_up_to) > 0) && num(i.on_hand) <= num(i.par); }
function suggestQty(i) { const target = num(i.order_up_to) > 0 ? num(i.order_up_to) : num(i.par) * 2; return Math.max(1, Math.ceil(target - num(i.on_hand))); }
function supplies() { return S.inventory.filter(i => (i.item_type || "supply") === "supply"); }
function bySheet(a, b) { return (a.area || "~").localeCompare(b.area || "~") || (num(a.sheet_order) - num(b.sheet_order)) || byName(a, b); }
function vendorOptions() { const vs = [...new Set(supplies().map(i => i.vendor || ""))].sort((a, b) => (a || "~").localeCompare(b || "~")); return ["All", ...vs]; }
function vendorLabel(v) { return v === "All" ? "All vendors" : v === "" ? "No vendor" : v; }
function vendorSelect(id, cur) { return `<select id="${id}" style="width:auto" aria-label="Vendor">${vendorOptions().map(v => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(vendorLabel(v))}</option>`).join("")}</select>`; }
function byVendor(list, v) { return v === "All" ? list : list.filter(i => (i.vendor || "") === v); }
function areasInUse() { return [...new Set([...AREAS, ...supplies().map(i => i.area).filter(Boolean)])]; }
function invStatus(i) { const o = num(i.on_hand), p = num(i.par); if (o <= 0) return '<span class="chip crit">Out</span>'; if (p > 0 && o <= p) return '<span class="chip warn">Low</span>'; return '<span class="chip ok">OK</span>'; }
function vInventory() {
  const tabs = [["items", "Items"], ["count", "Count"], ["vendors", "Vendors"]];
  return `<div class="head"><h2>Supplies</h2>
    ${MGR && invTab === "items" ? `<button class="primary" data-act="invNew">Add item</button>` : ""}
    ${MGR && invTab === "vendors" ? `<button class="primary" data-act="vendNew">Add vendor</button>` : ""}</div>
  <div class="sub" role="group" aria-label="Supplies views">${tabs.map(([k, l]) => `<button data-act="invTab" data-tab="${k}" aria-pressed="${invTab === k}">${l}</button>`).join("")}</div>
  ${invTab === "count" ? vCount() : invTab === "vendors" ? vVendors() : vItems()}`;
}
function vItems() {
  let items = byVendor(supplies(), invF.vendor).sort(bySheet);
  if (invF.area !== "All") items = items.filter(i => (i.area || "") === invF.area);
  if (invF.low) items = items.filter(isLow);
  if (invF.q) items = items.filter(i => (i.name + " " + (i.vendor || "") + " " + (i.vendor_sku || "")).toLowerCase().includes(invF.q.toLowerCase()));
  return `<div class="row" style="margin-bottom:12px">
    <input id="invQ" type="search" placeholder="Search items, vendors or item #" value="${esc(invF.q)}" style="max-width:280px" aria-label="Search supplies">
    ${vendorSelect("invVendor", invF.vendor)}
    <select id="invArea" style="width:auto" aria-label="Storage area">${["All", ...areasInUse().filter(a => byVendor(supplies(), invF.vendor).some(i => i.area === a))].map(c => `<option ${c === invF.area ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <label class="row small" style="gap:6px;font-weight:600"><input type="checkbox" id="invLow" class="check" ${invF.low ? "checked" : ""}> Low or out only</label>
  </div>
  <div class="card" style="padding:0">${supplies().length ? (items.length ? `<div class="scroll"><table><thead><tr><th>Item</th><th>Area</th><th>On hand</th><th>Reorder at</th><th>Order up to</th><th>Vendor</th><th>Status</th><th>Counted</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${MGR ? `<button class="link" data-act="invEdit" data-id="${i.id}">${esc(i.name)}</button>` : esc(i.name)}${i.vendor_sku ? `<div class="small muted">#${esc(i.vendor_sku)}</div>` : ""}</td>
    <td class="muted">${esc(i.area || "")}</td>
    <td><span class="qty">${MGR ? `<button class="sm" data-act="invAdj" data-id="${i.id}" data-d="-1" aria-label="One less ${esc(i.name)}">−</button>` : ""}<b>${fmtNum(i.on_hand)}</b>${MGR ? `<button class="sm" data-act="invAdj" data-id="${i.id}" data-d="1" aria-label="One more ${esc(i.name)}">+</button>` : ""}<span class="small muted">${esc(i.unit || "")}</span></span></td>
    <td>${fmtNum(i.par)}</td><td>${num(i.order_up_to) ? fmtNum(i.order_up_to) : `<span class="muted">–</span>`}</td>
    <td class="muted">${esc(i.vendor || "")}</td><td>${invStatus(i)}</td>
    <td class="small muted">${i.last_counted_at ? esc(ago(i.last_counted_at)) : "Never"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty" style="margin:16px">No items match these filters.</div>`)
    : `<div class="empty" style="margin:16px">No supplies yet.${MGR ? " Add the items from your count sheets, with where they're stored, the vendor and its item number, and a reorder level." : ""}</div>`}</div>`;
}

/* count screen: replaces the paper count sheets */
function vCount() {
  if (!MGR) return `<div class="empty">Only managers can enter counts.</div>`;
  let items = byVendor(supplies(), countVendor).sort(bySheet);
  if (!supplies().length) return `<div class="empty">Add your supplies on the Items tab first. Then counts happen here.</div>`;
  if (countArea !== "All") items = items.filter(i => (i.area || "") === countArea);
  const groups = []; items.forEach(i => { const a = i.area || "Other"; let g = groups.find(x => x.a === a); if (!g) groups.push(g = { a, items: [] }); g.items.push(i); });
  const entered = Object.values(countDraft).filter(v => String(v).trim() !== "").length;
  return `<div class="row" style="margin-bottom:12px;justify-content:space-between">
    <div class="row"><label class="f" for="countVendor" style="flex-direction:row;align-items:center;gap:8px">Vendor ${vendorSelect("countVendor", countVendor)}</label>
    <label class="f" for="countArea" style="flex-direction:row;align-items:center;gap:8px">Area <select id="countArea" style="width:auto">${["All", ...areasInUse().filter(a => byVendor(supplies(), countVendor).some(i => i.area === a))].map(a => `<option ${a === countArea ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label></div>
    <span class="small muted">Type what's on the shelf. Leave a box blank to keep the current number.</span></div>
  ${groups.map(g => `<section class="card" style="margin-bottom:12px"><h3>${esc(g.a)}</h3><div class="list">${g.items.map(i => `<div class="item" style="align-items:center">
      <div class="grow"><div class="t">${esc(i.name)}</div><div class="small muted">${esc(i.unit || "")}${i.unit ? " · " : ""}last count ${fmtNum(i.on_hand)}${i.last_counted_at ? " (" + esc(ago(i.last_counted_at)) + ")" : ""}</div></div>
      <input class="cnt" id="cnt_${i.id}" data-id="${i.id}" type="number" min="0" step="any" inputmode="decimal" style="width:96px" aria-label="Count for ${esc(i.name)}" placeholder="${fmtNum(i.on_hand)}" value="${esc(countDraft[i.id] ?? "")}">
    </div>`).join("")}</div></section>`).join("")}
  <div class="card row" style="position:sticky;bottom:calc(12px + env(safe-area-inset-bottom,0px));justify-content:space-between;z-index:3">
    <span class="small"><b id="countN">${entered}</b> item${entered === 1 ? "" : "s"} counted</span>
    <div class="row"><button data-act="countClear">Clear</button><button class="primary" data-act="countSave">Save count</button></div></div>`;
}
async function saveCount(btn) {
  const entries = Object.entries(countDraft).filter(([, v]) => String(v).trim() !== "");
  if (!entries.length) { toast("Enter at least one count first"); return; }
  btn.disabled = true; btn.textContent = "Saving…";
  const now = new Date().toISOString(), lines = []; let failed = 0;
  for (const [id, v] of entries) {
    const it = S.inventory.find(i => i.id === id); if (!it) continue;
    const qty = Math.max(0, num(v));
    const { error } = await sb.from("inventory_items").update({ on_hand: qty, last_counted_at: now, last_counted_by: me.id, updated_at: now }).eq("id", id);
    if (error) failed++; else lines.push({ item_id: id, name: it.name, qty });
  }
  if (lines.length) await sb.from("inventory_counts").insert({ area: countArea === "All" ? "" : countArea, lines });
  countDraft = {};
  await load("inventory");
  const n = suggestionsByVendor().reduce((a, g) => a + g.items.length, 0);
  toast(failed ? `Saved ${lines.length}; ${failed} didn't save. Try those again.` : `Count saved for ${lines.length} item${lines.length === 1 ? "" : "s"}.${n ? ` ${n} need ordering.` : ""}`);
  if (n && !failed) location.hash = "#orders"; else render();
}

/* vendors */
const METHOD_LABEL = { portal: "Website", email: "Email", phone: "Phone" };
function vVendors() {
  const vs = S.vendors.slice().sort(byName);
  return vs.length ? `<div class="grid">${vs.map(v => {
    const n = supplies().filter(i => i.vendor === v.name).length;
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${MGR ? `<button class="link" data-act="vendEdit" data-id="${v.id}">${esc(v.name)}</button>` : esc(v.name)}</h3><span class="chip acc">${METHOD_LABEL[v.method] || ""}</span></div>
      <div class="small muted" style="margin-top:6px;display:flex;flex-direction:column;gap:3px">
        <span>${n} item${n === 1 ? "" : "s"}</span>
        ${v.order_days ? `<span>${esc(v.order_days)}</span>` : ""}
        ${v.account_no ? `<span>Account ${esc(v.account_no)}</span>` : ""}
        ${v.rep_name || v.phone ? `<span>${esc(v.rep_name || "")}${v.rep_name && v.phone ? " · " : ""}${esc(v.phone || "")}</span>` : ""}
        ${v.email ? `<span>${esc(v.email)}</span>` : ""}
        ${v.notes ? `<span>${esc(v.notes)}</span>` : ""}
      </div>
      ${v.portal_url ? `<a class="btn" href="${esc(v.portal_url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;text-decoration:none">Open ${esc(v.name)} site</a>` : ""}</section>`;
  }).join("")}</div>` : `<div class="empty">No vendors yet.${MGR ? " Add Sysco, SHIPP and anyone else you order from." : ""}</div>`;
}
function vendForm(v) {
  v = v || { method: "portal" };
  openForm({
    title: v.id ? "Edit " + v.name : "New vendor", submit: v.id ? "Save" : "Add vendor", fields: [
      { id: "name", label: "Vendor name", value: v.name, required: true },
      { id: "method", label: "How you place orders", type: "select", value: v.method, options: [["portal", "On their website"], ["email", "Email to a rep"], ["phone", "Phone call"]] },
      { id: "portal_url", label: "Ordering website", type: "url", value: v.portal_url, ph: "https://" },
      [{ id: "rep_name", label: "Rep name", value: v.rep_name }, { id: "phone", label: "Phone", type: "tel", value: v.phone }],
      [{ id: "email", label: "Order email", type: "email", value: v.email }, { id: "account_no", label: "Your account #", value: v.account_no }],
      { id: "order_days", label: "Order cutoff and delivery days", value: v.order_days, ph: "e.g. Order Mon by 2pm, delivers Wed" },
      { id: "notes", label: "Notes", type: "textarea", value: v.notes }],
    onSubmit: d => v.id ? write("vendors", "update", d, v.id) : write("vendors", "insert", d),
    onDelete: v.id ? () => write("vendors", "delete", null, v.id) : null
  });
}

function invForm(i) {
  i = i || { area: invF.area !== "All" ? invF.area : "Dry storage" };
  const vendorOpts = [["", "No vendor"], ...S.vendors.slice().sort(byName).map(v => [v.name, v.name])];
  if (i.vendor && !vendorOpts.some(o => o[0] === i.vendor)) vendorOpts.push([i.vendor, i.vendor]);
  const areaOpts = areasInUse(); if (i.area && !areaOpts.includes(i.area)) areaOpts.push(i.area);
  openForm({
    title: i.id ? "Edit item" : "New supply item", submit: i.id ? "Save" : "Add item",
    fields: [{ id: "name", label: "Item name", value: i.name, required: true, ph: "e.g. 8-inch cake boards" },
      [{ id: "area", label: "Stored in (count section)", type: "select", value: i.area || "Other", options: areaOpts }, { id: "sheet_order", label: "Order on count sheet", type: "number", value: i.sheet_order ?? 0 }],
      [{ id: "unit", label: "Counted in", value: i.unit, ph: "cases, sleeves, each" }, { id: "on_hand", label: "On hand", type: "number", value: i.on_hand ?? 0 }],
      [{ id: "par", label: "Reorder when at or below", type: "number", value: i.par ?? 0 }, { id: "order_up_to", label: "Order back up to", type: "number", value: i.order_up_to ?? 0 }],
      [{ id: "vendor", label: "Vendor", type: "select", value: i.vendor || "", options: vendorOpts }, { id: "vendor_sku", label: "Vendor item #", value: i.vendor_sku }],
      { id: "order_unit", label: "How the vendor sells it (optional)", value: i.order_unit, ph: "e.g. case of 500" },
      { id: "notes", label: "Notes", type: "textarea", value: i.notes }],
    onSubmit: v => { v.updated_at = new Date().toISOString(); v.item_type = "supply"; return i.id ? write("inventory_items", "update", v, i.id) : write("inventory_items", "insert", v); },
    onDelete: i.id ? () => write("inventory_items", "delete", null, i.id) : null
  });
}

/* ----- vendor orders ----- */
const ST_LABEL = { draft: "Draft", placed: "Ordered", received: "Received" };
function onOrderIds() { return new Set(S.orders.filter(o => o.status !== "received").flatMap(o => (o.lines || []).map(l => l.item_id)).filter(Boolean)); }
function suggestionsByVendor() {
  const on = onOrderIds(), groups = [];
  supplies().filter(i => isLow(i) && !on.has(i.id)).sort(bySheet).forEach(i => {
    const v = i.vendor || "No vendor"; let g = groups.find(x => x.v === v); if (!g) groups.push(g = { v, items: [] }); g.items.push(i);
  });
  return groups.sort((a, b) => a.v.localeCompare(b.v));
}
function vOrders() {
  const sugg = MGR ? suggestionsByVendor() : [];
  const card = o => {
    const lines = o.lines || []; return `<div class="item"><div class="grow">
    <div class="row" style="gap:8px">${MGR && o.status !== "received" ? `<button class="link t" data-act="ordEdit" data-id="${o.id}">${esc(o.vendor)}</button>` : `<span class="t">${esc(o.vendor)}</span>`}
    <span class="chip ${o.status === "placed" ? "warn" : o.status === "received" ? "ok" : "acc"}">${ST_LABEL[o.status]}</span></div>
    <div class="small muted">${lines.length} item${lines.length === 1 ? "" : "s"}${o.placed_date ? " · ordered " + esc(fmtDate(o.placed_date)) : ""}${o.expected ? " · expected " + esc(fmtDate(o.expected)) : ""}${o.received_date ? " · received " + esc(fmtDate(o.received_date)) : ""}</div>
    <div class="small" style="margin-top:4px">${lines.slice(0, 4).map(l => `${esc(l.name)} × ${fmtNum(l.qty)}${l.received != null && num(l.received) !== num(l.qty) ? ` <span style="color:var(--crit)">(got ${fmtNum(l.received)})</span>` : ""}`).join(", ")}${lines.length > 4 ? ", …" : ""}</div></div>
    ${MGR ? `<div class="row" style="gap:6px;justify-content:flex-end">
      ${o.status !== "received" ? `<button class="sm" data-act="ordSend" data-id="${o.id}">${o.status === "draft" ? "Send order" : "View list"}</button>` : ""}
      ${o.status === "draft" ? `<button class="sm" data-act="ordPlace" data-id="${o.id}">Mark ordered</button>` : ""}
      ${o.status === "placed" ? `<button class="sm primary" data-act="ordRecv" data-id="${o.id}">Receive</button>` : ""}</div>` : ""}</div>`;
  };
  const list = st => { let os = S.orders.filter(o => o.status === st); if (st === "received") os = os.slice(0, 15); return os; };
  return `<div class="head"><h2>Vendor orders</h2>${MGR ? `<button class="primary" data-act="ordNew">New order</button>` : ""}</div>
  ${MGR ? `<section class="card" style="margin-bottom:16px"><h3>Suggested orders</h3>
    ${sugg.length ? `<p class="small muted" style="margin:-4px 0 8px">Based on your latest counts: items at or below their reorder level that aren't already on an order.</p>
      <div class="grid">${sugg.map(g => `<div style="min-width:0"><div class="row" style="justify-content:space-between;margin-bottom:4px"><b>${esc(g.v)}</b><button class="sm primary" data-act="suggCreate" data-vendor="${esc(g.v)}">${S.orders.some(o => o.status === "draft" && o.vendor === g.v) ? "Add to draft" : "Create order"}</button></div>
        <div class="list">${g.items.map(i => `<div class="item"><div class="grow"><div class="t">${esc(i.name)}</div><div class="small muted">${i.vendor_sku ? "#" + esc(i.vendor_sku) + " · " : ""}have ${fmtNum(i.on_hand)}, reorder at ${fmtNum(i.par)}</div></div><span class="chip warn">Order ${fmtNum(suggestQty(i))}${i.order_unit ? " " + esc(i.order_unit) : ""}</span></div>`).join("")}</div></div>`).join("")}</div>`
      : `<div class="empty">Nothing needs ordering right now. Do a count on the Supplies tab to refresh this.</div>`}</section>` : ""}
  <div class="grid">${["draft", "placed", "received"].map(g => { const os = list(g); return `<section class="card"><h3>${g === "draft" ? "Drafts" : g === "placed" ? "Ordered, waiting on delivery" : "Recently received"}</h3>${os.length ? `<div class="list">${os.map(card).join("")}</div>` : `<div class="empty">None right now.</div>`}</section>`; }).join("")}</div>`;
}
async function createFromSuggestion(vendor) {
  const g = suggestionsByVendor().find(x => x.v === vendor); if (!g) return;
  const lines = g.items.map(i => ({ item_id: i.id, name: i.name, qty: suggestQty(i) }));
  const draft = S.orders.find(o => o.status === "draft" && o.vendor === vendor);
  const now = new Date().toISOString();
  const ok = draft
    ? await write("vendor_orders", "update", { lines: [...(draft.lines || []), ...lines.filter(l => !(draft.lines || []).some(d => d.item_id === l.item_id))], updated_at: now }, draft.id)
    : await write("vendor_orders", "insert", { vendor, status: "draft", lines, updated_at: now });
  if (ok) toast(draft ? `Added ${lines.length} item${lines.length > 1 ? "s" : ""} to the ${vendor} draft` : `Draft order for ${vendor} created. Review it, then Send order.`);
}
function orderRows(o) {
  return (o.lines || []).map(l => { const it = S.inventory.find(i => i.id === l.item_id) || {}; return { sku: it.vendor_sku || "", name: l.name, qty: num(l.qty), unit: it.order_unit || it.unit || "" }; });
}
function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function sendOrder(o) {
  const v = S.vendors.find(x => x.name === o.vendor) || {};
  const rows = orderRows(o);
  const text = `Order from ${CFG.STORE_NAME || "our bakery"}${v.account_no ? ` (account ${v.account_no})` : ""}\n\n` + rows.map(r => `${r.sku ? "#" + r.sku + "  " : ""}${r.name}  x ${fmtNum(r.qty)}${r.unit ? " " + r.unit : ""}`).join("\n") + (o.notes ? `\n\nNotes: ${o.notes}` : "");
  const csv = "Item Number,Description,Quantity,Unit\n" + rows.map(r => [r.sku, r.name, r.qty, r.unit].map(csvCell).join(",")).join("\n");
  const mail = v.email ? `mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent("Order from " + (CFG.STORE_NAME || "our bakery"))}&body=${encodeURIComponent(text)}` : "";
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><div class="dialog" role="dialog" aria-label="Send order">
    <h3>Send order to ${esc(o.vendor)}</h3>
    ${v.order_days ? `<p class="small muted" style="margin:0">${esc(v.order_days)}</p>` : ""}
    <div class="scroll"><table><thead><tr><th>Item #</th><th>Item</th><th>Qty</th><th>Unit</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.sku) || `<span class="muted">–</span>`}</td><td>${esc(r.name)}</td><td>${fmtNum(r.qty)}</td><td class="muted">${esc(r.unit)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">This order has no items.</td></tr>`}</tbody></table></div>
    ${rows.some(r => !r.sku) ? `<p class="small muted" style="margin:0">Add vendor item numbers on the Supplies tab to make entering this faster.</p>` : ""}
    <div class="row">
      ${v.portal_url ? `<a class="btn primary" href="${esc(v.portal_url)}" target="_blank" rel="noopener" style="text-decoration:none">Open ${esc(o.vendor)} site</a>` : ""}
      <button type="button" id="sendCopy">Copy list</button>
      <button type="button" id="sendCsv">Download file</button>
      ${mail ? `<a class="btn" href="${mail}" style="text-decoration:none">Email ${esc(v.rep_name || "rep")}</a>` : ""}
    </div>
    <div class="row" style="justify-content:flex-end;border-top:1px solid var(--line);padding-top:12px">
      <button type="button" data-act="close">Close</button>
      ${o.status === "draft" ? `<button type="button" class="primary" id="sendPlaced">I placed this order</button>` : ""}
    </div></div></div>`;
  $("sendCopy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Order list copied"); } catch (e) { toast("Couldn't copy. Select the list and copy it by hand."); } };
  $("sendCsv").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${o.vendor.replace(/\W+/g, "-")}-order-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove(); };
  const placed = $("sendPlaced");
  if (placed) placed.onclick = async () => { if (await write("vendor_orders", "update", { status: "placed", placed_date: today(), updated_at: new Date().toISOString() }, o.id)) { closeModal(); toast("Marked as ordered"); } };
}
function ordForm(o) {
  o = o ? JSON.parse(JSON.stringify(o)) : { status: "draft", lines: [] };
  let lines = o.lines || [];
  const vendors = [...new Set([...S.vendors.map(v => v.name), ...supplies().map(x => x.vendor), ...S.orders.map(x => x.vendor)].filter(Boolean))];
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><form class="dialog" id="ordDlg" novalidate>
    <h3>${o.id ? "Edit order" : "New vendor order"}</h3>
    <datalist id="ordVend">${vendors.map(v => `<option value="${esc(v)}">`).join("")}</datalist>
    <datalist id="ordItems">${supplies().sort(byName).map(i => `<option value="${esc(i.name)}">`).join("")}</datalist>
    <div class="two"><label class="f" for="oVendor">Vendor<input id="oVendor" list="ordVend" value="${esc(o.vendor || "")}" placeholder="Vendor name" required></label>
    <label class="f" for="oExp">Expected delivery<input id="oExp" type="date" value="${esc(o.expected || "")}"></label></div>
    <div class="row" style="justify-content:space-between"><b class="small">Items</b><button type="button" class="sm" id="oFill">Add low items from this vendor</button></div>
    <div class="lines" id="oLines"></div>
    <button type="button" class="sm" id="oAdd" style="align-self:flex-start">+ Add line</button>
    <label class="f" for="oNotes">Notes<textarea id="oNotes" placeholder="PO number, rep, delivery notes">${esc(o.notes || "")}</textarea></label>
    <div class="row" style="justify-content:flex-end">${o.id ? '<button type="button" class="danger" id="oDel" style="margin-right:auto">Delete</button>' : ""}<button type="button" data-act="close">Cancel</button><button class="primary" type="submit">Save order</button></div>
  </form></div>`;
  const box = $("oLines");
  const sync = () => { lines = [...box.querySelectorAll(".line")].map(r => { const name = r.querySelector(".ln").value.trim(); const inv = S.inventory.find(i => i.name === name); return { name, qty: num(r.querySelector(".lq").value), item_id: inv ? inv.id : "" }; }); };
  const draw = () => { box.innerHTML = lines.length ? lines.map((l, i) => `<div class="line"><input class="ln" list="ordItems" aria-label="Item" value="${esc(l.name)}" placeholder="Item"><input class="lq" type="number" step="any" inputmode="decimal" aria-label="Quantity" value="${esc(l.qty)}"><button type="button" class="sm" data-rm="${i}" aria-label="Remove line">×</button></div>`).join("") : `<div class="empty small">No items yet.</div>`; };
  draw();
  box.addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { sync(); lines.splice(+b.dataset.rm, 1); draw(); } });
  $("oAdd").onclick = () => { sync(); lines.push({ name: "", qty: 1 }); draw(); box.querySelector(".line:last-child .ln").focus(); };
  $("oFill").onclick = () => {
    sync(); const v = $("oVendor").value.trim().toLowerCase();
    const low = supplies().filter(i => isLow(i) && (!v || (i.vendor || "").toLowerCase() === v));
    let added = 0; low.forEach(i => { if (!lines.some(l => l.item_id === i.id || l.name === i.name)) { lines.push({ name: i.name, item_id: i.id, qty: suggestQty(i) }); added++; } });
    draw(); toast(added ? `Added ${added} low item${added > 1 ? "s" : ""}` : v ? "Nothing from this vendor is low" : "Nothing is low right now");
  };
  $("ordDlg").addEventListener("submit", async e => {
    e.preventDefault(); sync();
    const vendor = $("oVendor").value.trim(); if (!vendor) { toast("Add the vendor name"); return; }
    const data = { vendor, expected: $("oExp").value || null, notes: $("oNotes").value.trim(), lines: lines.filter(l => l.name), updated_at: new Date().toISOString() };
    const ok = o.id ? await write("vendor_orders", "update", data, o.id) : await write("vendor_orders", "insert", { ...data, status: "draft" });
    if (ok) { closeModal(); toast("Order saved"); }
  });
  const del = $("oDel");
  if (del) del.onclick = async () => { if (del.dataset.armed) { await write("vendor_orders", "delete", null, o.id); closeModal(); toast("Deleted"); } else { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; } };
}
/* receiving: check off what arrived; received amounts go into inventory */
function receiveForm(o) {
  const lines = o.lines || [];
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><form class="dialog" id="recvDlg" novalidate>
    <h3>Receive ${esc(o.vendor)} delivery</h3>
    <p class="small muted" style="margin:0">Change any amount that came in short or extra. Received amounts are added to inventory.</p>
    <div class="list">${lines.map((l, i) => `<div class="item" style="align-items:center"><div class="grow"><div class="t">${esc(l.name)}</div><div class="small muted">ordered ${fmtNum(l.qty)}${l.item_id && S.inventory.some(x => x.id === l.item_id) ? "" : " · not linked to an inventory item"}</div></div>
      <label class="small" for="rq${i}" style="display:flex;flex-direction:column;gap:2px;font-weight:600">Received<input id="rq${i}" class="rq" data-i="${i}" type="number" min="0" step="any" inputmode="decimal" value="${esc(l.qty)}" style="width:90px"></label></div>`).join("") || `<div class="empty">This order has no items.</div>`}</div>
    <div class="row" style="justify-content:flex-end"><button type="button" data-act="close">Cancel</button><button class="primary" type="submit">Add to inventory</button></div>
  </form></div>`;
  $("recvDlg").addEventListener("submit", async e => {
    e.preventDefault();
    const got = [...document.querySelectorAll(".rq")].map(el => Math.max(0, num(el.value)));
    const now = new Date().toISOString(); const short = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], rec = got[i];
      if (rec < num(l.qty)) short.push(`${l.name} (ordered ${fmtNum(l.qty)}, got ${fmtNum(rec)})`);
      const inv = S.inventory.find(x => x.id === l.item_id) || S.inventory.find(x => x.name === l.name);
      if (inv && rec > 0) await sb.from("inventory_items").update({ on_hand: num(inv.on_hand) + rec, updated_at: now }).eq("id", inv.id);
    }
    const newLines = lines.map((l, i) => ({ ...l, received: got[i] }));
    const notes = short.length ? ((o.notes ? o.notes + "\n" : "") + "Short: " + short.join("; ")) : (o.notes || "");
    if (await write("vendor_orders", "update", { status: "received", received_date: today(), lines: newLines, notes, updated_at: now }, o.id)) {
      scheduleReload("inventory"); closeModal(); toast(short.length ? `Received. ${short.length} item${short.length > 1 ? "s" : ""} came in short.` : "Received. Inventory updated.");
    }
  });
}

/* ----- schedule ----- */
/* Toast Scheduling: when shifts have come over from Toast, the Hub shows those (read-only) */
function norm(x) { return String(x || "").toLowerCase().replace(/[^a-z]/g, ""); }
// Match a Toast shift to a Hub person: same email first, then same name, then a name that starts the same way ("Anna Cate" = "Anna Cate May")
function toastPerson(s) {
  const em = (s.employee_email || "").toLowerCase(), nm = norm(s.employee_name);
  const ps = S.profiles.filter(p => p.active !== false);
  return (em && ps.find(p => (p.email || "").toLowerCase() === em))
    || ps.find(p => norm(p.name) === nm)
    || ps.find(p => wordsMatch(p.name, s.employee_name))
    || null;
}
// "Anna Cate" matches "Anna Cate May": every word of the shorter name matches the start of the longer one (at least 2 words)
function wordsMatch(a, b) { const w = x => String(x || "").toLowerCase().split(/\s+/).map(y => y.replace(/[^a-z]/g, "")).filter(Boolean); const A = w(a), B = w(b), n = Math.min(A.length, B.length); return n >= 2 && A.slice(0, n).join(" ") === B.slice(0, n).join(" "); }
function hubName(s) { const p = toastPerson(s); return p ? p.name : (s.employee_name || "Unassigned"); }
function useToastSched() { return S.tshifts.length > 0; }
function tDay(s) { return ymd(new Date(s.start_at)); }
function tTime(iso) { if (!iso) return "?"; const d = new Date(iso); let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; }
function tHours(s) { return s.end_at ? Math.max(0, (new Date(s.end_at) - new Date(s.start_at)) / 36e5) : 0; }
function myToast() { return S.tshifts.filter(s => { const p = toastPerson(s); return p && p.id === me.id; }); }
function vToastSchedule() {
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i)), dss = days.map(ymd), t = today();
  // Toast shifts plus shifts managers added in the Hub, in one list
  const toastWk = S.tshifts.filter(s => dss.includes(tDay(s))).map(s => ({ name: hubName(s), day: tDay(s), sort: s.start_at, start: tTime(s.start_at), end: tTime(s.end_at), hrs: tHours(s), job: s.job_title, email: s.employee_email || "", hub: null }));
  const hubWk = S.shifts.filter(s => dss.includes(s.date)).map(s => { const p = person(s.staff_id) || {}; return { name: p.name || "Someone", day: s.date, sort: s.date + "T" + s.start_time, start: fmtTime(s.start_time), end: fmtTime(s.end_time), hrs: hours(s.start_time, s.end_time), job: s.note, email: p.email || "", hub: s }; });
  const wk = [...toastWk, ...hubWk];
  const names = [...new Set(wk.map(s => s.name))].sort();
  const myEm = (me.email || "").toLowerCase();
  let total = 0;
  const rows = names.map(n => {
    let tot = 0; const isMe = n === me.name;
    const cells = dss.map(ds => {
      const ss = wk.filter(s => s.name === n && s.day === ds).sort((a, b) => a.sort.localeCompare(b.sort));
      ss.forEach(s => tot += s.hrs);
      return `<td>${ss.map(s => {
        const inner = `${s.start}–${s.end}${s.job ? `<br><span style="font-weight:500">${esc(s.job)}</span>` : ""}${s.hub ? `<br><span class="chip" style="font-size:10px;padding:0 5px;margin-top:2px">Hub</span>` : ""}`;
        return s.hub && MGR ? `<button class="shift" data-act="shiftEdit" data-id="${s.hub.id}">${inner}</button>` : `<div class="shift">${inner}</div>`;
      }).join("")}</td>`;
    }).join("");
    total += tot;
    return `<tr${isMe ? ' style="background:var(--accent-soft)"' : ""}><td><b>${esc(n)}</b></td>${cells}<td><b>${fmtNum(Math.round(tot * 10) / 10)}</b></td></tr>`;
  }).join("");
  const range = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const newest = S.tshifts.reduce((a, s) => s.updated_at > a ? s.updated_at : a, "");
  return `<div class="head"><h2>Week of ${esc(range)}</h2>
    <button data-act="wkPrev" aria-label="Previous week">‹</button><button data-act="wkThis">This week</button><button data-act="wkNext" aria-label="Next week">›</button>
    ${MGR ? `<button class="primary" data-act="shiftNew" data-date="${dss.includes(t) ? t : dss[0]}">Add shift</button>` : ""}</div>
  <p class="muted small" style="margin:-8px 0 14px">From Toast Scheduling${newest ? ", updated " + esc(ago(newest)) : ""}. Make changes in Toast; they show up here within about 15 minutes. Shifts marked <span class="chip" style="font-size:10px;padding:0 5px">Hub</span> were added here for things Toast doesn't send, like offsite events. ${fmtNum(Math.round(total * 10) / 10)} scheduled hours this week.</p>
  ${names.length ? `<div class="card" style="padding:0"><div class="scroll"><table class="sched"><thead><tr><th>Team member</th>${days.map((d, i) => `<th style="${dss[i] === t ? "color:var(--accent)" : ""}">${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()}</th>`).join("")}<th>Hrs</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
  : `<div class="empty">No shifts for this week yet. The Hub keeps about 3 weeks ahead and 3 weeks back from Toast.</div>`}`;
}
function vSchedule() {
  if (useToastSched()) return vToastSchedule();
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i)), dss = days.map(ymd), t = today();
  const staff = S.profiles.filter(p => p.active).sort(byName);
  const wk = S.shifts.filter(s => dss.includes(s.date));
  const rows = staff.map(p => {
    let tot = 0;
    const cells = dss.map(ds => {
      const ss = wk.filter(s => s.staff_id === p.id && s.date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time));
      ss.forEach(s => tot += hours(s.start_time, s.end_time));
      return `<td>${ss.map(s => `<button class="shift" ${MGR ? `data-act="shiftEdit" data-id="${s.id}"` : "disabled"}>${fmtTime(s.start_time)}–${fmtTime(s.end_time)}${s.note ? `<br><span style="font-weight:500">${esc(s.note)}</span>` : ""}</button>`).join("")}${MGR ? `<button class="add" data-act="shiftNew" data-staff="${p.id}" data-date="${ds}" aria-label="Add shift for ${esc(p.name)} on ${esc(fmtDate(ds))}">+</button>` : ""}</td>`;
    }).join("");
    return `<tr${p.id === me.id ? ' style="background:var(--accent-soft)"' : ""}><td><b>${esc(p.name)}</b><div class="small muted">${esc(p.position || "")}</div></td>${cells}<td><b>${fmtNum(Math.round(tot * 10) / 10)}</b></td></tr>`;
  }).join("");
  const range = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const totalHrs = wk.reduce((a, s) => a + hours(s.start_time, s.end_time), 0);
  return `<div class="head"><h2>Week of ${esc(range)}</h2>
    <button data-act="wkPrev" aria-label="Previous week">‹</button><button data-act="wkThis">This week</button><button data-act="wkNext" aria-label="Next week">›</button>
    ${MGR ? `<button data-act="wkCopy">Copy last week</button>` : ""}</div>
  <p class="muted small" style="margin:-8px 0 14px">${fmtNum(Math.round(totalHrs * 10) / 10)} scheduled hours this week.</p>
  <div class="card" style="padding:0"><div class="scroll"><table class="sched"><thead><tr><th>Team member</th>${days.map((d, i) => `<th style="${dss[i] === t ? "color:var(--accent)" : ""}">${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()}</th>`).join("")}<th>Hrs</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function shiftForm(s, staffId, date) {
  s = s || {};
  openForm({
    title: s.id ? "Edit shift" : "New shift", submit: s.id ? "Save" : "Add shift", fields: [
      { id: "staff_id", label: "Team member", type: "select", value: s.staff_id || staffId || "", options: S.profiles.filter(p => p.active).sort(byName).map(p => [p.id, p.name]) },
      { id: "date", label: "Date", type: "date", value: s.date || date, required: true },
      [{ id: "start_time", label: "Start", type: "time", value: hm(s.start_time) || "09:00", required: true }, { id: "end_time", label: "End", type: "time", value: hm(s.end_time) || "17:00", required: true }],
      { id: "note", label: "Position (e.g. Offsite Event)", value: s.note, ph: "e.g. Offsite Event, Key Holder/Joy Creator" }],
    onSubmit: v => s.id ? write("shifts", "update", v, s.id) : write("shifts", "insert", v),
    onDelete: s.id ? () => write("shifts", "delete", null, s.id) : null
  });
}
async function copyLastWeek() {
  const prev = [...Array(7)].map((_, i) => ymd(addDays(weekStart, i - 7)));
  const src = S.shifts.filter(s => prev.includes(s.date));
  if (!src.length) { toast("Last week has no shifts to copy"); return; }
  const cur = new Set(S.shifts.map(s => s.staff_id + "|" + s.date + "|" + hm(s.start_time)));
  const rows = src.map(s => ({ staff_id: s.staff_id, date: ymd(addDays(parse(s.date), 7)), start_time: s.start_time, end_time: s.end_time, note: s.note || "" })).filter(r => !cur.has(r.staff_id + "|" + r.date + "|" + hm(r.start_time)));
  if (!rows.length) { toast("Those shifts are already here"); return; }
  const { error } = await sb.from("shifts").insert(rows);
  if (error) toast("Couldn't copy: " + error.message); else { toast(`Copied ${rows.length} shift${rows.length > 1 ? "s" : ""}`); scheduleReload("shifts"); }
}

/* ----- team ----- */
const ROLE_LABEL = { owner: "Owner", manager: "Manager", staff: "Staff" };
function vTeam() {
  const st = S.profiles.slice().sort((a, b) => (b.active - a.active) || byName(a, b));
  return `<div class="head"><h2>Team</h2>${MGR ? `<button class="primary" data-act="invite">Invite team member</button>` : ""}<button data-act="editMe">Edit my profile</button></div>
  <section class="card"><div class="list">${st.map(p => `<div class="item"><span class="av">${esc(initials(p.name))}</span><div class="grow">
    ${MGR ? `<button class="link t" data-act="personEdit" data-id="${p.id}">${esc(p.name || "Someone")}</button>` : `<span class="t">${esc(p.name || "Someone")}</span>`}
    <div class="small muted">${esc(p.position || "")}${p.phone ? " · " + esc(p.phone) : ""}</div></div>
    <span class="chip ${p.role === "staff" ? "" : "acc"}">${ROLE_LABEL[p.role]}</span>${p.active ? "" : '<span class="chip">Inactive</span>'}</div>`).join("")}</div></section>`;
}
function personForm(p) {
  const roleOpts = OWNER ? [["staff", "Staff"], ["manager", "Manager"], ["owner", "Owner"]] : [["staff", "Staff"], ["manager", "Manager"]];
  const canRole = OWNER || (p.role === "staff");
  openForm({
    title: "Edit " + (p.name || "team member"), fields: [
      { id: "name", label: "Name", value: p.name, required: true },
      { id: "position", label: "Positions (check all that apply)", type: "checks", value: splitPos(p.position), options: posOptions(p.position) },
      { id: "phone", label: "Phone (optional)", type: "tel", value: p.phone },
      { id: "role", label: "Access", type: "select", value: p.role, options: p.role === "owner" && !OWNER ? [["owner", "Owner"]] : roleOpts, disabled: !canRole || p.id === me.id && p.role === "owner" },
      { id: "active", label: "Active (uncheck when someone leaves; they can no longer see manager info)", type: "checkbox", value: p.active }],
    onSubmit: v => write("profiles", "update", v, p.id)
  });
}
function meForm() {
  openForm({
    title: "My profile", fields: [{ id: "name", label: "Name", value: me.name, required: true }, { id: "phone", label: "Phone (optional)", type: "tel", value: me.phone },
      { id: "pw", label: "New password (leave blank to keep yours)", type: "password", value: "" }],
    onSubmit: async v => {
      if (v.pw) { if (v.pw.length < 8) return { error: "Use at least 8 characters for the password." }; const { error } = await sb.auth.updateUser({ password: v.pw }); if (error) return { error: error.message }; }
      return write("profiles", "update", { name: v.name, phone: v.phone }, me.id);
    }
  });
}
function inviteForm() {
  openForm({
    title: "Invite a team member", submit: "Send invite", done: "Invite sent",
    fields: [{ id: "name", label: "Name", required: true }, { id: "email", label: "Email", type: "email", required: true, ph: "They'll get a link to set a password" },
      { id: "position", label: "Positions (check all that apply)", type: "checks", value: ["Joy Creator"], options: POSITIONS },
      { id: "role", label: "Access", type: "select", value: "staff", options: OWNER ? [["staff", "Staff"], ["manager", "Manager"]] : [["staff", "Staff"]] }],
    onSubmit: async v => {
      const { data, error } = await sb.functions.invoke("invite-user", { body: { ...v, redirectTo: location.origin + location.pathname } });
      if (error) { let msg = error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { } return { error: msg }; }
      if (data && data.ok === false) return { error: data.error };
      scheduleReload("profiles"); return true;
    }
  });
}

/* ---------------- NBU & guides ---------------- */
/* NBU-READER-START: reads a PDF (pages, text, links, key dates) with pdf.js */
const PDFJS_URL = CFG.PDFJS_URL || "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";
let pdfjsP = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import(PDFJS_URL + "pdf.min.mjs").then(L => { L.GlobalWorkerOptions.workerSrc = PDFJS_URL + "pdf.worker.min.mjs"; return L; }).catch(e => { pdfjsP = null; throw e; });
  return pdfjsP;
}
function unwrapUrl(u) {
  try { const x = new URL(u); if (/(^|\.)safelinks\.protection\.outlook\.com$/i.test(x.hostname) && x.searchParams.get("url")) return x.searchParams.get("url"); } catch (e) { }
  return u;
}
function safeUrl(u) { u = unwrapUrl(String(u || "")); return /^https?:\/\//i.test(u) ? u : ""; }
const MD = "(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?";
const KEY_RE = new RegExp("^" + MD + "(?:\\s*[-–—]\\s*" + MD + ")?\\s*:\\s*(.+)$");
function normT(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function fullYear(y) { y = Number(y); return y < 100 ? 2000 + y : y; }
function nearDate(m, d, ref) { let best = null; for (const y of [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) { const t = new Date(y, m - 1, d); if (!best || Math.abs(t - ref) < Math.abs(best - ref)) best = t; } return best; }
function isHeading(t) { const L = t.replace(/[^A-Za-z]/g, ""); return L.length >= 3 && !/\d/.test(t) && L.replace(/[^A-Z]/g, "").length / L.length > 0.85; }
function joinItems(items) { let out = "", end = null; for (const it of items) { if (end != null && it.x - end > 1 && !/\s$/.test(out) && !/^\s/.test(it.s)) out += " "; out += it.s; end = it.x + it.w; } return out.replace(/\s+/g, " ").trim(); }
function toLines(items) {
  const lines = [];
  items.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => { const L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) <= Math.max(2, it.h * 0.4)) L.items.push(it); else lines.push({ y: it.y, items: [it] }); });
  lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = joinItems(l.items); });
  return lines.filter(l => l.text);
}
async function readPdf(pdf) {
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n), vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const items = tc.items.map(i => ({ ...i, str: String(i.str || "").replace(/[\uE000-\uF8FF]/g, "") })).filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 10 }));
    const links = (await pg.getAnnotations()).filter(a => a.subtype === "Link" && safeUrl(a.url || a.unsafeUrl)).map(a => ({ url: safeUrl(a.url || a.unsafeUrl), rect: a.rect }));
    // A column of dates down the right side (the NBU's KEY DATES) means a two-column page
    const dx = items.filter(i => i.x > vp.width * 0.5 && /^\d{1,2}\/\d{1,2}/.test(i.s.trim())).map(i => i.x);
    const colX = dx.length >= 3 ? Math.min(...dx) - 4 : null;
    const cols = colX ? [items.filter(i => i.x < colX), items.filter(i => i.x >= colX)] : [items];
    pages.push({ n, w: vp.width, h: vp.height, colX, cols: cols.map(toLines), links });
  }
  return pages;
}
function findKeyDates(pages, ref) {
  const out = [];
  const toYmd = (m, d, y, r) => ymd(y ? new Date(fullYear(y), m - 1, d) : nearDate(m, d, r));
  pages.forEach(p => p.cols.forEach(lines => {
    const head = lines.findIndex(l => /^key dates$/i.test(l.text));
    let cur = null, stop = false;
    lines.forEach((l, i) => {
      if (stop || (head >= 0 && i <= head)) return;
      const m = l.text.match(KEY_RE);
      if (m) {
        const [, m1, d1, y1, m2, d2, y2, title] = m;
        let start, end = null;
        if (m2) { end = toYmd(+m2, +d2, y2, ref); start = y1 ? toYmd(+m1, +d1, y1) : ymd(new Date(parse(end).getFullYear() - (+m1 > +m2 ? 1 : 0), +m1 - 1, +d1)); }
        else start = toYmd(+m1, +d1, y1, ref);
        cur = { start, end, title: title.trim() }; out.push(cur); return;
      }
      if (head < 0 || !cur) return;
      if (isHeading(l.text)) { cur = null; stop = true; return; }
      cur.title += " " + l.text;
    });
  }));
  out.forEach(k => k.title = k.title.replace(/\s+/g, " ").replace(/[\s.;,]+$/, ""));
  return out.filter((k, i) => out.findIndex(o => o.start === k.start && o.end === k.end && o.title === k.title) === i);
}
const GENERIC_LINK = /^(here|click here|register( now)?|learn more|link|this link|view|more)[.!]*$/i;
function findLinks(pages) {
  const by = new Map();
  pages.forEach(p => p.links.forEach(ln => {
    const [x1, y1, x2, y2] = ln.rect;
    const ci = p.colX == null ? 0 : ((x1 + x2) / 2 >= p.colX ? 1 : 0), lines = p.cols[ci];
    let e = by.get(ln.url); if (!e) { e = { url: ln.url, page: p.n, hits: [], lines: null }; by.set(ln.url, e); }
    lines.forEach((l, li) => {
      // an item counts when most of its height sits inside the link box
      const hit = l.items.filter(i => i.x + i.w > x1 + 0.5 && i.x < x2 - 0.5 && Math.min(i.y + i.h, y2) - Math.max(i.y - i.h * 0.2, y1) > i.h * 0.5);
      hit.forEach(i => { if (!e.hits.some(h => h.i === i)) e.hits.push({ i, li }); });
      if (hit.length && !e.lines) e.lines = { lines, li, x: Math.min(...hit.map(i => i.x)) };
    });
  }));
  const clean = t => t.replace(/^[^A-Za-z0-9(]+/, "").replace(/[\s•]+$/, "").trim();
  return [...by.values()].map(e => {
    const raw = clean(joinItems(e.hits.sort((a, b) => a.li - b.li || a.i.x - b.i.x).map(h => h.i)));
    let label = raw, ctx = "";
    if (e.lines) {
      const { lines, li, x } = e.lines, prev = li > 0 ? lines[li - 1].text : "", next = lines[li + 1] ? lines[li + 1].text : "";
      for (let k = li; k >= 0; k--) {
        const t = clean(lines[k].text);
        if (/^(REMINDER|NEW|UPDATE|IMPORTANT)!/i.test(t) || (k < li && isHeading(t) && !GENERIC_LINK.test(t))) { ctx = t.replace(/^(REMINDER|NEW|UPDATE|IMPORTANT)!\s*/i, "").split(/\s[–—-]\s/)[0].trim(); break; }
      }
      if (GENERIC_LINK.test(raw) || raw.length < 4) {
        // use the sentence the link sits in, e.g. "The contest rules can be found here."
        const t = (prev && !/[.!?:]$/.test(prev) && !isHeading(prev) ? prev + " " : (prev && /[.!?]$/.test(prev) && !isHeading(prev) ? prev + " " : "")) + lines[li].text;
        const end = t.toLowerCase().lastIndexOf(raw.toLowerCase());
        if (end >= 0) { const before = t.slice(0, end); const m = before.match(/^.*[.!?:]\s/s); label = clean(t.slice(m ? m[0].length : 0, end + raw.length)); }
        if (GENERIC_LINK.test(label)) label = (ctx ? ctx + ": " : "") + raw.replace(/[.!]+$/, "");
      } else if (raw.length < 16) {
        // a short start, e.g. "(ezManage" - take the rest of the line (and the next if a bracket is still open)
        let t = joinItems(lines[li].items.filter(i => i.x >= x - 0.5));
        if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length && next) t += " " + next;
        label = clean(t.replace(/[()]/g, " ").replace(/\s+/g, " "));
      }
    }
    if (label.length > 110) label = label.slice(0, 107).replace(/\s+\S*$/, "") + "…";
    return { label: label || e.url, url: e.url, page: e.page, ctx: normT(ctx) === normT(label) ? "" : ctx.slice(0, 70) };
  });
}
function findWeek(pages, fileName) {
  const all = pages.flatMap(p => p.cols.flatMap(ls => ls.map(l => l.text))).join("\n");
  let m = all.match(new RegExp("CONTENT APPLICABLE\\s*" + MD + "\\s*[-–—]\\s*" + MD, "i"));
  if (!m) m = String(fileName || "").match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})\s*[-–_]\s*(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})/);
  if (!m) return null;
  const [, m1, d1, y1, m2, d2, y2] = m;
  const end = y2 ? new Date(fullYear(y2), +m2 - 1, +d2) : nearDate(+m2, +d2, new Date());
  const start = y1 ? new Date(fullYear(y1), +m1 - 1, +d1) : new Date(end.getFullYear() - (+m1 > +m2 ? 1 : 0), +m1 - 1, +d1);
  return { start: ymd(start), end: ymd(end) };
}
async function analyzePdf(pdf, fileName) {
  const pages = await readPdf(pdf);
  const week = findWeek(pages, fileName);
  const ref = week ? parse(week.start) : new Date();
  return {
    week, pages: pdf.numPages,
    key_dates: findKeyDates(pages, ref),
    links: findLinks(pages),
    body: pages.map(p => p.cols.map(ls => ls.map(l => l.text).join("\n")).join("\n\n")).join("\n\n").slice(0, 200000)
  };
}
async function renderPdfInto(el, pdf) {
  el.innerHTML = "";
  const w = Math.max(280, el.clientWidth || 800), dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n), base = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: w / base.width });
    const box = document.createElement("div"); box.className = "pdfpage"; box.style.aspectRatio = base.width + " / " + base.height;
    const c = document.createElement("canvas"); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
    c.setAttribute("role", "img"); c.setAttribute("aria-label", "Page " + n + " of " + pdf.numPages);
    box.appendChild(c); el.appendChild(box);
    await pg.render({ canvasContext: c.getContext("2d"), viewport: pg.getViewport({ scale: w / base.width * dpr }) }).promise;
    for (const a of await pg.getAnnotations()) {
      const url = a.subtype === "Link" && safeUrl(a.url || a.unsafeUrl); if (!url) continue;
      const [x1, y1, x2, y2] = typeof vp.convertToViewportRectangle === "function" ? vp.convertToViewportRectangle(a.rect)
        : (([a0, b0, a1, b1], [v0, , , v3]) => [(a0 - v0) * vp.scale, (v3 - b0) * vp.scale, (a1 - v0) * vp.scale, (v3 - b1) * vp.scale])(a.rect, pg.view);
      const L = document.createElement("a"); L.href = url; L.target = "_blank"; L.rel = "noopener noreferrer"; L.title = url; L.setAttribute("aria-label", "Open link: " + url);
      L.style.cssText = `left:${Math.min(x1, x2) / vp.width * 100}%;top:${Math.min(y1, y2) / vp.height * 100}%;width:${Math.abs(x2 - x1) / vp.width * 100}%;height:${Math.abs(y2 - y1) / vp.height * 100}%`;
      box.appendChild(L);
    }
  }
}
/* NBU-READER-END */

const DOC_KINDS = { nbu: "NBU", srg: "Seasonal Readiness Guide", srp: "Seasonal Readiness Planner", other: "Document" };
let docOpen = "", docQ = "", docPending = null;
const docCache = {};
function shortD(s) { return s ? fmtDate(s, { month: "numeric", day: "numeric" }) : ""; }
function docRange(d) { return d.week_start ? (d.week_end && d.week_end !== d.week_start ? shortD(d.week_start) + "–" + shortD(d.week_end) : shortD(d.week_start)) : ""; }
function currentNbu() { const t = today(); return S.docs.filter(d => d.kind === "nbu" && (d.week_end || d.week_start) >= t).sort((a, b) => a.week_start.localeCompare(b.week_start))[0] || null; }
function onCal(date, title) { return S.reminders.some(r => r.date === date && normT(r.title) === normT(title)); }
const REMINDERISH = /\b(due|deadline|training|submit|register|registration|cto|call-to-order|order)\b/i;
function calPlan(keyDates, label) {
  const t = today(), out = [];
  const add = (date, title, kind) => out.push({ date, title, kind, priority: kind === "reminder" ? "critical" : "normal", dup: onCal(date, title) });
  (keyDates || []).forEach(k => {
    const rem = REMINDERISH.test(k.title);
    if (!k.end) add(k.start, k.title, rem ? "reminder" : "event");
    else if (rem) { add(k.start, k.title + " starts", "event"); add(k.end, /\bdue\b/i.test(k.title) ? k.title : k.title + " due", "reminder"); }
    else if ((parse(k.end) - parse(k.start)) / 864e5 <= 7) add(k.start, `${k.title} (${shortD(k.start)}–${shortD(k.end)})`, "event");
    else { add(k.start, k.title + " starts", "event"); add(k.end, k.title + " ends", "event"); }
  });
  out.forEach(p => { p.checked = !p.dup && p.date >= t; p.notes = "From " + label + ". See the NBU tab for details and links."; });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function planHtml(plan) {
  if (!plan.length) return `<div class="small muted">No key dates found to add to the calendar.</div>`;
  return `<div class="small" style="font-weight:600;color:var(--muted);margin-bottom:6px">Add these to the calendar</div><div class="list plan">${plan.map((p, i) => `<label class="item" for="pl_${i}" style="cursor:pointer"><input type="checkbox" class="check" id="pl_${i}" data-i="${i}" ${p.checked ? "checked" : ""}>
    <div class="grow"><div class="t">${esc(p.title)}</div><div class="row small muted" style="gap:6px;margin-top:2px"><span>${esc(fmtDate(p.date))}</span>${p.kind === "event" ? '<span class="chip acc">Event</span>' : '<span class="chip crit">Reminder</span>'}${p.dup ? '<span class="chip ok">Already on calendar</span>' : p.date < today() ? '<span class="chip">Past</span>' : ""}</div></div></label>`).join("")}</div>`;
}
function planRows(form, plan, docId) {
  return [...form.querySelectorAll(".plan input[data-i]:checked")].map(el => plan[+el.dataset.i]).map(p => ({ kind: p.kind, title: p.title, date: p.date, priority: p.priority, category: "NBU", notes: p.notes, repeat: "none", doc_id: docId }));
}
function docLinkRow(l, d) {
  let host = ""; try { host = new URL(l.url).hostname.replace(/^www\./, ""); } catch (e) { }
  return `<div class="item"><span class="lk" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></span><div class="grow">
    <a class="t" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>
    <div class="small muted" style="margin-top:2px">${l.ctx ? esc(l.ctx) + " · " : ""}${esc(host)}${d ? ` · <button class="link" data-act="docOpen" data-id="${d.id}">${esc(d.title)}</button>` : ""}</div></div></div>`;
}
function keyDateRow(k) {
  const when = k.end ? `${fmtDate(k.start, { month: "short", day: "numeric" })} – ${fmtDate(k.end, { month: "short", day: "numeric" })}` : fmtDate(k.start);
  const past = (k.end || k.start) < today();
  return `<div class="item ${past ? "done" : ""}"><div class="kd">${esc(when)}</div><div class="grow t">${esc(k.title)}</div></div>`;
}
function hilite(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return esc(text.slice(0, 140));
  const a = Math.max(0, i - 60), s = text.slice(a, i + q.length + 90).replace(/\s+/g, " ");
  const j = s.toLowerCase().indexOf(q.toLowerCase());
  return (a ? "…" : "") + esc(s.slice(0, j)) + "<mark>" + esc(s.slice(j, j + q.length)) + "</mark>" + esc(s.slice(j + q.length)) + "…";
}
function vDocs() {
  const d = docOpen && S.docs.find(x => x.id === docOpen);
  if (d) return vDoc(d);
  docOpen = "";
  const q = docQ.trim(), ql = q.toLowerCase();
  const head = `<div class="head"><h2>NBU &amp; Guides</h2>${MGR ? `<button class="primary" data-act="docNew">Add NBU, SRG or SRP</button>` : ""}</div>
    <label class="f" for="docQ" style="max-width:520px">Search every NBU and guide<input id="docQ" type="search" placeholder="e.g. holiday hours, CTO, signage, recipe" value="${esc(docQ)}"></label>`;
  if (!S.docs.length) return head + `<div class="empty">${MGR ? "No NBUs yet. Tap “Add NBU, SRG or SRP” and choose the PDF." : "No NBUs posted yet."}</div>`;
  if (q) {
    const links = S.docs.flatMap(x => (x.links || []).filter(l => (l.label + " " + l.ctx).toLowerCase().includes(ql)).map(l => [l, x])).slice(0, 30);
    const hits = S.docs.filter(x => (x.title + "\n" + (x.body || "")).toLowerCase().includes(ql));
    return head + `<div class="grid">
      <section class="card"><h3>Matching links</h3>${links.length ? `<div class="list">${links.map(([l, x]) => docLinkRow(l, x)).join("")}</div>` : `<div class="empty">No links match “${esc(q)}”.</div>`}</section>
      <section class="card"><h3>Mentioned in</h3>${hits.length ? `<div class="list">${hits.map(x => `<div class="item"><div class="grow"><button class="link t" data-act="docOpen" data-id="${x.id}">${esc(x.title)}</button><div class="small muted" style="margin-top:2px">${hilite(x.body || x.title, q)}</div></div></div>`).join("")}</div>` : `<div class="empty">Nothing mentions “${esc(q)}”.</div>`}</section></div>`;
  }
  const cur = currentNbu(), t = today();
  const row = x => `<div class="item"><div class="grow"><button class="link t" data-act="docOpen" data-id="${x.id}">${esc(x.title)}</button>
    <div class="row small muted" style="gap:6px;margin-top:2px">${x.week_start ? `<span>${esc(docRange(x))}</span>` : ""}${cur && cur.id === x.id ? `<span class="chip acc">${x.week_start <= t ? "This week" : "Next up"}</span>` : ""}<span>${(x.links || []).length} links</span><span>${(x.key_dates || []).length} key dates</span></div></div></div>`;
  const group = (k, label) => { const L = S.docs.filter(x => x.kind === k); return L.length ? `<section class="card"><h3>${label}</h3><div class="list">${L.map(row).join("")}</div></section>` : ""; };
  return head + `<div class="grid">${group("nbu", "Nothing Bundt Updates (NBU)")}${group("srg", "Seasonal Readiness Guides (SRG)")}${group("srp", "Seasonal Readiness Planners (SRP)")}${group("other", "Other documents")}</div>`;
}
function vDoc(d) {
  const kd = (d.key_dates || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  return `<div class="head"><button class="ghost sm" data-act="docBack">← All NBUs &amp; guides</button></div>
  <div class="head"><div style="margin-right:auto"><h2 style="margin:0">${esc(d.title)}</h2><div class="small muted">${esc(DOC_KINDS[d.kind] || "Document")}${d.week_start ? " · " + esc(docRange(d)) : ""} · posted ${esc(ago(d.created_at))} by ${esc(nameOf(d.created_by))}</div></div>
    <button data-act="docPdf" data-id="${d.id}">Open PDF</button>${MGR ? `<button data-act="docCal" data-id="${d.id}">Add dates to calendar</button><button class="danger" data-act="docDel" data-id="${d.id}">Delete</button>` : ""}</div>
  <div class="grid">
    <section class="card"><h3>Key dates</h3>${kd.length ? `<div class="list">${kd.map(keyDateRow).join("")}</div>` : `<div class="empty">No key dates found.</div>`}</section>
    <section class="card"><h3>Links${(d.links || []).length ? ` (${d.links.length})` : ""}</h3>${(d.links || []).length ? `<div class="list">${d.links.map(l => docLinkRow(l)).join("")}</div>` : `<div class="empty">No links in this one.</div>`}</section>
  </div>
  <section class="card" style="margin-top:16px"><h3>Full ${esc(d.kind === "nbu" ? "NBU" : d.kind === "srg" ? "SRG" : d.kind === "srp" ? "SRP" : "document")}</h3><p class="small muted" style="margin-top:-4px">Tap any link on the pages to open it.</p><div id="pdfView" class="pdfview"><div class="empty">Loading pages…</div></div></section>`;
}
async function pdfFor(d) {
  if (docCache[d.id] && docCache[d.id].pdf) return docCache[d.id].pdf;
  const { data, error } = await sb.storage.from("documents").download(d.file_path);
  if (error) throw error;
  const L = await pdfjs();
  const pdf = await L.getDocument({ data: new Uint8Array(await data.arrayBuffer()) }).promise;
  (docCache[d.id] = docCache[d.id] || {}).pdf = pdf;
  return pdf;
}
function attachViewer() {
  const slot = $("pdfView"); if (!slot || !docOpen) return;
  const d = S.docs.find(x => x.id === docOpen); if (!d) return;
  const c = docCache[d.id] = docCache[d.id] || {};
  if (c.el) { slot.replaceWith(c.el); return; }
  c.el = slot;
  pdfFor(d).then(pdf => renderPdfInto(c.el, pdf)).catch(e => { console.error(e); c.el.innerHTML = `<div class="empty">Couldn't show the pages here (${esc(e.message || "error")}). Use “Open PDF” instead.</div>`; delete c.el; });
}
function docUpload() {
  docPending = null;
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><form class="dialog" id="docDlg" novalidate><h3>Add an NBU, SRG or SRP</h3>
    <label class="f" for="docKind">What is it?<select id="docKind"><option value="nbu">NBU (weekly update)</option><option value="srg">Seasonal Readiness Guide (SRG)</option><option value="srp">Seasonal Readiness Planner (SRP)</option><option value="other">Other document</option></select></label>
    <label class="f" for="docFile">PDF file<input id="docFile" type="file" accept="application/pdf,.pdf"></label>
    <p class="small muted" style="margin:-4px 0 0">Use the PDF from the email, not a screenshot, so the links still work.</p>
    <div id="docReview"></div><div class="err" id="docErr"></div>
    <div class="row" style="justify-content:flex-end"><button type="button" data-act="close">Cancel</button><button class="primary" type="submit" id="docOk" disabled>Post it</button></div></form></div>`;
  const form = $("docDlg");
  $("docFile").addEventListener("change", () => readUpload());
  $("docKind").addEventListener("change", () => { if (docPending) readUpload(); });
  form.addEventListener("submit", async e => { e.preventDefault(); await saveUpload(form); });
}
async function readUpload() {
  const f = $("docFile").files[0], kind = $("docKind").value, box = $("docReview"); $("docErr").textContent = ""; $("docOk").disabled = true;
  if (!f) { box.innerHTML = ""; return; }
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { $("docErr").textContent = "Choose a PDF file."; return; }
  if (f.size > 50 * 1024 * 1024) { $("docErr").textContent = "That file is over 50 MB. Try a smaller copy."; return; }
  box.innerHTML = `<div class="empty">Reading the PDF…</div>`;
  try {
    const L = await pdfjs();
    const pdf = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const info = await analyzePdf(pdf, f.name);
    const base = f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
    const title = kind === "nbu" && info.week ? `NBU ${shortD(info.week.start)}–${shortD(info.week.end)}` : base;
    const plan = calPlan(info.key_dates, title);
    docPending = { file: f, kind, info, plan, pdf };
    box.innerHTML = `<label class="f" for="docTitle">Title<input id="docTitle" value="${esc(title)}" required></label>
      <div class="two"><label class="f" for="docWs">${kind === "nbu" ? "Week starts" : "Starts (optional)"}<input id="docWs" type="date" value="${info.week ? info.week.start : ""}"></label>
      <label class="f" for="docWe">${kind === "nbu" ? "Week ends" : "Ends (optional)"}<input id="docWe" type="date" value="${info.week ? info.week.end : ""}"></label></div>
      <div class="small muted" style="margin-bottom:10px">Found ${info.pages} page${info.pages === 1 ? "" : "s"}, ${info.links.length} link${info.links.length === 1 ? "" : "s"} and ${info.key_dates.length} key date${info.key_dates.length === 1 ? "" : "s"}.</div>
      ${planHtml(plan)}`;
    $("docOk").disabled = false;
  } catch (e) { console.error(e); box.innerHTML = ""; $("docErr").textContent = "Couldn't read that PDF: " + (e.message || e); }
}
async function saveUpload(form) {
  const p = docPending; if (!p) return;
  const title = $("docTitle").value.trim(); if (!title) { $("docTitle").focus(); $("docErr").textContent = "Give it a title."; return; }
  if (p.kind === "nbu" && !$("docWs").value) { $("docWs").focus(); $("docErr").textContent = "Pick the week it covers."; return; }
  $("docOk").disabled = true; $("docOk").textContent = "Posting…";
  const fail = m => { $("docErr").textContent = m; $("docOk").disabled = false; $("docOk").textContent = "Post it"; };
  const path = `${p.kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const up = await sb.storage.from("documents").upload(path, p.file, { contentType: "application/pdf", upsert: false });
  if (up.error) return fail("Couldn't upload the PDF: " + up.error.message);
  const ws = $("docWs").value || null, we = $("docWe").value || ws;
  const { data, error } = await sb.from("documents").insert({ kind: p.kind, title, week_start: ws, week_end: we, file_path: path, pages: p.info.pages, links: p.info.links, key_dates: p.info.key_dates, body: p.info.body }).select("id").single();
  if (error) { await sb.storage.from("documents").remove([path]); return fail("Couldn't save: " + error.message); }
  const rows = planRows(form, p.plan.map(x => ({ ...x, notes: "From " + title + ". See the NBU tab for details and links." })), data.id);
  if (rows.length) { const r = await sb.from("reminders").insert(rows); if (r.error) toast("Posted, but couldn't add the dates: " + r.error.message); else scheduleReload("reminders"); }
  docCache[data.id] = { pdf: p.pdf };
  docPending = null; closeModal(); scheduleReload("docs");
  toast(rows.length ? `Posted, and ${rows.length} date${rows.length > 1 ? "s" : ""} added to the calendar` : "Posted");
  docOpen = data.id; if (view !== "nbu") location.hash = "#nbu";
}
function docCalForm(d) {
  const plan = calPlan(d.key_dates, d.title);
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><form class="dialog" id="dcDlg" novalidate><h3>Add ${esc(d.title)} dates to the calendar</h3>${planHtml(plan)}<div class="err" id="dcErr"></div>
    <div class="row" style="justify-content:flex-end"><button type="button" data-act="close">Cancel</button><button class="primary" type="submit" id="dcOk" ${plan.length ? "" : "disabled"}>Add to calendar</button></div></form></div>`;
  $("dcDlg").addEventListener("submit", async e => {
    e.preventDefault(); const rows = planRows(e.target, plan, d.id);
    if (!rows.length) { $("dcErr").textContent = "Check at least one date."; return; }
    $("dcOk").disabled = true;
    if (await write("reminders", "insert", rows)) { closeModal(); toast(`${rows.length} date${rows.length > 1 ? "s" : ""} added to the calendar`); } else $("dcOk").disabled = false;
  });
}
async function docDelete(d) {
  const { error } = await sb.from("documents").delete().eq("id", d.id);
  if (error) { toast(error.message.includes("row-level security") ? "You don't have permission to do that." : "Couldn't delete: " + error.message); return; }
  await sb.storage.from("documents").remove([d.file_path]);
  delete docCache[d.id]; docOpen = ""; scheduleReload("docs"); toast("Deleted. Calendar dates it added are kept.");
}
async function docPdfOpen(d) {
  const w = window.open("", "_blank");
  const { data, error } = await sb.storage.from("documents").createSignedUrl(d.file_path, 3600);
  if (error || !data) { if (w) w.close(); toast("Couldn't open the PDF: " + (error ? error.message : "")); return; }
  if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
}
function nbuCard() {
  const d = currentNbu(); if (!d) return "";
  const t = today(), soon = ymd(addDays(new Date(), 14));
  const kd = (d.key_dates || []).filter(k => (k.end || k.start) >= t && k.start <= soon).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
  return `<section class="card"><h3>${d.week_start <= t ? "This week's NBU" : "Next week's NBU"} <span class="small muted" style="font-weight:500">${esc(docRange(d))}</span></h3>
    ${kd.length ? `<div class="list">${kd.map(keyDateRow).join("")}</div>` : `<div class="empty">No key dates in the next two weeks.</div>`}
    <a class="btn" href="#nbu" data-act="docOpen" data-id="${d.id}" style="display:inline-block;margin-top:8px;text-decoration:none">Open the NBU</a></section>`;
}

/* ---------------- recipes ---------------- */
const REC_CATS = [["standard", "Recipes"], ["seasonal", "Seasonal"], ["popup", "Pop-Up"]];
const REC_LABEL = { standard: "Recipe", seasonal: "Seasonal", popup: "Pop-Up" };
let recCat = "all", recQ = "", recOpen = "", recMult = 1;
const recUrls = {};
const FRAC = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875 };
function qtyVal(s) {
  s = s.trim(); let m;
  if ((m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞])$/))) return +m[1] + FRAC[m[2]];
  if (FRAC[s] != null) return FRAC[s];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s);
}
function qtyFmt(n) {
  if (n >= 20 || Math.abs(n * 8 - Math.round(n * 8)) > 0.02) return String(Math.round(n * 100) / 100);
  const w = Math.floor(n + 1e-9), f = Math.round((n - w) * 8);
  const F = { 0: "", 1: "⅛", 2: "¼", 3: "⅜", 4: "½", 5: "⅝", 6: "¾", 7: "⅞" }[f];
  return w ? (F ? w + " " + F : String(w)) : (F || "0");
}
const QTY_RE = /^(\s*)(\d+\s+\d+\/\d+|\d+\s*[½¼¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|[½¼¾⅓⅔⅛⅜⅝⅞]|\d*\.\d+|\d+)(\s*(?:-|–|to)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+))?/;
function scaleLine(line, k) {
  const m = line.match(QTY_RE);
  if (!m) return esc(line);
  const rest = line.slice(m[0].length);
  if (k === 1) return `<b>${esc(m[2] + (m[3] || ""))}</b>${esc(rest)}`;
  const a = qtyFmt(qtyVal(m[2]) * k), b = m[4] ? "–" + qtyFmt(qtyVal(m[4]) * k) : "";
  return `<b>${esc(a + b)}</b>${esc(rest)}`;
}
function recLines(s) { return String(s || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean); }
function recDates(r) { if (!r.available_from && !r.available_to) return ""; const f = s => fmtDate(s, { month: "short", day: "numeric" }); return r.available_from && r.available_to ? `${f(r.available_from)} – ${f(r.available_to)}` : r.available_from ? "From " + f(r.available_from) : "Until " + f(r.available_to); }
function recStatus(r) {
  if (r.category === "standard" || (!r.available_from && !r.available_to)) return "";
  const t = today();
  if (r.available_to && r.available_to < t) return '<span class="chip">Ended</span>';
  if (r.available_from && r.available_from > t) return '<span class="chip warn">Coming up</span>';
  return '<span class="chip ok">Available now</span>';
}
function recRank(r) { const t = today(); if (r.category === "standard") return 1; if (r.available_to && r.available_to < t) return 3; if (r.available_from && r.available_from > t) return 2; return 0; }
function vRecipes() {
  const r = recOpen && S.recipes.find(x => x.id === recOpen);
  if (r) return vRecipe(r);
  recOpen = "";
  const q = recQ.trim().toLowerCase();
  const list = S.recipes.filter(x => (recCat === "all" || x.category === recCat) && (!q || [x.name, x.section, x.ingredients, x.steps, x.notes, x.body].join(" ").toLowerCase().includes(q)));
  const tabs = [["all", "All"], ...REC_CATS];
  const head = `<div class="head"><h2>Recipes</h2>${MGR ? `<button data-act="recNew">Type a recipe</button><button class="primary" data-act="recBulk">Add recipe PDFs</button>` : ""}</div>
    <div class="sub" role="group" aria-label="Recipe types">${tabs.map(([k, l]) => `<button data-act="recCat" data-tab="${k}" aria-pressed="${recCat === k}">${l}${k !== "all" ? ` <span class="small">${S.recipes.filter(x => x.category === k).length}</span>` : ""}</button>`).join("")}</div>
    <label class="f" for="recQ" style="max-width:520px">Search recipes<input id="recQ" type="search" placeholder="e.g. cream cheese frosting, pumpkin, butter" value="${esc(recQ)}"></label>`;
  if (!S.recipes.length) return head + `<div class="empty">${MGR ? "No recipes yet. Tap “Add recipe PDFs” to upload your recipes exactly as written." : "No recipes posted yet."}</div>`;
  if (!list.length) return head + `<div class="empty">No recipes match.</div>`;
  const cats = recCat === "all" ? REC_CATS : REC_CATS.filter(c => c[0] === recCat);
  return head + `<div class="grid">${cats.map(([k, l]) => {
    const L = list.filter(x => x.category === k).sort((a, b) => recRank(a) - recRank(b) || (a.section || "").localeCompare(b.section || "") || a.name.localeCompare(b.name));
    if (!L.length) return "";
    let sec = null;
    return `<section class="card"><h3>${l === "Recipes" ? "Recipes" : l + " recipes"}</h3><div class="list">${L.map(x => {
      const h = k === "standard" && (x.section || "") !== sec ? (sec = x.section || "", `<div class="small" style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding-top:10px">${esc(sec || "Other")}</div>`) : "";
      return h + `<div class="item"><div class="grow"><button class="link t" data-act="recOpen" data-id="${x.id}">${esc(x.name)}</button>
        <div class="row small muted" style="gap:6px;margin-top:2px">${k !== "standard" && x.section ? `<span>${esc(x.section)}</span>` : ""}${x.yield ? `<span>Makes ${esc(x.yield)}</span>` : ""}${recDates(x) ? `<span>${esc(recDates(x))}</span>` : ""}${recStatus(x)}${x.photo_path ? '<span class="chip">Photo</span>' : ""}${x.file_path ? '<span class="chip">PDF</span>' : ""}</div></div></div>`;
    }).join("")}</div></section>`;
  }).join("")}</div>`;
}
function vRecipe(r) {
  const ing = recLines(r.ingredients), steps = recLines(r.steps);
  const mults = [[0.5, "½×"], [1, "1×"], [2, "2×"], [3, "3×"], [4, "4×"]];
  return `<div class="head"><button class="ghost sm" data-act="recBack">← All recipes</button></div>
  <div class="head"><div style="margin-right:auto"><h2 style="margin:0">${esc(r.name)}</h2>
    <div class="row small muted" style="gap:6px;margin-top:4px"><span class="chip acc">${esc(REC_LABEL[r.category] || "Recipe")}</span>${r.section ? `<span>${esc(r.section)}</span>` : ""}${recDates(r) ? `<span>${esc(recDates(r))}</span>` : ""}${recStatus(r)}</div></div>
    ${r.file_path ? `<button data-act="recFile" data-id="${r.id}">Open PDF</button>` : ""}${MGR ? `<button data-act="recEdit" data-id="${r.id}">Edit</button>` : ""}</div>
  ${r.file_path ? `<section class="card" style="margin-bottom:16px"><h3>Recipe</h3><div id="recPdf" class="pdfview" data-path="${esc(r.file_path)}"><div class="empty">Loading the recipe…</div></div></section>` : ""}
  ${ing.length || steps.length || r.notes || r.photo_path || !r.file_path ? `<div class="grid">
    ${ing.length || !r.file_path ? `<section class="card"><h3>${r.file_path ? "Batch calculator" : "Ingredients"}</h3>
      <div class="row small" style="gap:8px;margin-bottom:8px;align-items:center"><span class="muted">Batch size</span><div class="sub" role="group" aria-label="Batch size" style="margin:0">${mults.map(([k, l]) => `<button class="sm" data-act="recMult" data-k="${k}" aria-pressed="${recMult === k}">${l}</button>`).join("")}</div></div>
      ${r.yield ? `<div class="small muted" style="margin-bottom:6px">${recMult !== 1 ? `A 1× batch makes ${esc(r.yield)}. Showing a ${qtyFmt(recMult)}× batch.` : `Makes ${esc(r.yield)}`}</div>` : ""}
      ${ing.length ? `<ul class="ing">${ing.map(l => `<li>${scaleLine(l, recMult)}</li>`).join("")}</ul>` : `<div class="empty">No ingredients listed.</div>`}
      ${r.prep_time ? `<div class="small muted" style="margin-top:8px">Time: ${esc(r.prep_time)}</div>` : ""}
    </section>` : ""}
    ${steps.length || r.notes || !r.file_path ? `<section class="card"><h3>${steps.length || !r.file_path ? "Steps" : "Notes"}</h3>${steps.length ? `<ol class="steps">${steps.map(s => `<li>${esc(s.replace(/^\d+[.)]\s*/, ""))}</li>`).join("")}</ol>` : !r.file_path ? `<div class="empty">No steps listed.</div>` : ""}
      ${r.notes ? `${steps.length || !r.file_path ? `<h3 style="margin-top:14px">Notes</h3>` : ""}<div style="white-space:pre-wrap">${esc(r.notes)}</div>` : ""}</section>` : ""}
    ${r.photo_path ? `<section class="card"><h3>Photo</h3><div id="recPhoto" data-path="${esc(r.photo_path)}"><div class="empty">Loading photo…</div></div></section>` : ""}
  </div>` : ""}`;
}
async function recSigned(path) {
  const c = recUrls[path]; if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await sb.storage.from("recipes").createSignedUrl(path, 3600);
  if (error || !data) throw error || new Error("no link");
  recUrls[path] = { url: data.signedUrl, exp: Date.now() + 50 * 60000 }; return data.signedUrl;
}
const recPdfCache = {};
function attachRecPdf() {
  const slot = $("recPdf"); if (!slot) return;
  const path = slot.dataset.path, c = recPdfCache[path] = recPdfCache[path] || {};
  if (c.el) { slot.replaceWith(c.el); return; }
  c.el = slot;
  (async () => {
    if (!c.pdf) {
      const { data, error } = await sb.storage.from("recipes").download(path); if (error) throw error;
      const L = await pdfjs(); c.pdf = await L.getDocument({ data: new Uint8Array(await data.arrayBuffer()) }).promise;
    }
    await renderPdfInto(c.el, c.pdf);
  })().catch(e => { console.error(e); c.el.innerHTML = `<div class="empty">Couldn't show the recipe here. Use “Open PDF” instead.</div>`; delete c.el; });
}
async function pdfText(file) {
  try { const L = await pdfjs(); const pdf = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const pages = await readPdf(pdf); return pages.map(p => p.cols.map(ls => ls.map(l => l.text).join("\n")).join("\n")).join("\n\n").slice(0, 100000); }
  catch (e) { console.error(e); return ""; }
}
function recNameFromFile(n) { return n.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim(); }
function recBulk() {
  const sections = [...new Set(S.recipes.map(x => x.section).filter(Boolean))].sort();
  $("modal").innerHTML = `<div class="scrim" data-act="closeScrim"><form class="dialog" id="rbDlg" novalidate><h3>Add recipe PDFs</h3>
    <p class="small muted" style="margin:0">Pick one or more PDFs. Each one becomes its own recipe, named after the file. You can rename any of them after.</p>
    <div class="two"><label class="f" for="rbCat">Type<select id="rbCat">${REC_CATS.map(([k, l]) => `<option value="${k}" ${k === (recCat === "all" ? "standard" : recCat) ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f" for="rbSec">Group (optional)<input id="rbSec" list="rbSecs" placeholder="e.g. Frosting, Cakes"><datalist id="rbSecs">${sections.map(x => `<option value="${esc(x)}">`).join("")}</datalist></label></div>
    <div class="two"><label class="f" for="rbFrom">Available from (seasonal / pop-up)<input id="rbFrom" type="date"></label><label class="f" for="rbTo">Available until<input id="rbTo" type="date"></label></div>
    <label class="f" for="rbFiles">Recipe PDFs<input id="rbFiles" type="file" accept="application/pdf,.pdf" multiple></label>
    <div id="rbList" class="small muted"></div><div class="err" id="rbErr"></div>
    <div class="row" style="justify-content:flex-end"><button type="button" data-act="close">Cancel</button><button class="primary" type="submit" id="rbOk">Add recipes</button></div></form></div>`;
  $("rbFiles").addEventListener("change", e => { const f = [...e.target.files]; $("rbList").innerHTML = f.length ? `${f.length} recipe${f.length > 1 ? "s" : ""}: ` + f.map(x => esc(recNameFromFile(x.name))).join(", ") : ""; });
  $("rbDlg").addEventListener("submit", async e => {
    e.preventDefault();
    const files = [...$("rbFiles").files], err = $("rbErr"), ok = $("rbOk");
    if (!files.length) { err.textContent = "Choose at least one PDF."; return; }
    const from = $("rbFrom").value || null, to = $("rbTo").value || null;
    if (from && to && to < from) { err.textContent = "“Available until” is before “Available from”."; return; }
    ok.disabled = true; let done = 0; const failed = [];
    for (const f of files) {
      ok.textContent = `Adding ${done + 1} of ${files.length}…`;
      try {
        const path = await recUpload(f, "pdf"), body = await pdfText(f);
        const { error } = await sb.from("recipes").insert({ name: recNameFromFile(f.name), category: $("rbCat").value, section: $("rbSec").value.trim(), available_from: from, available_to: to, file_path: path, body });
        if (error) { sb.storage.from("recipes").remove([path]); throw error; }
        done++;
      } catch (x) { failed.push(f.name + " (" + (x.message || "error") + ")"); }
    }
    scheduleReload("recipes");
    if (failed.length) { err.textContent = `Added ${done}. Couldn't add: ` + failed.join("; "); ok.disabled = false; ok.textContent = "Try again"; return; }
    closeModal(); toast(`Added ${done} recipe${done > 1 ? "s" : ""}`);
  });
}
function attachRecPhoto() {
  const el = $("recPhoto"); if (!el) return;
  recSigned(el.dataset.path).then(u => { if ($("recPhoto") === el) el.innerHTML = `<img src="${esc(u)}" alt="${esc((S.recipes.find(x => x.id === recOpen) || {}).name || "Recipe")} photo" style="width:100%;border-radius:8px;display:block">`; })
    .catch(() => { el.innerHTML = `<div class="empty">Couldn't load the photo.</div>`; });
}
async function recUpload(file, kind) {
  if (!file) return null;
  const okType = kind === "photo" ? /^image\//.test(file.type) : /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  if (!okType) throw new Error(kind === "photo" ? "The photo must be an image (JPG or PNG)." : "The attachment must be a PDF.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That file is over 20 MB.");
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [kind === "photo" ? ".jpg" : ".pdf"])[0].toLowerCase();
  const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error } = await sb.storage.from("recipes").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error("Couldn't upload: " + error.message);
  return path;
}
function recForm(r, cat) {
  r = r || {};
  const sections = [...new Set(S.recipes.map(x => x.section).filter(Boolean))].sort();
  openForm({
    title: r.id ? "Edit recipe" : "Add a recipe", submit: r.id ? "Save" : "Add recipe",
    extra: `<datalist id="recSections">${sections.map(s => `<option value="${esc(s)}">`).join("")}</datalist>`,
    fields: [
      { id: "name", label: "Recipe name", value: r.name, required: true, ph: "e.g. Cream Cheese Frosting" },
      [{ id: "category", label: "Type", type: "select", value: r.category || cat || "standard", options: REC_CATS },
       { id: "section", label: "Group (optional)", value: r.section, list: "recSections", ph: "e.g. Frosting, Cakes, Fillings" }],
      [{ id: "yield", label: "Makes (optional)", value: r.yield, ph: "e.g. 1 tub, 24 Bundtlets" }, { id: "prep_time", label: "Time (optional)", value: r.prep_time, ph: "e.g. 20 min + 2 hr chill" }],
      [{ id: "available_from", label: "Available from (seasonal / pop-up)", type: "date", value: r.available_from || "" }, { id: "available_to", label: "Available until", type: "date", value: r.available_to || "" }],
      { id: "pdf", label: r.file_path ? "Replace the recipe PDF (optional)" : "Recipe PDF (shown exactly as written)", type: "file", accept: "application/pdf,.pdf" },
      { id: "ingredients", label: "Ingredients (optional, one per line, amount first, e.g. 2 lb cream cheese, for the batch calculator)", type: "textarea", value: r.ingredients },
      { id: "steps", label: "Steps (optional, one per line)", type: "textarea", value: r.steps },
      { id: "notes", label: "Notes (optional)", type: "textarea", value: r.notes },
      { id: "photo", label: r.photo_path ? "Replace photo (optional)" : "Photo (optional)", type: "file", accept: "image/*" },
      ...(r.photo_path ? [{ id: "rm_photo", label: "Remove the current photo", type: "checkbox" }] : []),
      ...(r.file_path ? [{ id: "rm_pdf", label: "Remove the current PDF", type: "checkbox" }] : [])
    ],
    onSubmit: async v => {
      const row = { name: v.name, category: v.category, section: v.section, yield: v.yield, prep_time: v.prep_time, ingredients: v.ingredients, steps: v.steps, notes: v.notes,
        available_from: v.available_from || null, available_to: v.available_to || null, updated_at: new Date().toISOString() };
      if (row.available_from && row.available_to && row.available_to < row.available_from) return { error: "“Available until” is before “Available from”." };
      const old = [];
      try {
        if (v.photo) { row.photo_path = await recUpload(v.photo, "photo"); if (r.photo_path) old.push(r.photo_path); }
        else if (v.rm_photo) { row.photo_path = null; old.push(r.photo_path); }
        if (v.pdf) { row.file_path = await recUpload(v.pdf, "pdf"); row.body = await pdfText(v.pdf); if (r.file_path) old.push(r.file_path); }
        else if (v.rm_pdf) { row.file_path = null; row.body = ""; old.push(r.file_path); }
      } catch (e) { return { error: e.message }; }
      const ok = r.id ? await write("recipes", "update", row, r.id) : await write("recipes", "insert", row);
      if (ok && old.length) sb.storage.from("recipes").remove(old);
      return ok;
    },
    onDelete: r.id ? async () => { const ok = await write("recipes", "delete", null, r.id); if (ok) { const f = [r.photo_path, r.file_path].filter(Boolean); if (f.length) sb.storage.from("recipes").remove(f); recOpen = ""; } } : null
  });
}

/* ---------------- render ---------------- */
function views() {
  return [["today", "Today"], ...(MGR ? [["sales", "Sales"]] : []), ["calendar", "Calendar"], ["nbu", "NBU/SRG"], ["recipes", "Recipes"], ["messages", "Messages"], ["inventory", "Supplies"], ["orders", "Orders"], ["schedule", "Schedule"], ["team", "Team"]];
}
function renderTabs() {
  const t = today();
  const crit = overdue().length + remsOn(t).filter(r => !isEvent(r) && r.priority === "critical" && !isDone(r, t)).length;
  const low = S.inventory.filter(i => isLow(i)).length;
  const unread = S.dms.filter(d => d.recipient === me.id && !d.read_at).length;
  const badge = { today: crit, inventory: MGR ? low : 0, messages: unread };
  $("tabs").innerHTML = views().map(([k, l]) => `<a href="#${k}" ${k === view ? 'aria-current="page"' : ""}>${l}${badge[k] ? `<span class="badge">${badge[k]}</span>` : ""}</a>`).join("");
  $("storeName").textContent = CFG.STORE_NAME || "Bakery Hub";
  $("whoLine").textContent = `${me.name || "Signed in"} · ${ROLE_LABEL[me.role] || ""}`;
}
function render() {
  if (!me) return;
  renderTabs();
  const main = $("main");
  const keep = ["msgText", "dmText", "invQ", "docQ", "recQ"].map(id => { const el = $(id); return el ? [id, el.value, el === document.activeElement, el.selectionStart] : null; }).filter(Boolean);
  const fn = { today: vToday, sales: vSales, calendar: vCalendar, nbu: vDocs, recipes: vRecipes, messages: vMessages, inventory: vInventory, orders: vOrders, schedule: vSchedule, team: vTeam }[view] || vToday;
  const ae = document.activeElement, cntFocus = ae && ae.id && ae.id.startsWith("cnt_") ? ae.id : null;
  main.innerHTML = fn();
  if (view === "nbu") attachViewer();
  if (view === "recipes") { attachRecPhoto(); attachRecPdf(); }
  if (cntFocus) { const el = $(cntFocus); if (el) el.focus(); }
  keep.forEach(([id, val, focused, pos]) => { const el = $(id); if (!el) return; el.value = val; if (focused) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { } } });
  const th = $("thread"); if (th) th.scrollTop = th.scrollHeight;
  markRead();
}
function route() {
  const h = location.hash.slice(1);
  view = views().some(v => v[0] === h) ? h : "today";
  if (view === "sales" && !salesDate) { salesDate = today(); loadSalesDetail().then(render); }
  render(); window.scrollTo(0, 0);
}

/* ---------------- events ---------------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a === "closeScrim") { if (e.target === b) closeModal(); return; }
  if (a === "remDone") return;
  switch (a) {
    case "close": closeModal(); break;
    case "openPrivate": msgTab = "private"; break;
    case "remNew": remForm(null, b.dataset.date); break;
    case "remEdit": remForm(S.reminders.find(r => r.id === id)); break;
    case "calPick": { calSel = b.dataset.date; const d = parse(calSel); if (d.getMonth() !== calMonth.getMonth()) calMonth = startOfMonth(d); render(); break; }
    case "calPrev": calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); render(); break;
    case "calNext": calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); render(); break;
    case "calToday": calMonth = startOfMonth(new Date()); calSel = today(); render(); break;
    case "msgTab": msgTab = b.dataset.tab; render(); break;
    case "dmPick": dmWith = id; render(); break;
    case "msgPin": { const m = S.messages.find(x => x.id === id); if (m) write("messages", "update", { pinned: !m.pinned }, id); break; }
    case "msgDel": if (b.dataset.armed) write("messages", "delete", null, id); else { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; } break;
    case "invNew": invForm(); break;
    case "invEdit": invForm(S.inventory.find(i => i.id === id)); break;
    case "invAdj": { const i = S.inventory.find(x => x.id === id); if (i) { i.on_hand = Math.max(0, num(i.on_hand) + num(b.dataset.d)); render(); write("inventory_items", "update", { on_hand: i.on_hand, updated_at: new Date().toISOString() }, id); } break; }
    case "ordNew": ordForm(); break;
    case "ordEdit": ordForm(S.orders.find(o => o.id === id)); break;
    case "ordPlace": write("vendor_orders", "update", { status: "placed", placed_date: today(), updated_at: new Date().toISOString() }, id); toast("Marked as ordered"); break;
    case "ordRecv": { const o = S.orders.find(x => x.id === id); if (o) receiveForm(o); break; }
    case "ordSend": { const o = S.orders.find(x => x.id === id); if (o) sendOrder(o); break; }
    case "suggCreate": createFromSuggestion(b.dataset.vendor); break;
    case "invTab": invTab = b.dataset.tab; render(); break;
    case "countSave": saveCount(b); break;
    case "countClear": countDraft = {}; render(); break;
    case "vendNew": vendForm(); break;
    case "vendEdit": vendForm(S.vendors.find(v => v.id === id)); break;
    case "shiftNew": shiftForm(null, b.dataset.staff, b.dataset.date); break;
    case "shiftEdit": shiftForm(S.shifts.find(s => s.id === id)); break;
    case "wkPrev": weekStart = addDays(weekStart, -7); render(); break;
    case "wkNext": weekStart = addDays(weekStart, 7); render(); break;
    case "wkThis": weekStart = monday(new Date()); render(); break;
    case "wkCopy": copyLastWeek(); break;
    case "invite": inviteForm(); break;
    case "docNew": docUpload(); break;
    case "recBulk": recBulk(); break;
    case "recNew": recForm(null, recCat === "all" ? "standard" : recCat); break;
    case "recOpen": recOpen = id; recMult = 1; render(); window.scrollTo(0, 0); break;
    case "recBack": recOpen = ""; render(); window.scrollTo(0, 0); break;
    case "recCat": recCat = b.dataset.tab; render(); break;
    case "recMult": recMult = Number(b.dataset.k) || 1; render(); break;
    case "recEdit": { const r = S.recipes.find(x => x.id === id); if (r) recForm(r); break; }
    case "recFile": { const r = S.recipes.find(x => x.id === id); if (!r || !r.file_path) break; const w = window.open("", "_blank"); recSigned(r.file_path).then(u => { if (w) w.location.href = u; else location.href = u; }).catch(e => { if (w) w.close(); toast("Couldn't open the PDF."); }); break; }
    case "docOpen": docOpen = id; if (view === "nbu") { render(); window.scrollTo(0, 0); } break;
    case "docBack": docOpen = ""; render(); window.scrollTo(0, 0); break;
    case "docPdf": { const d = S.docs.find(x => x.id === id); if (d) docPdfOpen(d); break; }
    case "docCal": { const d = S.docs.find(x => x.id === id); if (d) docCalForm(d); break; }
    case "docDel": { const d = S.docs.find(x => x.id === id); if (!d) break; if (b.dataset.armed) docDelete(d); else { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; } break; }
    case "editMe": meForm(); break;
    case "personEdit": personForm(person(id)); break;
    case "salesPick": salesDate = b.dataset.date; await loadSalesDetail(); render(); break;
    case "syncNow": {
      b.disabled = true; b.textContent = "Syncing…";
      const { data, error } = await sb.functions.invoke("toast-sync", { body: { date: salesDate } });
      if (error || (data && data.ok === false)) { let msg = (data && data.error) || error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch (x) { } toast("Sync problem: " + msg); }
      else toast("Updated from Toast");
      await Promise.all([load("sales"), load("synclog"), loadSalesDetail()]); render(); break;
    }
  }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset && t.dataset.act === "remDone") {
    const r = S.reminders.find(x => x.id === t.dataset.id); if (!r) return;
    const ds = t.dataset.date; let dd = (r.done_dates || []).slice();
    dd = t.checked ? [...new Set([...dd, ds])] : dd.filter(x => x !== ds);
    if (dd.length > 400) dd = dd.slice(-400);
    write("reminders", "update", { done_dates: dd }, r.id); return;
  }
  if (t.id === "invArea") { invF.area = t.value; render(); }
  if (t.id === "countArea") { countArea = t.value; render(); }
  if (t.id === "countVendor") { countVendor = t.value; countArea = "All"; render(); }
  if (t.id === "invVendor") { invF.vendor = t.value; invF.area = "All"; render(); }
  if (t.id === "invLow") { invF.low = t.checked; render(); }
  if (t.id === "salesDate" && t.value) { salesDate = t.value; await loadSalesDetail(); render(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "invQ") { invF.q = e.target.value; render(); }
  if (e.target.id === "docQ") { docQ = e.target.value; render(); }
  if (e.target.id === "recQ") { recQ = e.target.value; render(); }
  if (e.target.classList && e.target.classList.contains("cnt")) {
    countDraft[e.target.dataset.id] = e.target.value;
    const n = $("countN"); if (n) n.textContent = Object.values(countDraft).filter(v => String(v).trim() !== "").length;
  }
});
document.addEventListener("submit", async e => {
  if (e.target.id === "postForm") {
    e.preventDefault();
    const ta = $("msgText"), body = ta.value.trim(); if (!body) { ta.focus(); toast("Write a message first"); return; }
    if (await write("messages", "insert", { body, channel: e.target.dataset.ch })) { ta.value = ""; toast("Posted"); }
  }
  if (e.target.id === "dmForm") {
    e.preventDefault();
    const ta = $("dmText"), body = ta.value.trim(); if (!body || !dmWith) return;
    if (await write("direct_messages", "insert", { body, recipient: dmWith })) { ta.value = ""; }
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("modal").innerHTML) closeModal();
  if (e.key === "Enter" && !e.shiftKey && e.target.id === "dmText") { e.preventDefault(); $("dmForm").requestSubmit(); }
});
window.addEventListener("hashchange", route);
$("signOut").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });

/* ---------------- sign in ---------------- */
function showAuth(mode, msg) {
  $("appView").hidden = true; const a = $("authView"); a.hidden = false;
  const brand = `<div class="brand"><span class="mark" aria-hidden="true"></span><div><h1>${esc(CFG.STORE_NAME || "Bakery Hub")}</h1><small>Team sign in</small></div></div>`;
  if (mode === "setpw") {
    a.innerHTML = `<form class="card" id="pwForm">${brand}<h3>Choose your password</h3>
      <label class="f" for="pw1">New password<input id="pw1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="f" for="pw2">Type it again<input id="pw2" type="password" autocomplete="new-password" required></label>
      <div class="err" id="authErr">${esc(msg || "")}</div><button class="primary" type="submit">Save password</button></form>`;
    $("pwForm").onsubmit = async e => {
      e.preventDefault(); const p1 = $("pw1").value, p2 = $("pw2").value;
      if (p1.length < 8) { $("authErr").textContent = "Use at least 8 characters."; return; }
      if (p1 !== p2) { $("authErr").textContent = "The two passwords don't match."; return; }
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) { $("authErr").textContent = error.message; return; }
      history.replaceState(null, "", location.pathname); startApp();
    };
    return;
  }
  a.innerHTML = `<form class="card" id="loginForm">${brand}
    <label class="f" for="em">Email<input id="em" type="email" autocomplete="email" required></label>
    <label class="f" for="pw">Password<input id="pw" type="password" autocomplete="current-password" required></label>
    <div class="err" id="authErr">${esc(msg || "")}</div>
    <button class="primary" type="submit">Sign in</button>
    <button type="button" class="ghost sm" id="forgot">Forgot your password?</button></form>`;
  $("loginForm").onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $("em").value.trim(), password: $("pw").value });
    if (error) $("authErr").textContent = error.message === "Invalid login credentials" ? "That email and password don't match. Try again or reset your password." : error.message;
  };
  $("forgot").onclick = async () => {
    const em = $("em").value.trim(); if (!em) { $("authErr").textContent = "Type your email first, then tap this again."; $("em").focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    $("authErr").textContent = error ? error.message : "Check your email for a link to reset your password.";
  };
}

async function startApp() {
  if (starting) return; starting = true;
  try { await startAppInner(); } finally { starting = false; }
}
async function startAppInner() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (!session) { showAuth("login"); return; }
  await load("profiles"); refreshMe();
  if (!me) { showAuth("login", "Your account isn't set up yet. Ask a manager to invite you."); await sb.auth.signOut(); return; }
  if (!me.active) { await sb.auth.signOut(); showAuth("login", "Your account has been turned off. Talk to a manager."); return; }
  $("authView").hidden = true; $("appView").hidden = false;
  $("main").innerHTML = `<div class="empty">Loading…</div>`;
  await Promise.all(["reminders", "messages", "dms", "inventory", "vendors", "orders", "shifts", "tshifts", "cal", "docs", "recipes", "sales", "synclog"].map(load));
  if (!booted) {
    booted = true;
    channel = sb.channel("hub");
    Object.keys(TABLE_TO_KEY).forEach(t => channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => scheduleReload(TABLE_TO_KEY[t])));
    channel.subscribe();
    setInterval(() => { if (view === "today" || view === "messages") render(); }, 60000); // keep "x min ago" fresh
  }
  route();
}

if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  $("authView").hidden = false;
  $("authView").innerHTML = `<div class="card" style="max-width:460px"><h3>Almost there</h3><p>Open <b>config.js</b> and fill in your Supabase project URL and key, then redeploy.</p></div>`;
} else {
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") showAuth("setpw");
    if (event === "SIGNED_IN" && !/type=(invite|recovery)/.test(INITIAL_HASH) && !me) startApp();
    if (event === "SIGNED_OUT") { me = null; }
  });
  if (/type=invite/.test(INITIAL_HASH) || /type=recovery/.test(INITIAL_HASH)) {
    // wait for Supabase to read the link, then ask for a password
    setTimeout(async () => { const { data } = await sb.auth.getSession(); if (data.session) showAuth("setpw"); else showAuth("login", "That link has expired. Ask a manager to resend your invite, or use Forgot your password."); }, 600);
  } else {
    startApp();
  }
}
})();
