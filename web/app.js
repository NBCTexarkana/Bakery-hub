/* Texarkana Bakery Hub - web app (no build step). Talks to Supabase. */
(function () {
"use strict";
const CFG = window.BAKERY_CONFIG || {};
const INITIAL_HASH = location.hash; // read before Supabase consumes invite/recovery tokens
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

const REM_CATS = ["Food safety", "Ordering", "Equipment", "Cleaning", "Payroll & admin", "Events", "Other"];
const INV_CATS = ["Ingredients", "Packaging", "Retail", "Supplies", "Other"];
const POSITIONS = ["Joy Creator", "Froster", "Baker", "Utility", "Shift Lead", "Key Holder", "Offsite Event", "Manager", "Owner"];
function splitPos(s) { return String(s || "").split(/\s*[,\/]\s*/).map(x => x.trim()).filter(Boolean); }
function posOptions(cur) { const extra = splitPos(cur).filter(x => !POSITIONS.includes(x)); return [...POSITIONS, ...extra]; }
const TARGET = Number(CFG.LABOR_TARGET_PCT) || 25;

const S = { profiles: [], reminders: [], messages: [], dms: [], inventory: [], vendors: [], orders: [], shifts: [], tshifts: [], sales: [], hourly: [], items: [], synclog: [] };
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
  tshifts: () => sb.from("toast_shifts").select("*").gte("start_at", new Date(Date.now() - 21 * 864e5).toISOString()).order("start_at").limit(3000),
  shifts: () => sb.from("shifts").select("*").gte("date", ymd(addDays(new Date(), -120))).lte("date", ymd(addDays(new Date(), 180))),
  sales: () => sb.from("sales_daily").select("*").order("business_date", { ascending: false }).limit(400),
  synclog: () => sb.from("sync_log").select("*").order("ran_at", { ascending: false }).limit(5),
};
const TABLE_TO_KEY = { profiles: "profiles", reminders: "reminders", messages: "messages", direct_messages: "dms", inventory_items: "inventory", vendors: "vendors", vendor_orders: "orders", shifts: "shifts", toast_shifts: "tshifts", sales_daily: "sales" };
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
function remsOn(ds) { return S.reminders.filter(r => occurs(r, ds)).sort((a, b) => (b.priority === "critical") - (a.priority === "critical") || (a.time || "99").localeCompare(b.time || "99")); }
function isDone(r, ds) { return (r.done_dates || []).includes(ds); }
function overdue() { const t = today(); return S.reminders.filter(r => r.repeat === "none" && r.date < t && !isDone(r, r.date)); }
const REPEAT_LABEL = { none: "", daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
function remRow(r, ds, showDate) {
  const d = isDone(r, ds);
  return `<div class="item ${d ? "done" : ""}">
    <input type="checkbox" class="check" data-act="remDone" data-id="${r.id}" data-date="${ds}" ${d ? "checked" : ""} ${MGR ? "" : "disabled"} aria-label="Mark ${esc(r.title)} done">
    <div class="grow">${MGR ? `<button class="link t" data-act="remEdit" data-id="${r.id}">${esc(r.title)}</button>` : `<span class="t">${esc(r.title)}</span>`}
      <div class="row small muted" style="gap:6px;margin-top:2px">
        ${r.priority === "critical" ? '<span class="chip crit">Critical</span>' : ""}
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
    title: r.id ? "Edit reminder" : "New reminder", submit: r.id ? "Save" : "Add reminder", fields: [
      { id: "title", label: "What needs to happen", value: r.title, required: true, ph: "e.g. Health permit renewal due" },
      [{ id: "date", label: "Date", type: "date", value: r.date || date || today(), required: true }, { id: "time", label: "Time (optional)", type: "time", value: hm(r.time) }],
      [{ id: "repeat", label: "Repeats", type: "select", value: r.repeat || "none", options: [["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"], ["yearly", "Every year"]] },
       { id: "priority", label: "Priority", type: "select", value: r.priority || "critical", options: [["critical", "Critical"], ["normal", "Normal"]] }],
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
  else input = `<input id="${id}" name="${f.id}" type="${f.type || "text"}" value="${esc(f.value ?? "")}" ${req} ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} ${f.type === "number" ? 'step="any" inputmode="decimal"' : ""} ${f.list ? `list="${f.list}"` : ""} ${f.disabled ? "disabled" : ""}>`;
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
    o.fields.flat().forEach(f => { if (f.type === "checks") { v[f.id] = [...form.querySelectorAll(`input[name="${f.id}"]:checked`)].map(x => x.value).join(", "); return; } const el = form.elements[f.id]; if (!el || f.disabled) return; let val = f.type === "checkbox" ? el.checked : el.value; if (f.type === "number") val = num(val); else if (typeof val === "string") val = val.trim(); v[f.id] = val; });
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
    ? [...S.tshifts.filter(s => tDay(s) === t).map(s => ({ k: s.start_at, who: s.employee_name, start: tTime(s.start_at), end: tTime(s.end_at), note: s.job_title })),
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
  return `<div class="head"><h2>${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</h2>${MGR ? `<button class="primary" data-act="remNew" data-date="${t}">Add reminder</button>` : ""}</div>
  ${unread ? `<div class="banner">You have ${unread} unread private message${unread > 1 ? "s" : ""}. <a href="#messages" data-act="openPrivate" style="color:inherit">Open messages</a></div>` : ""}
  ${MGR && sd ? `<div class="kpis">${kpi("Net sales so far", money(sd.net_sales))}${kpi("Labor %", sd.net_sales > 0 ? pct(sd.labor_cost / sd.net_sales * 100) : "–", laborClass(sd))}${kpi("Orders", sd.order_count)}</div>` : ""}
  <div class="grid">
    <section class="card"><h3>Today's reminders</h3>
      ${od.length ? `<div class="small" style="color:var(--crit);font-weight:700;margin-bottom:4px">Overdue</div><div class="list" style="margin-bottom:10px">${od.map(r => remRow(r, r.date, true)).join("")}</div>` : ""}
      ${todays.length ? `<div class="list">${todays.map(r => remRow(r, t)).join("")}</div>` : `<div class="empty">Nothing due today.</div>`}
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
    const ds = ymd(d), rs = remsOn(ds);
    cells += `<button class="day ${d.getMonth() !== m.getMonth() ? "out" : ""} ${ds === t ? "today" : ""} ${ds === calSel ? "sel" : ""}" data-act="calPick" data-date="${ds}" aria-label="${esc(fmtDate(ds, { weekday: "long", month: "long", day: "numeric" }))}, ${rs.length} reminders">
      <span class="n">${d.getDate()}</span>
      ${rs.slice(0, 3).map(r => `<span class="pill ${r.priority === "critical" ? "crit" : ""}">${esc(r.title)}</span>`).join("")}
      ${rs.length > 3 ? `<span class="pill more">+${rs.length - 3} more</span>` : ""}
      <span class="dots">${rs.slice(0, 5).map(r => `<i class="${r.priority === "critical" ? "crit" : ""}"></i>`).join("")}</span></button>`;
  }
  const sel = remsOn(calSel);
  return `<div class="head"><h2>${m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
    <button data-act="calPrev" aria-label="Previous month">‹</button><button data-act="calToday">Today</button><button data-act="calNext" aria-label="Next month">›</button>
    ${MGR ? `<button class="primary" data-act="remNew" data-date="${calSel}">Add reminder</button>` : ""}</div>
  <div class="cal">
    <div class="card" style="padding:0;overflow:hidden"><div class="month">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div class="dow">${d}</div>`).join("")}${cells}</div></div>
    <section class="card"><h3>${esc(fmtDate(calSel, { weekday: "long", month: "long", day: "numeric" }))}</h3>
      ${sel.length ? `<div class="list">${sel.map(r => remRow(r, calSel)).join("")}</div>` : `<div class="empty">No reminders this day.</div>`}
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
function useToastSched() { return S.tshifts.length > 0; }
function tDay(s) { return ymd(new Date(s.start_at)); }
function tTime(iso) { if (!iso) return "?"; const d = new Date(iso); let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; }
function tHours(s) { return s.end_at ? Math.max(0, (new Date(s.end_at) - new Date(s.start_at)) / 36e5) : 0; }
function myToast() { const em = (me.email || "").toLowerCase(); return em ? S.tshifts.filter(s => (s.employee_email || "") === em) : []; }
function vToastSchedule() {
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i)), dss = days.map(ymd), t = today();
  // Toast shifts plus shifts managers added in the Hub, in one list
  const toastWk = S.tshifts.filter(s => dss.includes(tDay(s))).map(s => ({ name: s.employee_name || "Unassigned", day: tDay(s), sort: s.start_at, start: tTime(s.start_at), end: tTime(s.end_at), hrs: tHours(s), job: s.job_title, email: s.employee_email || "", hub: null }));
  const hubWk = S.shifts.filter(s => dss.includes(s.date)).map(s => { const p = person(s.staff_id) || {}; return { name: p.name || "Someone", day: s.date, sort: s.date + "T" + s.start_time, start: fmtTime(s.start_time), end: fmtTime(s.end_time), hrs: hours(s.start_time, s.end_time), job: s.note, email: p.email || "", hub: s }; });
  const wk = [...toastWk, ...hubWk];
  const names = [...new Set(wk.map(s => s.name))].sort();
  const myEm = (me.email || "").toLowerCase();
  let total = 0;
  const rows = names.map(n => {
    let tot = 0; const isMe = wk.some(s => s.name === n && myEm && s.email === myEm);
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

/* ---------------- render ---------------- */
function views() {
  return [["today", "Today"], ...(MGR ? [["sales", "Sales"]] : []), ["calendar", "Calendar"], ["messages", "Messages"], ["inventory", "Supplies"], ["orders", "Orders"], ["schedule", "Schedule"], ["team", "Team"]];
}
function renderTabs() {
  const t = today();
  const crit = overdue().length + remsOn(t).filter(r => r.priority === "critical" && !isDone(r, t)).length;
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
  const keep = ["msgText", "dmText", "invQ"].map(id => { const el = $(id); return el ? [id, el.value, el === document.activeElement, el.selectionStart] : null; }).filter(Boolean);
  const fn = { today: vToday, sales: vSales, calendar: vCalendar, messages: vMessages, inventory: vInventory, orders: vOrders, schedule: vSchedule, team: vTeam }[view] || vToday;
  const ae = document.activeElement, cntFocus = ae && ae.id && ae.id.startsWith("cnt_") ? ae.id : null;
  main.innerHTML = fn();
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
  await Promise.all(["reminders", "messages", "dms", "inventory", "vendors", "orders", "shifts", "tshifts", "sales", "synclog"].map(load));
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
