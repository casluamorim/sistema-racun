import { netRevenue } from '@/lib/netRevenue';
import { sumCostsByInvoice } from '@/lib/invoiceCosts';
import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Calendar, Plus, Sparkles
} from 'lucide-react';
import { format, addDays, startOfDay, endOfDay, parseISO, isBefore, isAfter, addMonths, isSameDay, differenceInDays, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { expandOccurrencesInRange , withoutCardChildren, withoutCancelled } from '@/lib/financialMonthly';
import { useCachedState, hasPageCache } from '@/hooks/useCachedState';

type FinType = 'all' | 'pj' | 'pf';
type RangeKey = 'today' | '7d' | '30d' | '90d' | '12m' | 'custom';
type GroupBy = 'day' | 'week' | 'month' | 'year';

interface Movement {
  date: string; // ISO date yyyy-mm-dd
  type: 'in' | 'out';
  amount: number;
  label: string;
  category: string;
  status: string;
  financial_type: 'pj' | 'pf';
  source: 'invoice' | 'expense' | 'personal_income' | 'simulated';
  realized: boolean; // true = pago/recebido, false = previsto
}

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', '12m': '12 meses', custom: 'Personalizado'
};

export default function CashFlow() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(!hasPageCache('cashflow:invoices'));
  const [finType, setFinType] = useState<FinType>('all');
  const [range, setRange] = useState<RangeKey>('30d');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [customStart, setCustomStart] = useState(format(addDays(new Date(), -30), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));

  const [invoices, setInvoices] = useCachedState<any[]>('cashflow:invoices', []);
  const [expenses, setExpenses] = useCachedState<any[]>('cashflow:expenses', []);
  const [personalIncome, setPersonalIncome] = useCachedState<any[]>('cashflow:pi', []);
  const [simulations, setSimulations] = useState<Movement[]>([]);

  // Simulation dialog
  const [simOpen, setSimOpen] = useState(false);
  const [simForm, setSimForm] = useState({
    label: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'),
    type: 'in' as 'in' | 'out', financial_type: 'pj' as 'pj' | 'pf'
  });

  const [costsByInvoice, setCostsByInvoice] = useCachedState<Map<string, number>>('cashflow:costs', new Map());
  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(!hasPageCache('cashflow:invoices'));
    try {
      const [inv, exp, pi] = await Promise.all([
        supabase.from('invoices').select('*, clients(name, company)').order('due_date'),
        supabase.from('expenses').select('*, clients(name, company), projects(name)').order('due_date'),
        supabase.from('personal_income').select('*').order('due_date'),
      ]);
      const { data: costRows } = await supabase.from('invoice_costs').select('invoice_id, mode, value');
      const amounts = new Map<string, number>((inv.data || []).map((i: any) => [i.id, Number(i.amount) || 0]));
      setCostsByInvoice(sumCostsByInvoice((costRows || []) as any[], amounts));
      if (inv.error) throw inv.error;
      if (exp.error) throw exp.error;
      if (pi.error) throw pi.error;
      setInvoices(withoutCancelled((inv.data || []) as any[]));
      setExpenses(withoutCardChildren((exp.data || []) as any[]));
      setPersonalIncome(pi.data || []);
    } catch (e: any) {
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  // Compute date range
  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    if (range === 'today') return { rangeStart: startOfDay(now), rangeEnd: endOfDay(now) };
    if (range === '7d') return { rangeStart: addDays(now, -3), rangeEnd: addDays(now, 7) };
    if (range === '30d') return { rangeStart: addDays(now, -15), rangeEnd: addDays(now, 30) };
    if (range === '90d') return { rangeStart: addDays(now, -30), rangeEnd: addDays(now, 90) };
    if (range === '12m') return { rangeStart: addDays(now, -90), rangeEnd: addDays(now, 365) };
    return { rangeStart: parseISO(customStart), rangeEnd: parseISO(customEnd) };
  }, [range, customStart, customEnd]);

  // Use shared monthly engine to expand recurrences and skip already-materialized children
  function buildMovements<T extends { id: string; due_date: string; amount: number; status: string; recurrence: string; recurrence_day: number | null; recurrence_end: string | null; is_recurring_active: boolean; parent_invoice_id?: string | null; parent_expense_id?: string | null; parent_income_id?: string | null }>(
    items: T[],
    builder: (it: T, dateISO: string, isProjection: boolean, status: string) => Movement
  ): Movement[] {
    const occs = expandOccurrencesInRange(items as any, rangeStart, rangeEnd);
    return occs.map(o => builder(o.item as T, o.occurrence_date, o.virtual, o.status));
  }

  const movements = useMemo<Movement[]>(() => {
    const list: Movement[] = [];

    // Invoices (entradas)
    list.push(...buildMovements(invoices as any, (it: any, dateISO, isProj, status) => ({
      date: dateISO,
      type: 'in',
      amount: Number(it.amount) || 0,
      label: it.title + (it.clients?.company ? ` — ${it.clients.company}` : it.clients?.name ? ` — ${it.clients.name}` : ''),
      category: 'Fatura',
      status,
      financial_type: it.financial_type,
      source: 'invoice',
      realized: !isProj && status === 'paid',
    })));

    // Expenses (saídas)
    list.push(...buildMovements(expenses as any, (it: any, dateISO, isProj, status) => ({
      date: dateISO,
      type: 'out',
      amount: Number(it.amount) || 0,
      label: it.description + (it.category ? ` (${it.category})` : ''),
      category: it.category || 'Despesa',
      status,
      financial_type: it.financial_type,
      source: 'expense',
      realized: !isProj && status === 'paid',
    })));

    // Personal income
    list.push(...buildMovements(personalIncome as any, (it: any, dateISO, isProj, status) => ({
      date: dateISO,
      type: 'in',
      amount: netRevenue(it.amount, it.tax_percent, 0),
      label: it.description + (it.category ? ` (${it.category})` : ''),
      category: it.category || 'Receita PF',
      status,
      financial_type: 'pf',
      source: 'personal_income',
      realized: !isProj && status === 'paid',
    })));

    // Simulations
    list.push(...simulations);

    // Filter by financial type
    return list.filter(m =>
      finType === 'all' || m.financial_type === finType
    );
  }, [invoices, expenses, personalIncome, costsByInvoice, simulations, finType, rangeStart, rangeEnd]);

  // Build chart series day-by-day across window
  const chartData = useMemo(() => {
    const days = differenceInDays(rangeEnd, rangeStart);
    if (days < 0) return [];
    const today = startOfDay(new Date());
    // Compute opening balance: sum of realized movements before rangeStart
    let openingBalance = 0;
    movements.forEach(m => {
      const d = parseISO(m.date);
      if (isBefore(d, rangeStart) && m.realized) {
        openingBalance += m.type === 'in' ? m.amount : -m.amount;
      }
    });

    let balance = openingBalance;
    let projected = openingBalance;
    const data: any[] = [];
    for (let i = 0; i <= days; i++) {
      const day = addDays(rangeStart, i);
      const key = format(day, 'yyyy-MM-dd');
      let inSum = 0, outSum = 0, inProj = 0, outProj = 0;
      movements.forEach(m => {
        if (m.date !== key) return;
        if (m.type === 'in') {
          if (m.realized) inSum += m.amount; else inProj += m.amount;
        } else {
          if (m.realized) outSum += m.amount; else outProj += m.amount;
        }
      });
      balance += inSum - outSum;
      projected += (inSum + inProj) - (outSum + outProj);
      const isFuture = isAfter(day, today) || isSameDay(day, today);
      data.push({
        date: key,
        label: format(day, 'dd/MM', { locale: ptBR }),
        entradas: inSum + inProj,
        saidas: -(outSum + outProj),
        saldo: isFuture ? null : balance,
        saldoProjetado: projected,
      });
    }
    return data;
  }, [movements, rangeStart, rangeEnd]);

  // Aggregate the daily chartData into the chosen grouping (week/month/year)
  const groupedChartData = useMemo(() => {
    if (groupBy === 'day') return chartData;
    const buckets = new Map<string, { date: string; label: string; entradas: number; saidas: number; saldo: number | null; saldoProjetado: number; lastDate: Date }>();
    for (const d of chartData) {
      const day = parseISO(d.date);
      let bucketStart: Date;
      let label: string;
      if (groupBy === 'week') {
        bucketStart = startOfWeek(day, { weekStartsOn: 1 });
        label = `Sem ${format(bucketStart, 'dd/MM', { locale: ptBR })}`;
      } else if (groupBy === 'month') {
        bucketStart = startOfMonth(day);
        label = format(bucketStart, "MMM/yy", { locale: ptBR });
      } else {
        bucketStart = startOfYear(day);
        label = format(bucketStart, 'yyyy');
      }
      const key = format(bucketStart, 'yyyy-MM-dd');
      const b = buckets.get(key) ?? {
        date: key, label, entradas: 0, saidas: 0,
        saldo: null as number | null, saldoProjetado: 0, lastDate: day,
      };
      b.entradas += d.entradas || 0;
      b.saidas += d.saidas || 0;
      // saldo and saldoProjetado are running totals — keep the latest sample within the bucket
      if (!isBefore(day, b.lastDate)) {
        b.saldo = d.saldo;
        b.saldoProjetado = d.saldoProjetado;
        b.lastDate = day;
      }
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [chartData, groupBy]);


  // Cards
  const totals = useMemo(() => {
    let entradas = 0, saidas = 0, entradasProj = 0, saidasProj = 0;
    movements.forEach(m => {
      const d = parseISO(m.date);
      if (isBefore(d, rangeStart) || isAfter(d, rangeEnd)) return;
      if (m.realized) {
        if (m.type === 'in') entradas += m.amount; else saidas += m.amount;
      } else {
        if (m.type === 'in') entradasProj += m.amount; else saidasProj += m.amount;
      }
    });
    const last = chartData[chartData.length - 1];
    return {
      entradas, saidas,
      saldoAtual: entradas - saidas,
      saldoProjetado: last?.saldoProjetado ?? 0,
      entradasProj, saidasProj,
    };
  }, [movements, rangeStart, rangeEnd, chartData]);

  // Alerts
  const alerts = useMemo(() => {
    const items: { level: 'warn' | 'critical'; text: string }[] = [];
    // Negative future balance
    const negative = chartData.find(d => (d.saldoProjetado ?? 0) < 0);
    if (negative) {
      items.push({
        level: 'critical',
        text: `Saldo projetado fica negativo em ${negative.label} (${formatBRL(negative.saldoProjetado)})`,
      });
    }
    // Compare current month vs previous month for expenses
    const now = new Date();
    const thisMonth = format(now, 'yyyy-MM');
    const prevMonth = format(addMonths(now, -1), 'yyyy-MM');
    let curOut = 0, prevOut = 0, curIn = 0, prevIn = 0;
    movements.forEach(m => {
      const ym = m.date.slice(0, 7);
      if (!m.realized) return;
      if (ym === thisMonth) {
        if (m.type === 'out') curOut += m.amount; else curIn += m.amount;
      } else if (ym === prevMonth) {
        if (m.type === 'out') prevOut += m.amount; else prevIn += m.amount;
      }
    });
    if (prevOut > 0 && curOut > prevOut * 1.2) {
      items.push({ level: 'warn', text: `Despesas subiram ${(((curOut - prevOut) / prevOut) * 100).toFixed(0)}% vs mês anterior` });
    }
    if (prevIn > 0 && curIn < prevIn * 0.8) {
      items.push({ level: 'warn', text: `Receita caiu ${(((prevIn - curIn) / prevIn) * 100).toFixed(0)}% vs mês anterior` });
    }
    return items;
  }, [chartData, movements]);

  function addSimulation() {
    if (!simForm.label || !simForm.amount) {
      toast({ title: 'Preencha rótulo e valor', variant: 'destructive' });
      return;
    }
    setSimulations(s => [...s, {
      date: simForm.date,
      type: simForm.type,
      amount: Number(simForm.amount),
      label: simForm.label,
      category: 'Simulação',
      status: 'pending',
      financial_type: simForm.financial_type,
      source: 'simulated',
      realized: false,
    }]);
    setSimOpen(false);
    setSimForm({ ...simForm, label: '', amount: '' });
    toast({ title: 'Simulação adicionada' });
  }

  // Filtered list for the table
  const tableMovements = useMemo(() =>
    [...movements]
      .filter(m => {
        const d = parseISO(m.date);
        return !isBefore(d, rangeStart) && !isAfter(d, rangeEnd);
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  , [movements, rangeStart, rangeEnd]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Fluxo de Caixa</h1>
            <p className="text-muted-foreground">Visão consolidada de entradas, saídas e saldo projetado</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={finType} onValueChange={(v) => setFinType(v as FinType)}>
              <TabsList>
                <TabsTrigger value="all">Ambos</TabsTrigger>
                <TabsTrigger value="pj">PJ</TabsTrigger>
                <TabsTrigger value="pf">PF</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <TabsList>
                <TabsTrigger value="day">Dia</TabsTrigger>
                <TabsTrigger value="week">Semana</TabsTrigger>
                <TabsTrigger value="month">Mês</TabsTrigger>
                <TabsTrigger value="year">Ano</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map(k => (
                  <SelectItem key={k} value={k}>{RANGE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {range === 'custom' && (
              <>
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-[150px]" />
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-[150px]" />
              </>
            )}
            <Dialog open={simOpen} onOpenChange={setSimOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Sparkles className="mr-2 h-4 w-4" />Simular</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Adicionar simulação</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Rótulo</Label>
                    <Input value={simForm.label} onChange={e => setSimForm({ ...simForm, label: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Valor</Label>
                      <Input type="number" step="0.01" value={simForm.amount} onChange={e => setSimForm({ ...simForm, amount: e.target.value })} />
                    </div>
                    <div>
                      <Label>Data</Label>
                      <Input type="date" value={simForm.date} onChange={e => setSimForm({ ...simForm, date: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo</Label>
                      <Select value={simForm.type} onValueChange={(v) => setSimForm({ ...simForm, type: v as 'in' | 'out' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">Entrada</SelectItem>
                          <SelectItem value="out">Saída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Origem</Label>
                      <Select value={simForm.financial_type} onValueChange={(v) => setSimForm({ ...simForm, financial_type: v as 'pj' | 'pf' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pj">PJ</SelectItem>
                          <SelectItem value="pf">PF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={addSimulation} className="w-full"><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Entradas</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">{formatBRL(totals.entradas)}</div>
              <p className="text-xs text-muted-foreground mt-1">+ {formatBRL(totals.entradasProj)} previsto</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saídas</CardTitle>
              <ArrowDownRight className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{formatBRL(totals.saidas)}</div>
              <p className="text-xs text-muted-foreground mt-1">+ {formatBRL(totals.saidasProj)} previsto</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo atual</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totals.saldoAtual >= 0 ? 'text-foreground' : 'text-red-500'}`}>
                {formatBRL(totals.saldoAtual)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Realizado no período</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo projetado</CardTitle>
              {totals.saldoProjetado >= 0
                ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                : <TrendingDown className="h-4 w-4 text-red-500" />}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totals.saldoProjetado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatBRL(totals.saldoProjetado)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Final do período</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas inteligentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant={a.level === 'critical' ? 'destructive' : 'secondary'}>
                    {a.level === 'critical' ? 'Crítico' : 'Atenção'}
                  </Badge>
                  <span>{a.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Evolução do período
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[360px] flex items-center justify-center text-muted-foreground">Carregando...</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={groupedChartData}>
                  <defs>
                    <linearGradient id="entradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 76% 45%)" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="hsl(142 76% 45%)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="saidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0 80% 60%)" stopOpacity={0.05} />
                      <stop offset="95%" stopColor="hsl(0 80% 60%)" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(value: any, name: any) => [formatBRL(Number(value) || 0), name]}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                  <Area type="monotone" dataKey="entradas" name="Entradas" fill="url(#entradas)" stroke="hsl(142 76% 45%)" strokeWidth={2} />
                  <Area type="monotone" dataKey="saidas" name="Saídas" fill="url(#saidas)" stroke="hsl(0 80% 60%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="saldo" name="Saldo realizado" stroke="hsl(217 91% 60%)" strokeWidth={2.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="saldoProjetado" name="Saldo projetado" stroke="hsl(217 91% 60%)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Detailed list */}
        <Card>
          <CardHeader>
            <CardTitle>Movimentações detalhadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableMovements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação no período selecionado.
                      </TableCell>
                    </TableRow>
                  )}
                  {(() => {
                    if (groupBy === 'day') {
                      return tableMovements.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap">{format(parseISO(m.date), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                          <TableCell className="max-w-[280px] truncate">{m.label}</TableCell>
                          <TableCell><Badge variant="outline">{m.category}</Badge></TableCell>
                          <TableCell><Badge variant="secondary">{m.financial_type.toUpperCase()}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={m.realized ? 'default' : 'outline'}>
                              {m.realized ? 'Realizado' : 'Previsto'}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${m.type === 'in' ? 'text-emerald-500' : 'text-red-500'}`}>
                            {m.type === 'in' ? '+' : '-'}{formatBRL(m.amount)}
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    // Group movements by week/month/year
                    const groups = new Map<string, { label: string; items: typeof tableMovements }>();
                    for (const m of tableMovements) {
                      const day = parseISO(m.date);
                      let bucket: Date;
                      let label: string;
                      if (groupBy === 'week') {
                        bucket = startOfWeek(day, { weekStartsOn: 1 });
                        label = `Semana de ${format(bucket, "dd 'de' MMM yyyy", { locale: ptBR })}`;
                      } else if (groupBy === 'month') {
                        bucket = startOfMonth(day);
                        const s = format(bucket, "MMMM 'de' yyyy", { locale: ptBR });
                        label = s.charAt(0).toUpperCase() + s.slice(1);
                      } else {
                        bucket = startOfYear(day);
                        label = format(bucket, 'yyyy');
                      }
                      const key = format(bucket, 'yyyy-MM-dd');
                      const g = groups.get(key) ?? { label, items: [] };
                      g.items.push(m);
                      groups.set(key, g);
                    }
                    const sorted = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                    const rows: JSX.Element[] = [];
                    for (const [key, g] of sorted) {
                      const totalIn = g.items.filter(x => x.type === 'in').reduce((a, x) => a + x.amount, 0);
                      const totalOut = g.items.filter(x => x.type === 'out').reduce((a, x) => a + x.amount, 0);
                      rows.push(
                        <TableRow key={`h-${key}`} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={4} className="font-semibold text-foreground">
                            {g.label}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              ({g.items.length} mov.)
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">Subtotal</TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className="text-emerald-500">+{formatBRL(totalIn)}</span>
                            <span className="mx-1 text-muted-foreground">/</span>
                            <span className="text-red-500">-{formatBRL(totalOut)}</span>
                          </TableCell>
                        </TableRow>
                      );
                      for (const m of g.items) {
                        rows.push(
                          <TableRow key={`${key}-${m.date}-${m.label}-${rows.length}`}>
                            <TableCell className="whitespace-nowrap pl-6">{format(parseISO(m.date), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                            <TableCell className="max-w-[280px] truncate">{m.label}</TableCell>
                            <TableCell><Badge variant="outline">{m.category}</Badge></TableCell>
                            <TableCell><Badge variant="secondary">{m.financial_type.toUpperCase()}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={m.realized ? 'default' : 'outline'}>
                                {m.realized ? 'Realizado' : 'Previsto'}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${m.type === 'in' ? 'text-emerald-500' : 'text-red-500'}`}>
                              {m.type === 'in' ? '+' : '-'}{formatBRL(m.amount)}
                            </TableCell>
                          </TableRow>
                        );
                      }
                    }
                    return rows;
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
