/**
 * Monta um resumo compacto dos dados do Financeiro PJ e PF (mesmas regras de cálculo
 * das telas: recorrências, sem filhos de cartão, sem faturas canceladas, líquido =
 * bruto − imposto − custos da fatura − despesas vinculadas) para o assistente financeiro.
 */
import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { expandOccurrencesInRange, monthKey, withoutCardChildren } from '@/lib/financialMonthly';
import { sumCostsByInvoice } from '@/lib/invoiceCosts';
import { taxAmount } from '@/lib/netRevenue';

const r2 = (n: number) => Math.round(n * 100) / 100;

type MonthAgg = {
  pj_bruto: number; pj_imposto: number; pj_custos_fatura: number; pj_recebido: number;
  pj_despesas: number; pj_despesas_pagas: number;
  pf_receitas: number; pf_imposto: number; pf_recebido: number;
  pf_despesas: number; pf_despesas_pagas: number;
};
const emptyAgg = (): MonthAgg => ({
  pj_bruto: 0, pj_imposto: 0, pj_custos_fatura: 0, pj_recebido: 0, pj_despesas: 0, pj_despesas_pagas: 0,
  pf_receitas: 0, pf_imposto: 0, pf_recebido: 0, pf_despesas: 0, pf_despesas_pagas: 0,
});

export async function buildFinanceContext(monthsBack = 12, monthsAhead = 6) {
  const now = new Date();
  const start = startOfMonth(addMonths(now, -monthsBack));
  const end = endOfMonth(addMonths(now, monthsAhead));

  const [inv, exp, inc, costs, cli] = await Promise.all([
    supabase.from('invoices').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('personal_income').select('*'),
    supabase.from('invoice_costs').select('invoice_id, description, kind, mode, value'),
    supabase.from('clients').select('id, name, company'),
  ]);
  const err = inv.error || exp.error || inc.error || costs.error || cli.error;
  if (err) throw new Error(err.message);

  const clientName = new Map<string, string>(
    ((cli.data as any[]) ?? []).map((c) => [c.id, c.company || c.name]),
  );
  const invoices = ((inv.data as any[]) ?? []).filter((i) => i.status !== 'cancelled');
  const expensesAll = withoutCardChildren((exp.data as any[]) ?? []);
  const incomes = (inc.data as any[]) ?? [];
  const costByInvoice = sumCostsByInvoice(
    (costs.data as any[]) ?? [],
    new Map(invoices.map((i) => [i.id, Number(i.amount) || 0])),
  );

  const months = new Map<string, MonthAgg>();
  const agg = (k: string) => { if (!months.has(k)) months.set(k, emptyAgg()); return months.get(k)!; };
  const byClient = new Map<string, Map<string, number>>();
  const byCategory = new Map<string, Map<string, number>>();
  const items: any[] = [];
  const detailFrom = monthKey(addMonths(now, -3));
  const detailTo = monthKey(addMonths(now, 2));
  const inDetail = (k: string) => k >= detailFrom && k <= detailTo;

  for (const o of expandOccurrencesInRange(invoices, start, end)) {
    const i = o.item; const a = agg(o.competence);
    const amt = Number(i.amount) || 0;
    const tax = taxAmount(amt, i.tax_percent);
    const cst = o.virtual ? 0 : costByInvoice.get(i.id) ?? 0;
    a.pj_bruto += amt; a.pj_imposto += tax; a.pj_custos_fatura += cst;
    if (o.status === 'paid') a.pj_recebido += amt;
    const cn = clientName.get(i.client_id) ?? 'Sem cliente';
    const m = byClient.get(o.competence) ?? new Map(); m.set(cn, (m.get(cn) ?? 0) + amt); byClient.set(o.competence, m);
    if (inDetail(o.competence)) items.push({ tipo: 'fatura_pj', mes: o.competence, venc: o.occurrence_date, titulo: i.title, cliente: cn, bruto: amt, imposto_pct: Number(i.tax_percent) || 0, custos: r2(cst), status: o.status, recorrente: o.virtual || i.recurrence === 'recurring', parcela: i.installment_number ? `${i.installment_number}/${i.installment_total}` : undefined });
  }

  for (const o of expandOccurrencesInRange(expensesAll, start, end)) {
    const e = o.item; const a = agg(o.competence);
    const amt = Number(e.amount) || 0;
    const pf = e.financial_type === 'pf';
    if (pf) { a.pf_despesas += amt; if (o.status === 'paid') a.pf_despesas_pagas += amt; }
    else { a.pj_despesas += amt; if (o.status === 'paid') a.pj_despesas_pagas += amt; }
    const ck = `${pf ? 'PF' : 'PJ'} · ${e.category || 'Sem categoria'}`;
    const m = byCategory.get(o.competence) ?? new Map(); m.set(ck, (m.get(ck) ?? 0) + amt); byCategory.set(o.competence, m);
    if (inDetail(o.competence)) items.push({ tipo: pf ? 'despesa_pf' : 'despesa_pj', mes: o.competence, venc: o.occurrence_date, descricao: e.description, categoria: e.category, valor: amt, status: o.status, vinculada_a_receita: !!(e.linked_invoice_id || e.linked_income_id) });
  }

  for (const o of expandOccurrencesInRange(incomes, start, end)) {
    const i = o.item; const a = agg(o.competence);
    const amt = Number(i.amount) || 0;
    a.pf_receitas += amt; a.pf_imposto += taxAmount(amt, i.tax_percent);
    if (o.status === 'paid') a.pf_recebido += amt;
    if (inDetail(o.competence)) items.push({ tipo: 'receita_pf', mes: o.competence, venc: o.occurrence_date, descricao: i.description, valor: amt, imposto_pct: Number(i.tax_percent) || 0, status: o.status });
  }

  const resumo_mensal = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mes, a]) => {
    const pj_liquido = a.pj_bruto - a.pj_imposto - a.pj_custos_fatura;
    const pf_liquido = a.pf_receitas - a.pf_imposto;
    const top = (m?: Map<string, number>) => Array.from(m?.entries() ?? []).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([n, v]) => ({ nome: n, valor: r2(v) }));
    return {
      mes,
      pj: { faturamento_bruto: r2(a.pj_bruto), impostos: r2(a.pj_imposto), custos_das_faturas: r2(a.pj_custos_fatura), receita_liquida: r2(pj_liquido), recebido: r2(a.pj_recebido), despesas: r2(a.pj_despesas), despesas_pagas: r2(a.pj_despesas_pagas), lucro_liquido: r2(pj_liquido - a.pj_despesas) },
      pf: { receitas: r2(a.pf_receitas), impostos: r2(a.pf_imposto), receita_liquida: r2(pf_liquido), recebido: r2(a.pf_recebido), despesas: r2(a.pf_despesas), despesas_pagas: r2(a.pf_despesas_pagas), saldo_liquido: r2(pf_liquido - a.pf_despesas) },
      top_clientes_pj: top(byClient.get(mes)),
      top_categorias_despesa: top(byCategory.get(mes)),
    };
  });

  return {
    hoje: now.toISOString().slice(0, 10),
    periodo: { de: monthKey(start), ate: monthKey(end) },
    regras: 'Recorrências projetadas mês a mês; faturas canceladas excluídas; compras do cartão contam só pela fatura do cartão; receita líquida PJ = bruto − imposto − custos lançados na fatura; despesas vinculadas a uma receita já estão em "despesas" (não descontar de novo).',
    resumo_mensal,
    lancamentos_detalhados: items.slice(0, 400),
  };
}
