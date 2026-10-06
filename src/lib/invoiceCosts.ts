/**
 * Custos lançados dentro da própria fatura (freelancers, % da agência parceira, outros).
 * Assim não é preciso criar uma despesa separada para cada custo do trabalho.
 */
import { supabase } from '@/integrations/supabase/client';

export type CostKind = 'freelancer' | 'agency' | 'other';
export type CostMode = 'fixed' | 'percent';

export interface InvoiceCost {
  id?: string;
  invoice_id?: string;
  description: string;
  kind: CostKind;
  mode: CostMode;
  value: number;
}

export const costKindLabels: Record<CostKind, string> = {
  freelancer: 'Freelancer',
  agency: 'Comissão de agência',
  other: 'Outro custo',
};

/** Valor em reais de um custo, considerando o valor bruto da fatura. */
export function costAmount(cost: Pick<InvoiceCost, 'mode' | 'value'>, gross: number | string) {
  const g = Number(gross) || 0;
  const v = Number(cost.value) || 0;
  return cost.mode === 'percent' ? (g * v) / 100 : v;
}

export function totalCosts(costs: Pick<InvoiceCost, 'mode' | 'value'>[], gross: number | string) {
  return costs.reduce((a, c) => a + costAmount(c, gross), 0);
}

/** Agrupa custos por fatura, já convertidos em reais. */
export function sumCostsByInvoice(
  costs: (InvoiceCost & { invoice_id: string })[],
  invoiceAmounts: Map<string, number>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of costs) {
    const gross = invoiceAmounts.get(c.invoice_id) ?? 0;
    map.set(c.invoice_id, (map.get(c.invoice_id) ?? 0) + costAmount(c, gross));
  }
  return map;
}

/**
 * Salva os custos de uma fatura (mantendo os já existentes pelo id) e mantém
 * uma despesa PJ espelhada para cada custo, para controlar o pagamento na aba Despesas.
 */
export async function saveInvoiceCosts(invoiceId: string, costs: InvoiceCost[], userId?: string) {
  const clean = costs.filter(c => c.description.trim() && Number(c.value) > 0);
  const { data: existing } = await supabase.from('invoice_costs').select('id').eq('invoice_id', invoiceId);
  const keepIds = new Set(clean.filter(c => c.id).map(c => c.id!));
  const toDelete = ((existing as any[]) ?? []).map(e => e.id).filter(id => !keepIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from('invoice_costs').delete().in('id', toDelete);
    if (error) return { error };
  }

  const { data: inv } = await supabase.from('invoices')
    .select('title, amount, due_date, client_id, project_id, recurrence, recurrence_day, recurrence_end, is_recurring_active').eq('id', invoiceId).single();
  const gross = Number((inv as any)?.amount) || 0;

  for (const c of clean) {
    const row = {
      invoice_id: invoiceId, description: c.description.trim(), kind: c.kind, mode: c.mode,
      value: Number(c.value) || 0,
    };
    let costId = c.id;
    if (costId) {
      const { error } = await supabase.from('invoice_costs').update(row as any).eq('id', costId);
      if (error) return { error };
    } else {
      const { data, error } = await supabase.from('invoice_costs')
        .insert({ ...row, created_by: userId ?? null } as any).select('id').single();
      if (error) return { error };
      costId = (data as any).id;
    }

    // Despesa espelhada (preserva status/data já definidos pelo usuário)
    const amount = Math.round(costAmount(c, gross) * 100) / 100;
    const description = `${c.description.trim()} — ${(inv as any)?.title ?? 'fatura'}`;
    const rec = {
      recurrence: (inv as any)?.recurrence ?? 'one_time',
      recurrence_day: (inv as any)?.recurrence_day ?? null,
      recurrence_end: (inv as any)?.recurrence_end ?? null,
      is_recurring_active: (inv as any)?.is_recurring_active ?? true,
    };
    const { data: exp } = await supabase.from('expenses').select('id').eq('invoice_cost_id', costId!).maybeSingle();
    if (exp) {
      const { error } = await supabase.from('expenses').update({ description, amount, category: costKindLabels[c.kind], ...rec } as any).eq('id', (exp as any).id);
      if (error) return { error };
    } else {
      const { error } = await supabase.from('expenses').insert({
        description, amount, category: costKindLabels[c.kind], financial_type: 'pj',
        due_date: (inv as any)?.due_date ?? new Date().toISOString().slice(0, 10),
        status: 'pending', ...rec,
        client_id: (inv as any)?.client_id ?? null, project_id: (inv as any)?.project_id ?? null,
        linked_invoice_id: invoiceId, invoice_cost_id: costId, created_by: userId ?? null,
      } as any);
      if (error) return { error };
    }
  }
  return { error: null };
}

export async function loadInvoiceCosts(invoiceId: string): Promise<InvoiceCost[]> {
  const { data } = await supabase
    .from('invoice_costs')
    .select('id, invoice_id, description, kind, mode, value')
    .eq('invoice_id', invoiceId)
    .order('created_at');
  return ((data as any[]) ?? []) as InvoiceCost[];
}
