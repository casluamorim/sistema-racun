// Próximos eventos da agenda Google da agência (conexão configurada pelo admin do workspace).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json(401, { error: "Faça login novamente." });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).length || (roles ?? []).every((r: any) => r.role === "client")) return json(403, { error: "Sem permissão." });

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const calKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
    if (!lovableKey || !calKey) return json(200, { connected: false, events: [] });

    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 14 * 86400000).toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "15",
    });
    const res = await fetch(`${GATEWAY_URL}/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": calKey },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Calendar failed [${res.status}]: ${body}`);
      return json(200, { connected: true, error: `Google Agenda respondeu com erro (${res.status}).`, events: [] });
    }
    const data = await res.json();
    const events = (data.items ?? []).map((e: any) => ({
      id: e.id, title: e.summary ?? "(sem título)", location: e.location ?? null, link: e.htmlLink ?? null,
      allDay: !!e.start?.date, start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date,
    }));
    return json(200, { connected: true, events });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erro ao carregar a agenda." });
  }
});
