import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Plus, Trash2, Edit, CheckCircle, Clock, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, RefreshCw, Search, Paperclip, Sparkles, Eye
} from 'lucide-react';
import { MonthNavigator } from '@/components/financial/MonthNavigator';
import { InlineEdit } from '@/components/InlineEdit';
import { CreditCardImport } from '@/components/financial/CreditCardImport';
import { InlineCategorySelect } from '@/components/financial/InlineCategorySelect';
import { CardExpenseDialog } from '@/components/financial/CardExpenseDialog';
import {
  expandOccurrencesForMonth, expandOccurrencesForMonths, monthLabel, Occurrence,
} from '@/lib/financialMonthly';
import { format, parseISO } from 'date-fns';
import { useCachedState, hasPageCache } from '@/hooks/useCachedState';
import { netRevenue, sumLinkedExpenses, taxAmount } from '@/lib/netRevenue';

interface PFIncome {
  id: string; description: string; amount: number; category: string | null;
  due_date: string; status: string; recurrence: string; recurrence_day: number | null;
  recurrence_end: string | null; is_recurring_active: boolean; notes: string | null;
  attachment_url: string | null; created_at: string;
}

interface PFExpense {
  id: string; description: string; amount: number; category: string | null;
  due_date: string; status: string; recurrence: string; recurrence_day: number | null;
  recurrence_end: string | null; is_recurring_active: boolean; notes: string | null;
  attachment_url: string | null; created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
  paid: { label: 'Pago', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  overdue: { label: 'Atrasado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
};

const incomeCategories = ['Salário', 'Freelance', 'Aluguel', 'Investimentos', 'Outros'];
const expenseCategories = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Assinaturas', 'Outros'];

export default function FinancialPersonal() {
  const [incomes, setIncomes] = useCachedState<PFIncome[]>('pf:incomes', []);
  const [expenses, setExpenses] = useCachedState<PFExpense[]>('pf:expenses', []);
  const [search, setSearch] = useState('');
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<PFIncome | null>(null);
  const [editingExpense, setEditingExpense] = useState<PFExpense | null>(null);
  const [cardDialog, setCardDialog] = useState<{ open: boolean; parentId?: string; parentTitle?: string }>({ open: false });
  const { toast } = useToast();
  const { user } = useAuth();

  // Income form
  const [iDesc, setIDesc] = useState(''); const [iAmt, setIAmt] = useState(0);
  const [iCat, setICat] = useState(''); const [iDate, setIDate] = useState('');
  const [iStatus, setIStatus] = useState('pending'); const [iRec, setIRec] = useState('one_time');
  const [iRecDay, setIRecDay] = useState(''); const [iRecEnd, setIRecEnd] = useState('');
  const [iNotes, setINotes] = useState(''); const [iTax, setITax] = useState('');

  // Expense form
  const [eDesc, setEDesc] = useState(''); const [eAmt, setEAmt] = useState(0);
  const [eCat, setECat] = useState(''); const [eDate, setEDate] = useState('');
  const [eStatus, setEStatus] = useState('pending'); const [eRec, setERec] = useState('one_time');
  const [eRecDay, setERecDay] = useState(''); const [eRecEnd, setERecEnd] = useState('');
  const [eNotes, setENotes] = useState(''); const [eAttachment, setEAttachment] = useState<File | null>(null);
  const [eLinkedIncomeId, setELinkedIncomeId] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const today = new Date().toISOString().split('T')[0];
    const [inc, exp] = await Promise.all([
      supabase.from('personal_income').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('financial_type', 'pf').order('created_at', { ascending: false }),
    ]);
    const incData = (inc.data as any) ?? [];
    const expData = (exp.data as any) ?? [];
    // Auto overdue
    for (const arr of [incData, expData]) {
      const overdue = arr.filter((r: any) => r.status === 'pending' && r.due_date < today);
      if (overdue.length) {
        const table = arr === incData ? 'personal_income' : 'expenses';
        await Promise.all(overdue.map((r: any) =>
          supabase.from(table).update({ status: 'overdue' as any }).eq('id', r.id)
        ));
        overdue.forEach((r: any) => { r.status = 'overdue'; });
      }
    }
    setIncomes(incData);
    setExpenses(expData);
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // --- Monthly competence state ---
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [showFuture, setShowFuture] = useState(false);
  const monthsToShow = showFuture ? 4 : 1;

  const monthIncomeOccs = useMemo(
    () => expandOccurrencesForMonth(incomes as any[], selectedMonth),
    [incomes, selectedMonth]
  );
  const cardParentIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of expenses as any[]) {
      if (e.category === 'Cartão de Crédito' && !e.parent_expense_id) s.add(e.id);
    }
    return s;
  }, [expenses]);

  const childrenByCard = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of expenses as any[]) {
      if (e.parent_expense_id && cardParentIds.has(e.parent_expense_id)) {
        const arr = m.get(e.parent_expense_id) ?? [];
        arr.push(e); m.set(e.parent_expense_id, arr);
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.due_date > b.due_date ? -1 : 1));
    return m;
  }, [expenses, cardParentIds]);

  const expensesForList = useMemo(
    () => (expenses as any[]).filter(e => !(e.parent_expense_id && cardParentIds.has(e.parent_expense_id))),
    [expenses, cardParentIds]
  );

  const monthExpenseOccs = useMemo(
    () => expandOccurrencesForMonth(expensesForList, selectedMonth),
    [expensesForList, selectedMonth]
  );
  const incomeOccs = useMemo(
    () => expandOccurrencesForMonths(incomes as any[], selectedMonth, monthsToShow),
    [incomes, selectedMonth, monthsToShow]
  );
  const expenseOccs = useMemo(
    () => expandOccurrencesForMonths(expensesForList, selectedMonth, monthsToShow),
    [expensesForList, selectedMonth, monthsToShow]
  );

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const resolveStatus = (occ: Occurrence<any>) => {
    if (occ.virtual && occ.occurrence_date < todayStr) return 'overdue';
    return occ.status;
  };

  /** Despesas vinculadas a cada receita PF. */
  const linkedByIncome = useMemo(
    () => sumLinkedExpenses(expenses as any[], 'linked_income_id'),
    [expenses]
  );

  const monthStats = useMemo(() => {
    let incRecebido = 0, incPrevisto = 0, expPagas = 0, expPrevistas = 0, impostos = 0;
    for (const o of monthIncomeOccs) {
      const v = Number(o.item.amount) || 0;
      impostos += taxAmount(v, (o.item as any).tax_percent);
      if (resolveStatus(o) === 'paid') incRecebido += v;
      else incPrevisto += v;
    }
    for (const o of monthExpenseOccs) {
      const v = Number(o.item.amount) || 0;
      if (resolveStatus(o) === 'paid') expPagas += v;
      else expPrevistas += v;
    }
    const saldoPrevisto = (incRecebido + incPrevisto) - (expPagas + expPrevistas);
    return {
      incRecebido, incPrevisto, expPagas, expPrevistas, impostos,
      saldoReal: incRecebido - expPagas,
      saldoPrevisto,
      saldoLiquido: saldoPrevisto - impostos,
    };
  }, [monthIncomeOccs, monthExpenseOccs]);

  async function materializeIncomePaid(occ: Occurrence<any>) {
    const it = occ.item;
    const { error } = await supabase.from('personal_income').insert({
      description: it.description, amount: it.amount, category: it.category,
      due_date: occ.occurrence_date, status: 'paid' as any,
      recurrence: 'one_time' as any, parent_income_id: it.id,
      notes: it.notes, created_by: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Receita recorrente marcada como paga!' }); loadData();
  }
  async function materializeExpensePaidPF(occ: Occurrence<any>) {
    const it = occ.item;
    const { error } = await supabase.from('expenses').insert({
      description: it.description, amount: it.amount, category: it.category,
      financial_type: 'pf' as any, due_date: occ.occurrence_date,
      status: 'paid' as any, recurrence: 'one_time' as any,
      parent_expense_id: it.id, notes: it.notes, created_by: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Despesa recorrente marcada como paga!' }); loadData();
  }

  // Income CRUD
  function openNewIncome() {
    setEditingIncome(null); setIDesc(''); setIAmt(0); setICat(''); setIDate('');
    setIStatus('pending'); setIRec('one_time'); setIRecDay(''); setIRecEnd(''); setINotes(''); setITax('');
    setShowIncomeDialog(true);
  }
  function openEditIncome(inc: PFIncome) {
    setEditingIncome(inc); setIDesc(inc.description); setIAmt(inc.amount); setICat(inc.category ?? '');
    setIDate(inc.due_date); setIStatus(inc.status); setIRec(inc.recurrence);
    setIRecDay(inc.recurrence_day?.toString() ?? ''); setIRecEnd(inc.recurrence_end ?? ''); setINotes(inc.notes ?? '');
    setITax((inc as any).tax_percent != null ? String((inc as any).tax_percent) : '');
    setShowIncomeDialog(true);
  }
  async function saveIncome() {
    const payload: any = {
      description: iDesc, amount: iAmt, category: iCat || null, due_date: iDate,
      status: iStatus as any, recurrence: iRec as any,
      recurrence_day: iRecDay ? parseInt(iRecDay) : null,
      recurrence_end: iRecEnd || null, notes: iNotes || null, created_by: user?.id,
      tax_percent: iTax ? Number(String(iTax).replace(',', '.')) : 0,
    };
    if (editingIncome) {
      await supabase.from('personal_income').update(payload).eq('id', editingIncome.id);
      toast({ title: 'Receita atualizada!' });
    } else {
      await supabase.from('personal_income').insert(payload);
      toast({ title: 'Receita criada!' });
    }
    setShowIncomeDialog(false); loadData();
  }
  async function deleteIncome(id: string) {
    await supabase.from('personal_income').delete().eq('id', id);
    toast({ title: 'Receita excluída' }); loadData();
  }
  async function markIncomePaid(id: string) {
    await supabase.from('personal_income').update({ status: 'paid' as any }).eq('id', id);
    toast({ title: 'Receita marcada como paga!' }); loadData();
  }

  // Expense CRUD
  function openNewExpense() {
    setEditingExpense(null); setEDesc(''); setEAmt(0); setECat(''); setEDate('');
    setEStatus('pending'); setERec('one_time'); setERecDay(''); setERecEnd(''); setENotes(''); setEAttachment(null); setELinkedIncomeId('');
    setShowExpenseDialog(true);
  }
  function openEditExpense(exp: PFExpense) {
    setEditingExpense(exp); setEDesc(exp.description); setEAmt(exp.amount); setECat(exp.category ?? '');
    setEDate(exp.due_date); setEStatus(exp.status); setERec(exp.recurrence);
    setERecDay(exp.recurrence_day?.toString() ?? ''); setERecEnd(exp.recurrence_end ?? ''); setENotes(exp.notes ?? '');
    setEAttachment(null); setELinkedIncomeId((exp as any).linked_income_id ?? '');
    setShowExpenseDialog(true);
  }
  async function saveExpense() {
    let attachmentUrl = editingExpense?.attachment_url ?? null;
    if (eAttachment) {
      setUploading(true);
      const path = `expenses-pf/${user?.id}/${Date.now()}.${eAttachment.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('content-files').upload(path, eAttachment);
      if (error) { toast({ title: 'Erro no upload', variant: 'destructive' }); setUploading(false); return; }
      attachmentUrl = supabase.storage.from('content-files').getPublicUrl(path).data.publicUrl;
      setUploading(false);
    }
    const payload: any = {
      description: eDesc, amount: eAmt, category: eCat || null, financial_type: 'pf' as any,
      due_date: eDate, status: eStatus as any, recurrence: eRec as any,
      recurrence_day: eRecDay ? parseInt(eRecDay) : null, recurrence_end: eRecEnd || null,
      notes: eNotes || null, attachment_url: attachmentUrl, created_by: user?.id,
      linked_income_id: eLinkedIncomeId || null,
    };
    if (editingExpense) {
      await supabase.from('expenses').update(payload).eq('id', editingExpense.id);
      toast({ title: 'Despesa atualizada!' });
    } else {
      await supabase.from('expenses').insert(payload);
      toast({ title: 'Despesa criada!' });
    }
    setShowExpenseDialog(false); loadData();
  }
  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id);
    toast({ title: 'Despesa excluída' }); loadData();
  }
  async function markExpensePaid(id: string) {
    await supabase.from('expenses').update({ status: 'paid' as any }).eq('id', id);
    toast({ title: 'Despesa marcada como paga!' }); loadData();
  }

  function renderOccurrences(occs: Occurrence<any>[], type: 'income' | 'expense') {
    const isIncome = type === 'income';
    const filtered = occs.filter(o =>
      !search || o.item.description?.toLowerCase().includes(search.toLowerCase())
    );
    const groups = new Map<string, Occurrence<any>[]>();
    for (const o of filtered) {
      const arr = groups.get(o.competence) ?? [];
      arr.push(o); groups.set(o.competence, arr);
    }
    const keys = Array.from(groups.keys()).sort();
    if (keys.length === 0) {
      return (
        <Card className="card-premium p-10 text-center text-muted-foreground">
          Nenhum registro em {monthLabel(selectedMonth)}.
        </Card>
      );
    }
    return (
      <div className="space-y-4">
        {keys.map(k => (
          <Card key={k} className="card-premium overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <h3 className="font-semibold text-foreground">{monthLabel(parseISO(k + '-01'))}</h3>
              <span className="text-xs text-muted-foreground">{groups.get(k)!.length} lançamento(s)</span>
            </div>
            <div className="table-scroll"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                  {isIncome && <TableHead>Imposto</TableHead>}
                  {isIncome && <TableHead>Líquido</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.get(k)!.map((occ, idx) => {
                  const r = occ.item;
                  const st = statusConfig[resolveStatus(occ)] ?? statusConfig.pending;
                  const StIcon = st.icon;
                  return (
                    <TableRow key={`${r.id}-${occ.occurrence_date}-${idx}`}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <InlineEdit table={isIncome ? 'personal_income' : 'expenses'} id={r.id} field="description" value={r.description} disabled={occ.virtual} onSaved={loadData} />
                          {occ.virtual && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                              <Sparkles className="mr-1 h-2.5 w-2.5" />Previsto
                            </Badge>
                          )}
                          {r.attachment_url && <a href={r.attachment_url} target="_blank"><Paperclip className="h-3 w-3 text-muted-foreground" /></a>}
                          {!isIncome && r.linked_income_id && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                              {(incomes as any[]).find(i => i.id === r.linked_income_id)?.description ?? 'Vinculada'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><InlineCategorySelect table={isIncome ? 'personal_income' : 'expenses'} id={r.id} value={r.category} disabled={occ.virtual} onSaved={loadData} /></TableCell>
                      <TableCell className={`font-medium ${isIncome ? 'text-emerald-400' : 'text-destructive'}`}>
                        <InlineEdit table={isIncome ? 'personal_income' : 'expenses'} id={r.id} field="amount" value={r.amount} type="number" disabled={occ.virtual} format={(v) => fmt(Number(v))} onSaved={loadData} />
                      </TableCell>
                      {isIncome && (
                        <TableCell className="text-destructive text-xs whitespace-nowrap">
                          <InlineEdit table="personal_income" id={r.id} field="tax_percent" value={r.tax_percent ?? 0} type="number"
                            disabled={occ.virtual}
                            display={`${Number(r.tax_percent ?? 0).toLocaleString('pt-BR')}% • ${fmt(taxAmount(r.amount, r.tax_percent))}`}
                            onSaved={loadData} />
                        </TableCell>
                      )}
                      {isIncome && (
                        <TableCell className="font-medium text-emerald-400 whitespace-nowrap">
                          {fmt(netRevenue(r.amount, r.tax_percent, linkedByIncome.get(r.id) ?? 0))}
                          {(linkedByIncome.get(r.id) ?? 0) > 0 && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              −{fmt(linkedByIncome.get(r.id) ?? 0)} em despesas
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground">
                        <InlineEdit table={isIncome ? 'personal_income' : 'expenses'} id={r.id} field="due_date" value={r.due_date} type="date" disabled={occ.virtual} format={(v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'} display={new Date(occ.occurrence_date).toLocaleDateString('pt-BR')} onSaved={loadData} />
                      </TableCell>
                      <TableCell>
                        {r.recurrence === 'recurring' ? (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                            <RefreshCw className="mr-1 h-3 w-3" />Recorrente
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">Única</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={st.color}><StIcon className="mr-1 h-3 w-3" />{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!isIncome && cardParentIds.has(r.id) && (
                            <Button variant="ghost" size="icon" title="Ver itens da fatura"
                              onClick={() => setCardDialog({ open: true, parentId: r.id, parentTitle: r.description })}>
                              <Eye className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {resolveStatus(occ) !== 'paid' && (
                            <Button variant="ghost" size="icon" title="Marcar como pago"
                              onClick={() => {
                                if (occ.virtual) {
                                  isIncome ? materializeIncomePaid(occ) : materializeExpensePaidPF(occ);
                                } else {
                                  isIncome ? markIncomePaid(r.id) : markExpensePaid(r.id);
                                }
                              }}>
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => isIncome ? openEditIncome(r) : openEditExpense(r)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!occ.virtual && (
                            <Button variant="ghost" size="icon" onClick={() => isIncome ? deleteIncome(r.id) : deleteExpense(r.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table></div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Financeiro PF</h1>
            <p className="text-muted-foreground">Receitas e despesas pessoais — gestão por competência mensal</p>
          </div>
          <ReceiptScanDialog financialType="pf" onSaved={loadData} />
        </div>

        <MonthNavigator
          value={selectedMonth}
          onChange={setSelectedMonth}
          showFuture={showFuture}
          onShowFutureChange={setShowFuture}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Receitas recebidas</CardTitle>
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">{fmt(monthStats.incRecebido)}</div>
              <p className="text-xs text-muted-foreground mt-1">+{fmt(monthStats.incPrevisto)} previsto</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Despesas pagas</CardTitle>
              <TrendingDown className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{fmt(monthStats.expPagas)}</div>
              <p className="text-xs text-muted-foreground mt-1">+{fmt(monthStats.expPrevistas)} previsto</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo real</CardTitle>
              <DollarSign className={`h-5 w-5 ${monthStats.saldoReal >= 0 ? 'text-emerald-400' : 'text-destructive'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthStats.saldoReal >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                {fmt(monthStats.saldoReal)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Já realizado no mês</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo previsto</CardTitle>
              <DollarSign className={`h-5 w-5 ${monthStats.saldoPrevisto >= 0 ? 'text-emerald-400' : 'text-destructive'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthStats.saldoPrevisto >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                {fmt(monthStats.saldoPrevisto)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Considerando pendentes</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo líquido</CardTitle>
              <DollarSign className={`h-5 w-5 ${monthStats.saldoLiquido >= 0 ? 'text-emerald-400' : 'text-destructive'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthStats.saldoLiquido >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                {fmt(monthStats.saldoLiquido)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Já com {fmt(monthStats.impostos)} de imposto</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="income" className="space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="income">Receitas</TabsTrigger>
              <TabsTrigger value="expenses">Despesas</TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-full bg-card border-border" />
            </div>
          </div>

          <TabsContent value="income" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openNewIncome}><Plus className="mr-2 h-4 w-4" /> Nova Receita</Button>
            </div>
            {renderOccurrences(incomeOccs, 'income')}
          </TabsContent>

          <TabsContent value="expenses" className="space-y-4">
            <div className="flex justify-end gap-2">
              <CreditCardImport onImported={loadData} financialType="pf" />
              <Button onClick={openNewExpense}><Plus className="mr-2 h-4 w-4" /> Nova Despesa</Button>
            </div>
            {renderOccurrences(expenseOccs, 'expense')}
          </TabsContent>
        </Tabs>
      </div>

      {/* Income Dialog */}
      <Dialog open={showIncomeDialog} onOpenChange={setShowIncomeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingIncome ? 'Editar Receita' : 'Nova Receita'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Descrição</Label><Input value={iDesc} onChange={e => setIDesc(e.target.value)} placeholder="Ex: Aluguel apartamento" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor (R$)</Label><Input type="number" value={iAmt || ''} onChange={e => setIAmt(Number(e.target.value))} /></div>
              <div><Label>Categoria</Label>
                <Select value={iCat} onValueChange={setICat}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{incomeCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data</Label><Input type="date" value={iDate} onChange={e => setIDate(e.target.value)} /></div>
              <div><Label>Tipo</Label>
                <Select value={iRec} onValueChange={setIRec}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="one_time">Única</SelectItem><SelectItem value="recurring">Recorrente</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            {iRec === 'recurring' && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Dia fixo</Label><Input type="number" min="1" max="31" value={iRecDay} onChange={e => setIRecDay(e.target.value)} /></div>
                <div><Label>Data final</Label><Input type="date" value={iRecEnd} onChange={e => setIRecEnd(e.target.value)} /></div>
              </div>
            )}
            <div><Label>Status</Label>
              <Select value={iStatus} onValueChange={setIStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Imposto (%)</Label><Input type="number" step="0.01" min="0" value={iTax} onChange={e => setITax(e.target.value)} placeholder="Ex: 6" /></div>
            {iAmt > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Imposto</span>
                  <span className="text-destructive">{fmt(taxAmount(iAmt, iTax))}</span></div>
                <div className="flex justify-between font-semibold"><span>Líquido (sem despesas)</span>
                  <span className="text-emerald-400">{fmt(netRevenue(iAmt, iTax))}</span></div>
              </div>
            )}
            <div><Label>Observações</Label><Textarea value={iNotes} onChange={e => setINotes(e.target.value)} rows={2} /></div>
            <Button className="w-full" onClick={saveIncome} disabled={!iDesc || !iDate}>{editingIncome ? 'Salvar' : 'Criar Receita'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingExpense ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Descrição</Label><Input value={eDesc} onChange={e => setEDesc(e.target.value)} placeholder="Ex: Conta de luz" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor (R$)</Label><Input type="number" value={eAmt || ''} onChange={e => setEAmt(Number(e.target.value))} /></div>
              <div><Label>Categoria</Label>
                <Select value={eCat} onValueChange={setECat}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data</Label><Input type="date" value={eDate} onChange={e => setEDate(e.target.value)} /></div>
              <div><Label>Tipo</Label>
                <Select value={eRec} onValueChange={setERec}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="one_time">Única</SelectItem><SelectItem value="recurring">Recorrente</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            {eRec === 'recurring' && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Dia fixo</Label><Input type="number" min="1" max="31" value={eRecDay} onChange={e => setERecDay(e.target.value)} /></div>
                <div><Label>Data final</Label><Input type="date" value={eRecEnd} onChange={e => setERecEnd(e.target.value)} /></div>
              </div>
            )}
            <div><Label>Status</Label>
              <Select value={eStatus} onValueChange={setEStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vincular à receita (opcional)</Label>
              <Select value={eLinkedIncomeId || '__none__'} onValueChange={(v) => setELinkedIncomeId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {(incomes as any[]).filter(i => !i.parent_income_id).map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.description} — {fmt(Number(i.amount))} ({new Date(i.due_date).toLocaleDateString('pt-BR')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Despesas vinculadas são descontadas do líquido daquela receita.
              </p>
            </div>
            <div><Label>Comprovante</Label><Input type="file" onChange={e => setEAttachment(e.target.files?.[0] ?? null)} accept="image/*,.pdf" /></div>
            <div><Label>Observações</Label><Textarea value={eNotes} onChange={e => setENotes(e.target.value)} rows={2} /></div>
            <Button className="w-full" onClick={saveExpense} disabled={!eDesc || !eDate || uploading}>
              {uploading ? 'Enviando...' : editingExpense ? 'Salvar' : 'Criar Despesa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {cardDialog.parentId && (
        <CardExpenseDialog
          open={cardDialog.open}
          onOpenChange={(o) => setCardDialog(s => ({ ...s, open: o }))}
          parentId={cardDialog.parentId}
          parentTitle={cardDialog.parentTitle ?? 'Fatura de Cartão'}
          children={childrenByCard.get(cardDialog.parentId) ?? []}
          onChanged={loadData}
        />
      )}
    </AppLayout>
  );
}
