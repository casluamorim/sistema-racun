// Lê a foto de um recibo/nota fiscal e devolve os dados para um lançamento de despesa.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { NoObjectGeneratedError, Output, streamText } from "npm:ai@7";
import { z } from "npm:zod@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const schema = z.object({
  descricao: z.string(),
  fornecedor: z.string().nullable(),
  valor: z.number().nullable(),
  data: z.string().nullable(),
  categoria: z.string().nullable(),
  cnpj_emitente: z.string().nullable(),
  observacoes: z.string().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json(401, { error: "Faça login novamente." });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: any) => ["admin", "manager", "financeiro"].includes(r.role))) return json(403, { error: "Sem permissão." });

    const { image, mediaType } = await req.json() as { image?: string; mediaType?: string };
    if (!image || !mediaType || !/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(mediaType)) return json(400, { error: "Envie uma foto (JPG, PNG, WEBP) ou PDF." });
    if (image.length > 14_000_000) return json(400, { error: "Arquivo muito grande (máx. ~10MB)." });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "IA não configurada." });
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      output: Output.object({ schema }),
      abortSignal: req.signal,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `Extraia os dados deste recibo/nota fiscal brasileiro para lançar uma despesa. Responda em português.
- descricao: curta (ex.: "Combustível - Posto Shell")
- valor: valor TOTAL pago em reais (número, ponto decimal)
- data: data de emissão no formato AAAA-MM-DD
- categoria: uma de Alimentação, Transporte, Combustível, Equipamento, Software, Freelancer, Impostos, Escritório, Marketing, Outros
Use null quando não conseguir ler. Nunca invente.` },
          { type: "file", data: image, mediaType },
        ],
      }],
    });
    try {
      const output = await result.output;
      return json(200, { data: output });
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) && e.text) {
        try { return json(200, { data: schema.partial().parse(JSON.parse(e.text)) }); } catch { /* segue */ }
      }
      throw e;
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return new Response(null, { status: 499, headers: corsHeaders });
    const status = e?.statusCode ?? e?.status;
    console.error("scan-receipt", status, e?.responseBody ?? e);
    if (status === 402) return json(402, { error: "Os créditos de IA acabaram." });
    if (status === 429) return json(429, { error: "Muitas leituras seguidas. Aguarde e tente de novo." });
    if (status === 403) return json(403, { error: "Acesso ao modelo bloqueado para este workspace." });
    return json(500, { error: "Não foi possível ler o recibo." });
  }
});
