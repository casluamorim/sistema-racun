// Assistente financeiro: responde perguntas sobre o Financeiro PJ e PF (streaming)
// e salva a conversa no histórico da conta do usuário.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai@7";
import { z } from "npm:zod@4";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "../_shared/run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED = ["admin", "manager", "financeiro"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json(401, { error: "Faça login novamente." });

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: any) => ALLOWED.includes(r.role))) {
      return json(403, { error: "Apenas administradores e financeiro podem usar o assistente." });
    }

    const { messages, threadId, financeContext } = await req.json() as {
      messages: UIMessage[]; threadId: string; financeContext: unknown;
    };
    if (!threadId || !Array.isArray(messages) || !messages.length) return json(400, { error: "Requisição inválida." });

    const { data: thread } = await supabase.from("assistant_threads").select("id, title").eq("id", threadId).maybeSingle();
    if (!thread) return json(404, { error: "Conversa não encontrada." });

    // Salva a mensagem do usuário
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      const { error } = await supabase.from("assistant_messages").upsert({
        thread_id: threadId, user_id: user.id, message_id: last.id, role: "user", parts: last.parts,
      }, { onConflict: "thread_id,message_id" });
      if (error) return json(500, { error: "Não foi possível salvar a mensagem: " + error.message });
      const text = (last.parts ?? []).filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ").trim();
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (thread.title === "Nova análise" && text) update.title = text.slice(0, 60);
      await supabase.from("assistant_threads").update(update).eq("id", threadId);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "Assistente não configurado." });

    const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const instructions = `Você é o analista financeiro da produtora Racun. Hoje é ${new Date().toISOString().slice(0,10)}. Você também EXECUTA ações no sistema com as ferramentas: cadastrar cliente, lançar fatura/cobrança, despesas PJ/PF e receitas PF. Para faturas, busque o cliente primeiro; se houver dúvida (valor, data, cliente) pergunte antes de lançar. Após lançar, confirme o que foi feito. Também faça relatórios e previsões com base nos dados (meses futuros já incluem recorrências). Responda sempre em português do Brasil, de forma clara e objetiva, para uma pessoa não técnica.
Use SOMENTE os dados em JSON abaixo (Financeiro PJ e PF). Valores em reais (formate como R$ 1.234,56). Meses no formato AAAA-MM.
Traga análises úteis: comparações entre meses, tendências, maiores clientes, maiores despesas, margem líquida, alertas (contas atrasadas, meses no negativo) e sugestões práticas.
Diferencie sempre bruto x líquido e PJ x PF. Se um dado não existir, diga isso — nunca invente números. Use tabelas markdown quando ajudarem.
Regras de cálculo: ${(financeContext as any)?.regras ?? ""}

DADOS:
${JSON.stringify(financeContext ?? {})}`;

    const ok = (message: string, extra: Record<string, unknown> = {}) => ({ message, ...extra });
    const fail = (error: string) => ({ error });
    const tools = {
      buscar_cliente: tool({
        description: "Procura clientes pelo nome ou empresa. Use antes de lançar fatura para obter o client_id.",
        inputSchema: z.object({ termo: z.string() }),
        execute: async ({ termo }) => {
          const { data, error } = await supabase.from("clients").select("id, name, company").or(`name.ilike.%${termo}%,company.ilike.%${termo}%`).limit(10);
          if (error) return fail(error.message);
          return ok(`${data?.length ?? 0} cliente(s) encontrado(s)`, { clientes: data });
        },
      }),
      cadastrar_cliente: tool({
        description: "Cadastra um novo cliente.",
        inputSchema: z.object({ nome: z.string(), empresa: z.string().optional(), email: z.string().optional(), telefone: z.string().optional() }),
        execute: async (i) => {
          const { data, error } = await supabase.from("clients").insert({ name: i.nome, company: i.empresa ?? null, email: i.email ?? null, phone: i.telefone ?? null, status: "active", created_by: user.id }).select("id, name").single();
          if (error) return fail(error.message);
          return ok(`Cliente "${data.name}" cadastrado`, { id: data.id });
        },
      }),
      lancar_fatura: tool({
        description: "Lança uma fatura/cobrança a receber (Financeiro PJ) para um cliente. Status inicial: pendente.",
        inputSchema: z.object({ client_id: z.string(), titulo: z.string(), valor: z.number(), vencimento: z.string().describe("AAAA-MM-DD"), imposto_percent: z.number().optional() }),
        execute: async (i) => {
          const { data, error } = await supabase.from("invoices").insert({ client_id: i.client_id, title: i.titulo, amount: i.valor, due_date: i.vencimento, status: "pending", financial_type: "pj", tax_percent: i.imposto_percent ?? 0, created_by: user.id }).select("id").single();
          if (error) return fail(error.message);
          return ok(`Fatura "${i.titulo}" de R$ ${i.valor.toFixed(2)} lançada para ${i.vencimento}`, { id: data.id });
        },
      }),
      lancar_despesa: tool({
        description: "Lança uma despesa a pagar, na PJ ou na PF.",
        inputSchema: z.object({ descricao: z.string(), valor: z.number(), vencimento: z.string().describe("AAAA-MM-DD"), tipo: z.enum(["pj", "pf"]), categoria: z.string().optional(), pago: z.boolean().optional() }),
        execute: async (i) => {
          const { data, error } = await supabase.from("expenses").insert({ description: i.descricao, amount: i.valor, due_date: i.vencimento, financial_type: i.tipo, category: i.categoria ?? null, status: i.pago ? "paid" : "pending", recurrence: "one_time", created_by: user.id }).select("id").single();
          if (error) return fail(error.message);
          return ok(`Despesa ${i.tipo.toUpperCase()} "${i.descricao}" de R$ ${i.valor.toFixed(2)} lançada`, { id: data.id });
        },
      }),
      lancar_receita_pf: tool({
        description: "Lança uma receita pessoal (Financeiro PF).",
        inputSchema: z.object({ descricao: z.string(), valor: z.number(), vencimento: z.string().describe("AAAA-MM-DD"), imposto_percent: z.number().optional() }),
        execute: async (i) => {
          const { data, error } = await supabase.from("personal_income").insert({ description: i.descricao, amount: i.valor, due_date: i.vencimento, status: "pending", recurrence: "one_time", tax_percent: i.imposto_percent ?? 0, created_by: user.id }).select("id").single();
          if (error) return fail(error.message);
          return ok(`Receita PF "${i.descricao}" de R$ ${i.valor.toFixed(2)} lançada`, { id: data.id });
        },
      }),
    };

    const result = streamText({
      tools,
      stopWhen: stepCountIs(50),
      model: provider.responses("openai/gpt-6-astra"),
      system: instructions,
      messages: await convertToModelMessages(messages),
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
      sendReasoning: true,
      headers: corsHeaders,
      onError: (e: any) => {
        const status = e?.statusCode ?? e?.status;
        if (status === 402) return "Os créditos de IA acabaram. Adicione créditos no workspace para continuar.";
        if (status === 429) return "Muitas perguntas seguidas. Aguarde alguns segundos e tente de novo.";
        if (status === 403) return "O acesso ao modelo foi bloqueado para este workspace.";
        return "Não foi possível gerar a resposta agora.";
      },
      onFinish: async ({ responseMessage }) => {
        const { error } = await supabase.from("assistant_messages").upsert({
          thread_id: threadId, user_id: user.id, message_id: responseMessage.id,
          role: "assistant", parts: responseMessage.parts,
        }, { onConflict: "thread_id,message_id" });
        if (error) console.error("save assistant message failed", error);
        await supabase.from("assistant_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      },
    });
    return await withLovableAiGatewayRunIdHeader(response, runIdFetch, corsHeaders);
  } catch (e) {
    console.error(e);
    return json(500, { error: e instanceof Error ? e.message : "Erro inesperado" });
  }
});
