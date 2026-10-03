import { netRevenue } from '@/lib/netRevenue';
import { sumCostsByInvoice } from '@/lib/invoiceCosts';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Users, FolderKanban, FileText, CheckCircle2, Clock, AlertTriangle,
  AlertOctagon, CalendarClock, RotateCcw, TrendingDown, TrendingUp,
  ArrowUpRight, ArrowDownRight, Wallet, Receipt, PiggyBank, CircleDollarSign,
  Sparkles, Calendar as CalendarIcon, MessageSquare, ThumbsUp, FilePlus2,
  PlayCircle, Video, Camera, Megaphone, Trophy, ChevronRight,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { expandOccurrencesForMonth , withoutCardChildren, withoutCancelled } from '@/lib/financialMonthly';
import { ClientNotificationsCard } from '@/components/dashboard/ClientNotificationsCard';
import { useUrlState } from '@/hooks/usePersistedState';
import { useCachedState, hasPageCache } from '@/hooks/useCachedState';


type Period = '7d' | '30d' | 'month' | 'quarter' | 'year';

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRLfull = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface OpsStats {
  activeClients: number;
  activeProjects: number;
  pendingApprovals: number;
  overdueTasks: number;
}

interface FinStats {
  revenueMonth: number;
  revenuePrevMonth: number;
  netRevenueMonth?: number;
  receivables: number;
  expensesMonth: number;
  expensesPrevMonth: number;
}

interface AttentionItem {
  id: string;
  kind: 'approval' | 'invoice_due' | 'overdue_task' | 'quote_pending' | 'meeting' | 'payment_pending';
  icon: any;
  title: string;
  subtitle: string;
  tone: 'critical' | 'warning' | 'info';
  link: string;
}

interface PipelineCounts {
  draft: number;
  in_review: number;
  revision: number;
  approved: number;
  published: number;
}

interface AgendaItem {
  id: string;
  date: string;
  title: string;
  client: string;
  type: 'gravacao' | 'entrega' | 'reuniao';
  link: string;
}

interface ActivityFeedItem {
  id: string;
  icon: any;
  tone: string;
  text: string;
  client: string;
  time: string;
}

const periodDays: Record<Period, number> = { '7d': 7, '30d': 30, month: 30, quarter: 90, year: 365 };

export default function Dashboard() {
  const { user } = useAuth();
  const [periodRaw, setPeriodRaw] = useUrlState('period', '30d');
  const period = periodRaw as Period;
  const setPeriod = (p: Period) => setPeriodRaw(p);
  const [ops, setOps] = useCachedState<OpsStats>('dash:ops', { activeClients: 0, activeProjects: 0, pendingApprovals: 0, overdueTasks: 0 });
  const [fin, setFin] = useCachedState<FinStats>('dash:fin', { revenueMonth: 0, revenuePrevMonth: 0, receivables: 0, expensesMonth: 0, expensesPrevMonth: 0 });
  const [cashflow, setCashflow] = useCachedState<{ date: string; entrada: number; saida: number }[]>('dash:cashflow', []);
  const [topClients, setTopClients] = useCachedState<{ name: string; value: number }[]>('dash:topClients', []);
  const [pipeline, setPipeline] = useCachedState<PipelineCounts>('dash:pipeline', { draft: 0, in_review: 0, revision: 0, approved: 0, published: 0 });
  const [attention, setAttention] = useCachedState<AttentionItem[]>('dash:attention', []);
  const [agenda, setAgenda] = useCachedState<AgendaItem[]>('dash:agenda', []);
  const [feed, setFeed] = useCachedState<ActivityFeedItem[]>('dash:feed', []);
  const [loading, setLoading] = useState(!hasPageCache('dash:ops'));

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [period]);

  async function loadAll() {
    setLoading(!hasPageCache('dash:ops'));
    await Promise.all([loadOps(), loadFinancial(), loadCashflow(), loadTopClients(), loadPipeline(), loadAttention(), loadAgenda(), loadFeed()]);
    setLoading(false);
  }

  async function loadOps() {
    const today = new Date().toISOString().split('T')[0];
    const [clients, projects, approvals, overdue] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('projects').select('id', { count: 'exact', head: true }).in('status', ['in_progress', 'review']),
      supabase.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
      supabase.from('contents').select('id', { count: 'exact', head: true }).lt('deadline', today).not('status', 'in', '("approved","published")').not('deadline', 'is', null),
    ]);
    setOps({
      activeClients: clients.count ?? 0,
      activeProjects: projects.count ?? 0,
      pendingApprovals: approvals.count ?? 0,
      overdueTasks: overdue.count ?? 0,
    });
  }

  async function loadFinancial() {
    const now = new Date();
    const prev = subMonths(now, 1);
    const monthStart = startOfMonth(now).toISOString().split('T')[0];
    const monthEnd = endOfMonth(now).toISOString().split('T')[0];
    const prevStart = startOfMonth(prev).toISOString().split('T')[0];
    const prevEnd = endOfMonth(prev).toISOString().split('T')[0];

    // Puxa TODOS os itens (inclusive recorrentes/parents) e expande via mesma engine dos módulos Financeiro PJ/PF.
    const recFields = 'id, due_date, amount, status, recurrence, recurrence_day, recurrence_end, is_recurring_active, tax_percent';
    const [invAll, pfAll, expAll, costAll] = await Promise.all([
      supabase.from('invoices').select(`${recFields}, parent_invoice_id`),
      supabase.from('personal_income').select(`${recFields}, parent_income_id`),
      supabase.from('expenses').select('id, due_date, amount, status, recurrence, recurrence_day, recurrence_end, is_recurring_active, parent_expense_id, category'),
      supabase.from('invoice_costs').select('invoice_id, mode, value'),
    ]);

    const invItems = withoutCancelled((invAll.data ?? []) as any[]);
    const pfItems = (pfAll.data ?? []) as any[];
    const expItems = withoutCardChildren((expAll.data ?? []) as any[]);

    const invCurOcc = expandOccurrencesForMonth(invItems, now);
    const invPrevOcc = expandOccurrencesForMonth(invItems, prev);
    const pfCurOcc = expandOccurrencesForMonth(pfItems, now);
    const pfPrevOcc = expandOccurrencesForMonth(pfItems, prev);
    const expCurOcc = expandOccurrencesForMonth(expItems, now);
    const expPrevOcc = expandOccurrencesForMonth(expItems, prev);

    const sumPaid = (occs: any[]) => occs.filter(o => o.status === 'paid').reduce((a, o) => a + Number(o.item.amount || 0), 0);
    const sumPending = (occs: any[]) => occs.filter(o => o.status !== 'paid').reduce((a, o) => a + Number(o.item.amount || 0), 0);
    const sumAll = (occs: any[]) => occs.reduce((a, o) => a + Number(o.item.amount || 0), 0);

    const costMap = sumCostsByInvoice((costAll.data ?? []) as any[], new Map(invItems.map((i: any) => [i.id, Number(i.amount) || 0])));
    const sumNet = (occs: any[], withCosts: boolean) => occs.filter(o => o.status === 'paid')
      .reduce((a, o) => a + netRevenue(o.item.amount, o.item.tax_percent, withCosts ? (costMap.get(o.item.id) ?? 0) : 0), 0);
    setFin({
      netRevenueMonth: sumNet(invCurOcc, true) + sumNet(pfCurOcc, false),
      revenueMonth: sumPaid(invCurOcc) + sumPaid(pfCurOcc),
      revenuePrevMonth: sumPaid(invPrevOcc) + sumPaid(pfPrevOcc),
      receivables: sumPending(invCurOcc) + sumPending(pfCurOcc),
      expensesMonth: sumAll(expCurOcc),
      expensesPrevMonth: sumAll(expPrevOcc),
    });
  }


  async function loadCashflow() {
    const days = periodDays[period];
    const from = subDays(new Date(), days - 1);
    const fromIso = from.toISOString().split('T')[0];

    const [inv, exp, pf] = await Promise.all([
      supabase.from('invoices').select('amount, paid_at').eq('status', 'paid').gte('paid_at', fromIso),
      supabase.from('expenses').select('id, amount, due_date, category, parent_expense_id'),
      supabase.from('personal_income').select('amount, due_date').eq('status', 'paid').gte('due_date', fromIso),
    ]);

    const buckets = eachDayOfInterval({ start: from, end: new Date() }).map((d) => ({
      date: format(d, 'dd/MM'),
      _d: d,
      entrada: 0,
      saida: 0,
    }));

    (inv.data ?? []).forEach((r: any) => {
      if (!r.paid_at) return;
      const d = new Date(r.paid_at);
      const b = buckets.find((b) => isSameDay(b._d, d));
      if (b) b.entrada += Number(r.amount || 0);
    });
    (pf.data ?? []).forEach((r: any) => {
      if (!r.due_date) return;
      const d = new Date(r.due_date);
      const b = buckets.find((b) => isSameDay(b._d, d));
      if (b) b.entrada += Number(r.amount || 0);
    });
    withoutCardChildren((exp.data ?? []) as any[]).filter((r: any) => r.due_date >= fromIso).forEach((r: any) => {
      if (!r.due_date) return;
      const d = new Date(r.due_date);
      const b = buckets.find((b) => isSameDay(b._d, d));
      if (b) b.saida += Number(r.amount || 0);
    });

    setCashflow(buckets.map(({ _d, ...rest }) => rest));
  }

  async function loadTopClients() {
    const fromIso = startOfMonth(subMonths(new Date(), 2)).toISOString().split('T')[0];
    const { data } = await supabase
      .from('invoices')
      .select('amount, clients(name, company)')
      .eq('status', 'paid')
      .gte('paid_at', fromIso);

    const agg = new Map<string, number>();
    (data ?? []).forEach((r: any) => {
      const name = r.clients?.company || r.clients?.name || '—';
      agg.set(name, (agg.get(name) ?? 0) + Number(r.amount || 0));
    });
    const ranked = [...agg.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setTopClients(ranked);
  }

  async function loadPipeline() {
    const { data } = await supabase.from('contents').select('status');
    const p: PipelineCounts = { draft: 0, in_review: 0, revision: 0, approved: 0, published: 0 };
    (data ?? []).forEach((r: any) => {
      if (r.status in p) (p as any)[r.status]++;
    });
    setPipeline(p);
  }

  async function loadAttention() {
    const items: AttentionItem[] = [];
    const today = new Date().toISOString().split('T')[0];
    const in7 = addDays(new Date(), 7).toISOString().split('T')[0];

    const [approvals, dueInvoices, overdueTasks, pendingQuotes, pendingPayments] = await Promise.all([
      supabase.from('contents').select('id, title, project_id, projects(name, clients(name, company))').eq('status', 'in_review').limit(10),
      supabase.from('invoices').select('id, title, due_date, amount, clients(name, company)').eq('status', 'pending').lte('due_date', in7).limit(10),
      supabase.from('contents').select('id, title, deadline, project_id, projects(name, clients(name, company))').lt('deadline', today).not('status', 'in', '("approved","published")').not('deadline', 'is', null).limit(10),
      supabase.from('quotes').select('id, title, clients(name, company)').eq('status', 'sent').limit(10),
      supabase.from('projects').select('id, name, payment_amount, clients(name, company)').eq('payment_pending', true).limit(10),
    ]);

    (pendingPayments.data ?? []).forEach((p: any) => items.push({
      id: `pay-${p.id}`, kind: 'payment_pending', icon: CircleDollarSign, tone: 'warning',
      title: `Definir pagamento — ${p.name}`,
      subtitle: `${p.clients?.company || p.clients?.name || '—'}${p.payment_amount ? ` • ${BRL(Number(p.payment_amount))}` : ''}`,
      link: `/projects/${p.id}`,
    }));

    (approvals.data ?? []).forEach((c: any) => items.push({
      id: `apr-${c.id}`, kind: 'approval', icon: ThumbsUp, tone: 'info',
      title: `Aprovação pendente — ${c.title}`,
      subtitle: c.projects?.clients?.company || c.projects?.clients?.name || c.projects?.name || '',
      link: `/projects/${c.project_id}`,
    }));
    (dueInvoices.data ?? []).forEach((inv: any) => {
      const overdue = inv.due_date < today;
      items.push({
        id: `inv-${inv.id}`, kind: 'invoice_due', icon: CircleDollarSign,
        tone: overdue ? 'critical' : 'warning',
        title: `${overdue ? 'Fatura vencida' : 'Fatura vencendo'} — ${BRL(Number(inv.amount))}`,
        subtitle: `${inv.clients?.company || inv.clients?.name || '—'} • ${format(new Date(inv.due_date), "dd 'de' MMM", { locale: ptBR })}`,
        link: '/financial',
      });
    });
    (overdueTasks.data ?? []).forEach((c: any) => items.push({
      id: `ovt-${c.id}`, kind: 'overdue_task', icon: CalendarClock, tone: 'critical',
      title: `Atrasado — ${c.title}`,
      subtitle: `${c.projects?.clients?.company || c.projects?.clients?.name || '—'} • venceu ${format(new Date(c.deadline), "dd/MM", { locale: ptBR })}`,
      link: `/projects/${c.project_id}`,
    }));
    (pendingQuotes.data ?? []).forEach((q: any) => items.push({
      id: `qt-${q.id}`, kind: 'quote_pending', icon: FilePlus2, tone: 'info',
      title: `Proposta aguardando resposta — ${q.title}`,
      subtitle: q.clients?.company || q.clients?.name || '—',
      link: '/financial',
    }));

    const toneOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
    setAttention(items.slice(0, 12));
  }

  async function loadAgenda() {
    const today = new Date().toISOString().split('T')[0];
    const in14 = addDays(new Date(), 14).toISOString().split('T')[0];
    const [contents, projects] = await Promise.all([
      supabase.from('contents').select('id, title, deadline, type, project_id, projects(name, clients(name, company))').gte('deadline', today).lte('deadline', in14).not('status', 'in', '("approved","published")').order('deadline').limit(10),
      supabase.from('projects').select('id, name, deadline, clients(name, company)').gte('deadline', today).lte('deadline', in14).not('status', 'in', '("completed","cancelled")').order('deadline').limit(5),
    ]);

    const items: AgendaItem[] = [];
    (contents.data ?? []).forEach((c: any) => {
      const isVideo = ['video', 'reels'].includes(c.type);
      items.push({
        id: `c-${c.id}`, date: c.deadline,
        title: c.title,
        client: c.projects?.clients?.company || c.projects?.clients?.name || c.projects?.name || '—',
        type: isVideo ? 'gravacao' : 'entrega',
        link: `/projects/${c.project_id}`,
      });
    });
    (projects.data ?? []).forEach((p: any) => {
      items.push({
        id: `p-${p.id}`, date: p.deadline, title: `Entrega — ${p.name}`,
        client: p.clients?.company || p.clients?.name || '—',
        type: 'entrega', link: `/projects/${p.id}`,
      });
    });
    items.sort((a, b) => a.date.localeCompare(b.date));
    setAgenda(items.slice(0, 8));
  }

  async function loadFeed() {
    // Build a human "agency feed" by combining recent meaningful events
    const since = subDays(new Date(), 14).toISOString();
    const [paidInv, paidPf, approvedContents, reviewContents, newProjects, newClients] = await Promise.all([
      supabase.from('invoices').select('id, amount, paid_at, clients(name, company)').eq('status', 'paid').not('paid_at', 'is', null).gte('paid_at', since).order('paid_at', { ascending: false }).limit(10),
      supabase.from('personal_income').select('id, amount, description, updated_at, due_date').eq('status', 'paid').gte('updated_at', since).order('updated_at', { ascending: false }).limit(10),
      supabase.from('contents').select('id, title, updated_at, project_id, projects(clients(name, company))').eq('status', 'approved').gte('updated_at', since).order('updated_at', { ascending: false }).limit(10),
      supabase.from('contents').select('id, title, updated_at, project_id, projects(clients(name, company))').eq('status', 'revision').gte('updated_at', since).order('updated_at', { ascending: false }).limit(10),
      supabase.from('projects').select('id, name, created_at, clients(name, company)').gte('created_at', since).order('created_at', { ascending: false }).limit(5),
      supabase.from('clients').select('id, name, company, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(5),
    ]);

    const items: ActivityFeedItem[] = [];
    (paidInv.data ?? []).forEach((r: any) => items.push({
      id: `pi-${r.id}`, icon: CircleDollarSign, tone: 'text-emerald-400',
      text: `Pagamento recebido (PJ) — ${BRL(Number(r.amount))}`,
      client: r.clients?.company || r.clients?.name || '—',
      time: r.paid_at,
    }));
    (paidPf.data ?? []).forEach((r: any) => items.push({
      id: `pp-${r.id}`, icon: CircleDollarSign, tone: 'text-emerald-400',
      text: `Receita PF recebida — ${BRL(Number(r.amount))}`,
      client: r.description || 'Pessoal',
      time: r.updated_at || r.due_date,
    }));
    (approvedContents.data ?? []).forEach((r: any) => items.push({
      id: `ac-${r.id}`, icon: CheckCircle2, tone: 'text-emerald-400',
      text: `Conteúdo aprovado — ${r.title}`,
      client: r.projects?.clients?.company || r.projects?.clients?.name || '—',
      time: r.updated_at,
    }));
    (reviewContents.data ?? []).forEach((r: any) => items.push({
      id: `rc-${r.id}`, icon: MessageSquare, tone: 'text-amber-400',
      text: `Pediu alteração — ${r.title}`,
      client: r.projects?.clients?.company || r.projects?.clients?.name || '—',
      time: r.updated_at,
    }));
    (newProjects.data ?? []).forEach((r: any) => items.push({
      id: `np-${r.id}`, icon: PlayCircle, tone: 'text-blue-400',
      text: `Novo projeto criado — ${r.name}`,
      client: r.clients?.company || r.clients?.name || '—',
      time: r.created_at,
    }));
    (newClients.data ?? []).forEach((r: any) => items.push({
      id: `nc-${r.id}`, icon: Sparkles, tone: 'text-violet-400',
      text: `Novo cliente — ${r.company || r.name}`,
      client: r.company || r.name,
      time: r.created_at,
    }));

    items.sort((a, b) => (a.time < b.time ? 1 : -1));
    setFeed(items.slice(0, 10));
  }

  const profit = fin.revenueMonth - fin.expensesMonth;
  const revDelta = fin.revenuePrevMonth > 0 ? ((fin.revenueMonth - fin.revenuePrevMonth) / fin.revenuePrevMonth) * 100 : 0;
  const expDelta = fin.expensesPrevMonth > 0 ? ((fin.expensesMonth - fin.expensesPrevMonth) / fin.expensesPrevMonth) * 100 : 0;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);
  const userName = (user?.user_metadata as any)?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  const maxClient = topClients[0]?.value || 1;
  const totalPipeline = Object.values(pipeline).reduce((a, b) => a + b, 0) || 1;
  const pipelineSteps: { key: keyof PipelineCounts; label: string; color: string }[] = [
    { key: 'draft', label: 'Produção', color: 'bg-slate-500' },
    { key: 'in_review', label: 'Aguardando', color: 'bg-amber-500' },
    { key: 'revision', label: 'Alteração', color: 'bg-purple-500' },
    { key: 'approved', label: 'Aprovado', color: 'bg-emerald-500' },
    { key: 'published', label: 'Publicado', color: 'bg-blue-500' },
  ];

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{greeting}{userName ? `, ${userName}` : ''}</p>
            <h1 className="page-title">Command Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão executiva da operação da Racun em tempo real.
            </p>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="bg-card/60 border border-border/60">
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="quarter">Trim.</TabsTrigger>
              <TabsTrigger value="year">Ano</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Linha 1 — Financeiro */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceCard
            label="Faturamento do mês"
            value={BRL(fin.revenueMonth)}
            delta={revDelta}
            deltaLabel="vs mês anterior (PJ + PF)"
            footnote={`Líquido: ${BRL(fin.netRevenueMonth ?? 0)} (após impostos e custos)`}
            icon={Wallet}
            accent="from-emerald-500/20 to-emerald-500/0"
            iconColor="text-emerald-400"
          />
          <FinanceCard
            label="Contas a receber"
            value={BRL(fin.receivables)}
            subtitle="Pendentes em aberto (PJ + PF)"
            icon={Receipt}
            accent="from-blue-500/20 to-blue-500/0"
            iconColor="text-blue-400"
          />
          <FinanceCard
            label="Despesas do mês"
            value={BRL(fin.expensesMonth)}
            delta={expDelta}
            deltaLabel="vs mês anterior (PJ + PF)"
            invertDelta
            icon={CircleDollarSign}
            accent="from-rose-500/20 to-rose-500/0"
            iconColor="text-rose-400"
          />
          <FinanceCard
            label="Lucro estimado"
            value={BRL(profit)}
            subtitle="Receita − despesas (PJ + PF)"
            icon={PiggyBank}
            accent="from-violet-500/20 to-violet-500/0"
            iconColor="text-violet-400"
            highlight={profit > 0}
          />
        </section>

        {/* Linha 2 — Operação */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OpsCard label="Clientes ativos" value={ops.activeClients} icon={Users} link="/clients" />
          <OpsCard label="Projetos em andamento" value={ops.activeProjects} icon={FolderKanban} link="/projects" />
          <OpsCard label="Aguardando aprovação" value={ops.pendingApprovals} icon={FileText} link="/contents" tone="amber" />
          <OpsCard label="Tarefas atrasadas" value={ops.overdueTasks} icon={AlertOctagon} link="/contents" tone="rose" />
        </section>

        {/* Precisa da sua atenção + Pipeline */}
        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="card-premium lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Precisa da sua atenção
                {attention.length > 0 && (
                  <Badge variant="outline" className="ml-1 border-primary/30 text-primary">
                    {attention.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <SkeletonRows />
              ) : attention.length === 0 ? (
                <EmptyState icon={CheckCircle2} message="Tudo em dia. Nenhum item pedindo sua atenção." />
              ) : (
                attention.map((it) => {
                  const Icon = it.icon;
                  const ringClass = it.tone === 'critical'
                    ? 'border-rose-500/30 bg-rose-500/[0.04] hover:bg-rose-500/[0.08]'
                    : it.tone === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]'
                      : 'border-border/60 bg-muted/20 hover:bg-muted/40';
                  const iconClass = it.tone === 'critical' ? 'text-rose-400' : it.tone === 'warning' ? 'text-amber-400' : 'text-primary';
                  return (
                    <Link key={it.id} to={it.link} className={`group flex items-center gap-3 rounded-xl border p-3 transition-colors ${ringClass}`}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60 ${iconClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{it.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Pipeline de aprovação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pipelineSteps.map((s, i) => {
                const v = pipeline[s.key];
                const pct = (v / totalPipeline) * 100;
                return (
                  <div key={s.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${s.color}`} />
                        {s.label}
                      </span>
                      <span className="font-mono text-foreground">{v}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                      <div className={`h-full rounded-full ${s.color} transition-all`} style={{ width: `${Math.max(pct, v > 0 ? 4 : 0)}%` }} />
                    </div>
                  </div>
                );
              })}
              <Link to="/contents" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Ver pipeline completo <ChevronRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </section>

        {/* Atividade dos clientes (aprovações, pedidos de alteração, comentários) */}
        <section>
          <ClientNotificationsCard />
        </section>


        {/* Charts: cashflow + top clients */}
        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="card-premium lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base text-foreground">Fluxo financeiro</CardTitle>
                <p className="text-xs text-muted-foreground">Entradas (PJ + PF) vs saídas (PJ + PF) no período</p>
              </div>
              <div className="hidden gap-3 text-xs text-muted-foreground sm:flex">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Entrada</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> Saída</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashflow} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(160 84% 45%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(160 84% 45%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                      formatter={(v: any) => BRLfull(Number(v))}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Area type="monotone" dataKey="entrada" stroke="hsl(160 84% 45%)" strokeWidth={2} fill="url(#gIn)" />
                    <Area type="monotone" dataKey="saida" stroke="hsl(0 84% 60%)" strokeWidth={2} fill="url(#gOut)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <Trophy className="h-4 w-4 text-amber-400" />
                Receita por cliente
              </CardTitle>
              <p className="text-xs text-muted-foreground">Top 5 — últimos 3 meses (faturas PJ)</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {topClients.length === 0 ? (
                <EmptyState icon={Users} message="Sem receita registrada no período." />
              ) : (
                topClients.map((c, i) => (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                        <span className="truncate text-foreground">{c.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{BRL(c.value)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
                        style={{ width: `${(c.value / maxClient) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Agenda + Atividade */}
        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <CalendarIcon className="h-4 w-4 text-primary" />
                Agenda da agência
              </CardTitle>
              <p className="text-xs text-muted-foreground">Próximas gravações e entregas</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <SkeletonRows /> : agenda.length === 0 ? (
                <EmptyState icon={CalendarIcon} message="Nada agendado para os próximos 14 dias." />
              ) : agenda.map((a) => {
                const Icon = a.type === 'gravacao' ? Video : a.type === 'reuniao' ? Megaphone : Camera;
                const d = new Date(a.date);
                return (
                  <Link key={a.id} to={a.link} className="group flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-background/60 text-center">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{format(d, 'MMM', { locale: ptBR })}</span>
                      <span className="text-base font-bold leading-none text-foreground">{format(d, 'dd')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{a.client}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Atividade da agência
              </CardTitle>
              <p className="text-xs text-muted-foreground">O que está acontecendo agora</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <SkeletonRows /> : feed.length === 0 ? (
                <EmptyState icon={Sparkles} message="Sem movimentações recentes." />
              ) : feed.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/60 ${f.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{f.text}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground/70">{f.client}</span>
                        {' · '}
                        {format(new Date(f.time), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}

/* ---------------- Subcomponents ---------------- */

function FinanceCard({
  label, value, subtitle, footnote, delta, deltaLabel, invertDelta, icon: Icon, accent, iconColor, highlight,
}: {
  label: string; value: string; subtitle?: string; footnote?: string;
  delta?: number; deltaLabel?: string; invertDelta?: boolean;
  icon: any; accent: string; iconColor: string; highlight?: boolean;
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;
  const positive = hasDelta ? (invertDelta ? delta! < 0 : delta! > 0) : false;
  return (
    <Card className="card-premium">
      <div className={`pointer-events-none absolute inset-x-0 -top-px h-32 bg-gradient-to-b ${accent}`} />
      <CardContent className="relative p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-background/60 ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={`mt-3 font-display text-3xl font-bold tracking-tight ${highlight ? 'text-emerald-400' : 'text-foreground'}`}>
          {value}
        </div>
        {footnote && <div className="mt-1 text-sm font-medium text-emerald-400">{footnote}</div>}
        <div className="mt-2 flex items-center gap-2 text-xs">
          {hasDelta ? (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta!).toFixed(1)}%
            </span>
          ) : null}
          <span className="text-muted-foreground">{deltaLabel || subtitle}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function OpsCard({ label, value, icon: Icon, link, tone }: { label: string; value: number; icon: any; link: string; tone?: 'amber' | 'rose' }) {
  const toneClass = tone === 'rose' ? 'text-rose-400' : tone === 'amber' ? 'text-amber-400' : 'text-primary';
  return (
    <Link to={link} className="card-premium group block p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-background/60 transition-colors group-hover:bg-background ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="font-display text-3xl font-bold text-foreground">{value}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-14 rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
