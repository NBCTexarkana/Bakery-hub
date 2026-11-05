// invite-user: lets the owner or a manager invite a team member from the app.
// Sends Supabase's invite email; the new person sets a password when they open it.
// Body: { "email": "...", "name": "...", "role": "staff" | "manager", "position": "...", "redirectTo": "https://your-app" }

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(jwt);
  if (!who?.user) return json({ ok: false, error: "Please sign in again." }, 401);
  const { data: me } = await admin.from("profiles").select("role, active").eq("id", who.user.id).single();
  if (!me || !me.active || !["owner", "manager"].includes(me.role)) {
    return json({ ok: false, error: "Only managers can invite people." }, 403);
  }

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim().slice(0, 80);
  // Only the owner can invite another manager; managers invite staff.
  const role = b.role === "manager" && me.role === "owner" ? "manager" : "staff";
  const position = String(b.position ?? "").trim().slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
  if (!name) return json({ ok: false, error: "Enter the person's name." }, 400);

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: typeof b.redirectTo === "string" ? b.redirectTo : undefined,
  });
  if (error) return json({ ok: false, error: error.message }, 400);

  // The database trigger created their profile; set the role and position chosen here.
  if (data?.user) {
    await admin.from("profiles").update({ name, role, position }).eq("id", data.user.id);
  }
  return json({ ok: true });
});
