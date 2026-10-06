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
import { useUrlState } from '@/hooks/usePersistedState';
import {
  Plus, DollarSign, FileText, Receipt, Trash2, Edit, AlertTriangle,
  CheckCircle, Clock, XCircle, TrendingUp, TrendingDown, Search,
  MessageCircle, RefreshCw, Paperclip, Sparkles, CreditCard, Eye
} from 'lucide-react';
import { MonthNavigator } from '@/components/financial/MonthNavigator';
import { InlineEdit } from '@/components/InlineEdit';
import { CreditCardImport } from '@/components/financial/CreditCardImport';
import { InlineCategorySelect } from '@/components/financial/InlineCategorySelect';
import { CardExpenseDialog } from '@/components/financial/CardExpenseDialog';
import { ClientCombobox } from '@/components/clients/ClientCombobox';
import {
  expandOccurrencesForMonth,
  expandOccurrencesForMonths,
  monthLabel,
  Occurrence,
} from '@/lib/financialMonthly';
import { format, parseISO } from 'date-fns';
import { useCachedState, hasPageCache } from '@/hooks/useCachedState';
import { netRevenue, sumLinkedExpenses, taxAmount } from '@/lib/netRevenue';
import { InvoiceCostsEditor } from '@/components/finance/InvoiceCostsEditor';
import { loadInvoiceCosts, saveInvoiceCosts, sumCostsByInvoice, totalCosts, type InvoiceCost } from '@/lib/invoiceCosts';

// Types
interface Quote {
  id: string;
  client_id: string;
  title: string;
  services: { name: string; value: number }[];
  total_value: number;
  notes: string | null;
  valid_until: string | null;
  status: string;
  created_at: string;
  clients?: { name: string; company: string | null; phone: string | null };
}

interface Invoice {
  id: string;
  client_id: string;
  quote_id: string | null;
  title: string;
  amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  recurrence: string;
  recurrence_day: number | null;
  recurrence_end: string | null;
  is_recurring_active: boolean;
  project_id: string | null;
  financial_type: string;
  tax_percent?: number | null;
  cnpj?: string | null;
  asaas_account?: string | null;
  clients?: { name: string; company: string | null; phone: string | null };
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  financial_type: string;
  due_date: string;
  status: string;
  recurrence: string;
  recurrence_day: number | null;
  recurrence_end: string | null;
  is_recurring_active: boolean;
  client_id: string | null;
  project_id: string | null;
  attachment_url: string | null;
  notes: string | null;
  created_at: string;
  linked_invoice_id?: string | null;
  linked_income_id?: string | null;
  clients?: { name: string; company: string | null } | null;
  projects?: { name: string } | null;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  asaas_account?: string | null;
  billing_cpf_cnpj?: string | null;
}

interface Project {
  id: string;
  name: string;
  client_id: string;
}

const quoteStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: Clock },
  sent: { label: 'Enviado', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: FileText },
  accepted: { label: 'Aceito', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  rejected: { label: 'Recusado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
  expired: { label: 'Expirado', color: 'bg-muted text-muted-foreground', icon: AlertTriangle },
};

const invoiceStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
  paid: { label: 'Pago', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  overdue: { label: 'Atrasado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
  cancelled: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

const expenseStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
  paid: { label: 'Pago', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  overdue: { label: 'Atrasado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
};

const paymentMethods: Record<string, string> = {
  pix: 'PIX', bank_transfer: 'Transferência', credit_card: 'Cartão', boleto: 'Boleto', other: 'Outro',
};

const expenseCategories = [
  'Aluguel', 'Internet', 'Software', 'Equipamentos', 'Marketing', 'Freelancers',
  'Impostos', 'Transporte', 'Alimentação', 'Material', 'Outros'
];

function clientDisplay(client?: { name: string; company: string | null } | null) {
  if (!client) return '—';
  if (client.company) return (
    <div>
      <div className="font-medium text-foreground">{client.company}</div>
      <div className="text-xs text-muted-foreground">{client.name}</div>
    </div>
  );
  return <span className="text-foreground">{client.name}</span>;
}

function clientSelectLabel(c: Client) {
  return c.company ? `${c.company} | ${c.name}` : c.name;
}

export default function Financial() {
  const [tab, setTab] = useUrlState('tab', 'invoices');
  const [quotes, setQuotes] = useCachedState<Quote[]>('fin:quotes', []);
  const [invoices, setInvoices] = useCachedState<Invoice[]>('fin:invoices', []);
  const [expenses, setExpenses] = useCachedState<Expense[]>('fin:expenses', []);
  const [clients, setClients] = useCachedState<Client[]>('fin:clients', []);
  const [projects, setProjects] = useCachedState<Project[]>('fin:projects', []);
  const [search, setSearch] = useState('');
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [cardDialog, setCardDialog] = useState<{ open: boolean; parentId?: string; parentTitle?: string }>({ open: false });
  const { toast } = useToast();
  const { user } = useAuth();

  // Quote form
  const [qClientId, setQClientId] = useState('');
  const [qTitle, setQTitle] = useState('');
  const [qServices, setQServices] = useState<{ name: string; value: number }[]>([{ name: '', value: 0 }]);
  const [qNotes, setQNotes] = useState('');
  const [qValidUntil, setQValidUntil] = useState('');
  const [qStatus, setQStatus] = useState('draft');

  // Invoice form
  const [iClientId, setIClientId] = useState('');
  const [iQuoteId, setIQuoteId] = useState('');
  const [iTitle, setITitle] = useState('');
  const [iAmount, setIAmount] = useState(0);
  const [iDueDate, setIDueDate] = useState('');
  const [iStatus, setIStatus] = useState('pending');
  const [iPaymentMethod, setIPaymentMethod] = useState('');
  const [iNotes, setINotes] = useState('');
  const [iRecurrence, setIRecurrence] = useState('one_time');
  const [iRecurrenceDay, setIRecurrenceDay] = useState('');
  const [iRecurrenceEnd, setIRecurrenceEnd] = useState('');
  const [iProjectId, setIProjectId] = useState('');
  const [iTaxPercent, setITaxPercent] = useState('');
  const [iCnpj, setICnpj] = useState('');
  const [iAsaasAccount, setIAsaasAccount] = useState('');
  const [iCosts, setICosts] = useState<InvoiceCost[]>([]);
  const [allCosts, setAllCosts] = useState<(InvoiceCost & { invoice_id: string })[]>([]);

  // Expense form
  const [eDescription, setEDescription] = useState('');
  const [eAmount, setEAmount] = useState(0);
  const [eCategory, setECategory] = useState('');
  const [eDueDate, setEDueDate] = useState('');
  const [eStatus, setEStatus] = useState('pending');
  const [eRecurrence, setERecurrence] = useState('one_time');
  const [eRecurrenceDay, setERecurrenceDay] = useState('');
  const [eRecurrenceEnd, setERecurrenceEnd] = useState('');
  const [eClientId, setEClientId] = useState('');
  const [eProjectId, setEProjectId] = useState('');
  const [eNotes, setENotes] = useState('');
  const [eAttachment, setEAttachment] = useState<File | null>(null);
  const [eLinkedInvoiceId, setELinkedInvoiceId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [accounts, setAccounts] = useState<Record<string, string | null>>({});

  useEffect(() => { loadData(); loadAccounts(); }, []);

  async function loadAccounts() {
    const { data } = await supabase.from('agency_settings')
      .select('asaas_account_1_label, asaas_account_1_cnpj, asaas_account_2_label, asaas_account_2_cnpj')
      .limit(1).maybeSingle();
    setAccounts((data as any) ?? {});
  }

  function accountLabel(n: string) {
    const label = accounts[`asaas_account_${n}_label`] || `Conta ${n}`;
    const cnpj = accounts[`asaas_account_${n}_cnpj`];
    return cnpj ? `${label} — ${cnpj}` : label;
  }

  async function loadData() {
    const [q, i, c, p, ex] = await Promise.all([
      supabase.from('quotes').select('*, clients(name, company, phone)').order('created_at', { ascending: false }),
      supabase.from('invoices').select('*, clients(name, company, phone)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, company, phone, asaas_account, billing_cpf_cnpj').eq('status', 'active').order('name'),
      supabase.from('projects').select('id, name, client_id').order('name'),
      supabase.from('expenses').select('*, clients(name, company), projects(name)').eq('financial_type', 'pj').order('created_at', { ascending: false }),
    ]);
    const { data: costsData } = await supabase.from('invoice_costs').select('id, invoice_id, description, kind, mode, value');
    setAllCosts(((costsData as any[]) ?? []) as any);
    setQuotes((q.data as any) ?? []);
    const invoiceData = (i.data as any) ?? [];
    // Auto-update overdue invoices
    const today = new Date().toISOString().split('T')[0];
    const toUpdate = invoiceData.filter((inv: any) => inv.status === 'pending' && inv.due_date < today);
    if (toUpdate.length > 0) {
      await Promise.all(toUpdate.map((inv: any) =>
        supabase.from('invoices').update({ status: 'overdue' as any }).eq('id', inv.id)
      ));
      toUpdate.forEach((inv: any) => { inv.status = 'overdue'; });
    }
    setInvoices(invoiceData);
    setClients(c.data ?? []);
    setProjects(p.data ?? []);
    // Auto-update overdue expenses
    const expData = (ex.data as any) ?? [];
    const expToUpdate = expData.filter((e: any) => e.status === 'pending' && e.due_date < today);
    if (expToUpdate.length > 0) {
      await Promise.all(expToUpdate.map((e: any) =>
        supabase.from('expenses').update({ status: 'overdue' as any }).eq('id', e.id)
      ));
      expToUpdate.forEach((e: any) => { e.status = 'overdue'; });
    }
    setExpenses(expData);
  }

  // ---- QUOTE CRUD ----
  function openNewQuote() {
    setEditingQuote(null);
    setQClientId(''); setQTitle(''); setQServices([{ name: '', value: 0 }]);
    setQNotes(''); setQValidUntil(''); setQStatus('draft');
    setShowQuoteDialog(true);
  }

  function openEditQuote(q: Quote) {
    setEditingQuote(q);
    setQClientId(q.client_id); setQTitle(q.title);
    setQServices(q.services?.length ? q.services : [{ name: '', value: 0 }]);
    setQNotes(q.notes ?? ''); setQValidUntil(q.valid_until ?? ''); setQStatus(q.status);
    setShowQuoteDialog(true);
  }

  async function saveQuote() {
    const services = qServices.filter(s => s.name.trim());
    const total = services.reduce((acc, s) => acc + Number(s.value), 0);
    const payload = {
      client_id: qClientId, title: qTitle, services: services as any, total_value: total,
      notes: qNotes || null, valid_until: qValidUntil || null, status: qStatus as any,
      created_by: user?.id,
    };

    if (editingQuote) {
      const { error } = await supabase.from('quotes').update(payload).eq('id', editingQuote.id);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Orçamento atualizado!' });
    } else {
      const { error } = await supabase.from('quotes').insert(payload);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Orçamento criado!' });
    }
    setShowQuoteDialog(false);
    loadData();
  }

  async function deleteQuote(id: string) {
    await supabase.from('quotes').delete().eq('id', id);
    toast({ title: 'Orçamento excluído' });
    loadData();
  }

  // ---- INVOICE CRUD ----
  function openNewInvoice() {
    setEditingInvoice(null);
    setIClientId(''); setIQuoteId(''); setITitle('');
    setIAmount(0); setIDueDate(''); setIStatus('pending');
    setIPaymentMethod(''); setINotes('');
    setIRecurrence('one_time'); setIRecurrenceDay(''); setIRecurrenceEnd(''); setIProjectId('');
    setITaxPercent(''); setICnpj(''); setIAsaasAccount(''); setICosts([]);
    setShowInvoiceDialog(true);
  }

  /** Herda conta/CNPJ do cliente ao selecionar (somente em nova fatura ou campo vazio). */
  function onInvoiceClientChange(clientId: string) {
    setIClientId(clientId);
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const acc = String((c as any).asaas_account ?? '1') === '2' ? '2' : '1';
    if (!editingInvoice || !iAsaasAccount) setIAsaasAccount(acc);
    const inherited = (c as any).billing_cpf_cnpj || accounts[`asaas_account_${acc}_cnpj`] || '';
    if (!editingInvoice || !iCnpj) setICnpj(inherited);
  }

  function openEditInvoice(inv: Invoice) {
    setEditingInvoice(inv);
    setIClientId(inv.client_id); setIQuoteId(inv.quote_id ?? ''); setITitle(inv.title);
    setIAmount(inv.amount); setIDueDate(inv.due_date); setIStatus(inv.status);
    setIPaymentMethod(inv.payment_method ?? ''); setINotes(inv.notes ?? '');
    setIRecurrence(inv.recurrence ?? 'one_time');
    setIRecurrenceDay(inv.recurrence_day?.toString() ?? '');
    setIRecurrenceEnd(inv.recurrence_end ?? '');
    setIProjectId(inv.project_id ?? '');
    setITaxPercent(inv.tax_percent != null ? String(inv.tax_percent) : '');
    const client = clients.find(c => c.id === inv.client_id);
    const acc = inv.asaas_account ?? (String((client as any)?.asaas_account ?? '1') === '2' ? '2' : '1');
    setIAsaasAccount(acc);
    setICnpj(inv.cnpj ?? (client as any)?.billing_cpf_cnpj ?? accounts[`asaas_account_${acc}_cnpj`] ?? '');
    setICosts([]);
    loadInvoiceCosts(inv.id).then(setICosts);
    setShowInvoiceDialog(true);
  }

  async function saveInvoice() {
    const payload: any = {
      client_id: iClientId, quote_id: iQuoteId || null, title: iTitle,
      amount: iAmount, due_date: iDueDate, status: iStatus as any,
      payment_method: (iPaymentMethod || null) as any, notes: iNotes || null,
      paid_at: iStatus === 'paid' ? new Date().toISOString() : null,
      created_by: user?.id,
      recurrence: iRecurrence as any,
      recurrence_day: iRecurrenceDay ? parseInt(iRecurrenceDay) : null,
      recurrence_end: iRecurrenceEnd || null,
      project_id: iProjectId || null,
      financial_type: 'pj' as any,
      tax_percent: iTaxPercent ? Number(String(iTaxPercent).replace(',', '.')) : 0,
      cnpj: iCnpj || null,
      asaas_account: iAsaasAccount || null,
    };

    if (editingInvoice) {
      const { error } = await supabase.from('invoices').update(payload).eq('id', editingInvoice.id);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      await saveInvoiceCosts(editingInvoice.id, iCosts, user?.id);
      toast({ title: 'Fatura atualizada!' });
    } else {
      const { data: created, error } = await supabase.from('invoices').insert(payload).select('id').single();
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      if (created?.id) await saveInvoiceCosts(created.id, iCosts, user?.id);
      toast({ title: 'Fatura criada!' });
    }
    setShowInvoiceDialog(false);
    loadData();
  }

  async function deleteInvoice(id: string) {
    await supabase.from('invoices').delete().eq('id', id);
    toast({ title: 'Fatura excluída' });
    loadData();
  }

  async function markInvoicePaid(inv: Invoice) {
    await supabase.from('invoices').update({
      status: 'paid' as any, paid_at: new Date().toISOString(), payment_method: 'pix' as any
    }).eq('id', inv.id);
    toast({ title: 'Fatura marcada como paga!' });
    loadData();
  }

  function sendWhatsApp(inv: Invoice) {
    const client = clients.find(c => c.id === inv.client_id);
    if (!client?.phone) {
      toast({ title: 'Cliente sem telefone cadastrado', variant: 'destructive' });
      return;
    }
    const phone = client.phone.replace(/\D/g, '');
    const empresa = client.company || client.name;
    const valor = fmt(Number(inv.amount));
    const venc = new Date(inv.due_date).toLocaleDateString('pt-BR');
    const msg = `Olá! Segue cobrança da *${empresa}*:\n\n📄 ${inv.title}\n💰 Valor: *${valor}*\n📅 Vencimento: *${venc}*\n\nQualquer dúvida, estamos à disposição!`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function createInvoiceFromQuote(q: Quote) {
    setEditingInvoice(null);
    setIClientId(q.client_id); setIQuoteId(q.id); setITitle(`Fatura - ${q.title}`);
    setIAmount(q.total_value); setIDueDate(''); setIStatus('pending');
    setIPaymentMethod(''); setINotes('');
    setIRecurrence('one_time'); setIRecurrenceDay(''); setIRecurrenceEnd(''); setIProjectId('');
    setShowInvoiceDialog(true);
  }

  // ---- EXPENSE CRUD ----
  function openNewExpense() {
    setEditingExpense(null);
    setEDescription(''); setEAmount(0); setECategory(''); setEDueDate('');
    setEStatus('pending'); setERecurrence('one_time'); setERecurrenceDay('');
    setERecurrenceEnd(''); setEClientId(''); setEProjectId(''); setENotes(''); setEAttachment(null);
    setELinkedInvoiceId('');
    setShowExpenseDialog(true);
  }

  function openEditExpense(e: Expense) {
    setEditingExpense(e);
    setEDescription(e.description); setEAmount(e.amount); setECategory(e.category ?? '');
    setEDueDate(e.due_date); setEStatus(e.status); setERecurrence(e.recurrence);
    setERecurrenceDay(e.recurrence_day?.toString() ?? ''); setERecurrenceEnd(e.recurrence_end ?? '');
    setEClientId(e.client_id ?? ''); setEProjectId(e.project_id ?? ''); setENotes(e.notes ?? '');
    setEAttachment(null);
    setELinkedInvoiceId(e.linked_invoice_id ?? '');
    setShowExpenseDialog(true);
  }

  async function saveExpense() {
    let attachmentUrl = editingExpense?.attachment_url ?? null;
    if (eAttachment) {
      setUploading(true);
      const ext = eAttachment.name.split('.').pop();
      const path = `expenses/${user?.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('content-files').upload(path, eAttachment);
      if (upErr) { toast({ title: 'Erro no upload', variant: 'destructive' }); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from('content-files').getPublicUrl(path);
      attachmentUrl = urlData.publicUrl;
      setUploading(false);
    }

    const payload: any = {
      description: eDescription, amount: eAmount, category: eCategory || null,
      financial_type: 'pj' as any, due_date: eDueDate, status: eStatus as any,
      recurrence: eRecurrence as any, recurrence_day: eRecurrenceDay ? parseInt(eRecurrenceDay) : null,
      recurrence_end: eRecurrenceEnd || null, client_id: eClientId || null,
      project_id: eProjectId || null, notes: eNotes || null,
      attachment_url: attachmentUrl, created_by: user?.id,
      linked_invoice_id: eLinkedInvoiceId || null,
    };

    if (editingExpense) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editingExpense.id);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Despesa atualizada!' });
    } else {
      const { error } = await supabase.from('expenses').insert(payload);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Despesa criada!' });
    }
    setShowExpenseDialog(false);
    loadData();
  }

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id);
    toast({ title: 'Despesa excluída' });
    loadData();
  }

  async function markExpensePaid(e: Expense) {
    await supabase.from('expenses').update({ status: 'paid' as any }).eq('id', e.id);
    toast({ title: 'Despesa marcada como paga!' });
    loadData();
  }

  // --- Monthly competence state ---
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [showFuture, setShowFuture] = useState(false);
  const monthsToShow = showFuture ? 4 : 1;

  const pjInvoices = useMemo(
    () => invoices.filter(i => (i.financial_type ?? 'pj') === 'pj'),
    [invoices]
  );

  const monthInvoiceOccs = useMemo(
    () => expandOccurrencesForMonth(pjInvoices as any[], selectedMonth),
    [pjInvoices, selectedMonth]
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
  const invoiceOccs = useMemo(
    () => expandOccurrencesForMonths(pjInvoices as any[], selectedMonth, monthsToShow),
    [pjInvoices, selectedMonth, monthsToShow]
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

  /** Despesas vinculadas a cada receita (fatura PJ). */
  // Despesas geradas a partir dos custos da fatura já entram em costsByInvoice
  const linkedByInvoice = useMemo(
    () => sumLinkedExpenses((expenses as any[]).filter(e => !e.invoice_cost_id), 'linked_invoice_id'),
    [expenses]
  );

  /** Custos lançados dentro de cada fatura, em reais. */
  const costsByInvoice = useMemo(() => {
    const amounts = new Map<string, number>(invoices.map(i => [i.id, Number(i.amount) || 0]));
    return sumCostsByInvoice(allCosts, amounts);
  }, [allCosts, invoices]);

  const deductionsByInvoice = (id: string) =>
    (linkedByInvoice.get(id) ?? 0) + (costsByInvoice.get(id) ?? 0);

  const monthStats = useMemo(() => {
    let recebido = 0, pendente = 0, atrasado = 0, despPagas = 0, despPrev = 0, impostos = 0, custosFatura = 0;
    for (const o of monthInvoiceOccs) {
      const st = resolveStatus(o);
      const v = Number(o.item.amount) || 0;
      impostos += taxAmount(v, o.item.tax_percent);
      custosFatura += costsByInvoice.get(o.item.id) ?? 0;
      if (st === 'paid') recebido += v;
      else if (st === 'overdue') atrasado += v;
      else if (st !== 'cancelled') pendente += v;
    }
    for (const o of monthExpenseOccs) {
      const st = resolveStatus(o);
      const v = Number(o.item.amount) || 0;
      if (st === 'paid') despPagas += v;
      else despPrev += v;
    }
    const receitaPrevista = recebido + pendente + atrasado;
    const despesaPrevista = despPagas + despPrev;
    const lucroPrevisto = receitaPrevista - despesaPrevista;
    // Custos das faturas já estão nas despesas (cada custo vira uma despesa a pagar)
    const lucroLiquido = lucroPrevisto - impostos;
    return {
      recebido, pendente, atrasado, despPagas, despPrev, custosFatura,
      receitaPrevista, despesaPrevista, lucroPrevisto, impostos, lucroLiquido,
    };
  }, [monthInvoiceOccs, monthExpenseOccs, costsByInvoice]);

  const totalQuotes = quotes
    .filter(q => q.status === 'sent' || q.status === 'draft')
    .reduce((a, q) => a + Number(q.total_value), 0);

  async function materializeInvoicePaid(occ: Occurrence<any>) {
    const it = occ.item;
    const { error } = await supabase.from('invoices').insert({
      client_id: it.client_id, quote_id: null, title: it.title, amount: it.amount,
      due_date: occ.occurrence_date, status: 'paid' as any,
      paid_at: new Date().toISOString(), payment_method: 'pix' as any, notes: it.notes,
      recurrence: 'one_time' as any, parent_invoice_id: it.id,
      project_id: it.project_id ?? null,
      financial_type: (it.financial_type ?? 'pj') as any, created_by: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Cobrança recorrente marcada como paga!' }); loadData();
  }
  async function materializeExpensePaid(occ: Occurrence<any>) {
    const it = occ.item;
    const { error } = await supabase.from('expenses').insert({
      description: it.description, amount: it.amount, category: it.category,
      financial_type: it.financial_type, due_date: occ.occurrence_date,
      status: 'paid' as any, recurrence: 'one_time' as any,
      parent_expense_id: it.id, client_id: it.client_id, project_id: it.project_id,
      notes: it.notes, created_by: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Despesa recorrente marcada como paga!' }); loadData();
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Financeiro PJ</h1>
            <p className="text-muted-foreground">Faturas, custos, despesas e cobranças</p>
          </div>
        </div>

        {/* Month navigator */}
        <MonthNavigator
          value={selectedMonth}
          onChange={setSelectedMonth}
          showFuture={showFuture}
          onShowFutureChange={setShowFuture}
        />

        {/* Stats — selected month only */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recebido</CardTitle>
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">{fmt(monthStats.recebido)}</div>
              <p className="text-xs text-muted-foreground mt-1">Em {monthLabel(selectedMonth)}</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendente</CardTitle>
              <Clock className="h-5 w-5 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{fmt(monthStats.pendente + monthStats.atrasado)}</div>
              {monthStats.atrasado > 0 && (
                <p className="text-xs text-destructive mt-1">{fmt(monthStats.atrasado)} em atraso</p>
              )}
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
              <TrendingDown className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{fmt(monthStats.despesaPrevista)}</div>
              <p className="text-xs text-muted-foreground mt-1">{fmt(monthStats.despPagas)} pagas</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lucro previsto</CardTitle>
              <DollarSign className={`h-5 w-5 ${monthStats.lucroPrevisto >= 0 ? 'text-emerald-400' : 'text-destructive'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthStats.lucroPrevisto >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                {fmt(monthStats.lucroPrevisto)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Receita - despesa do mês</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lucro líquido</CardTitle>
              <DollarSign className={`h-5 w-5 ${monthStats.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-destructive'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthStats.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                {fmt(monthStats.lucroLiquido)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Já com {fmt(monthStats.impostos)} de imposto e {fmt(monthStats.custosFatura)} de custos das faturas
              </p>
            </CardContent>
          </Card>
        </div>


        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
            <TabsList className="w-full sm:w-auto overflow-x-auto">
              <TabsTrigger value="invoices">Receitas</TabsTrigger>
              <TabsTrigger value="expenses">Despesas</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-9 w-full bg-card border-border" />
              </div>
            </div>
          </div>

          {/* INVOICES TAB */}
          <TabsContent value="invoices" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openNewInvoice}><Plus className="mr-2 h-4 w-4" /> Nova Receita</Button>
            </div>
            {(() => {
              const filtered = invoiceOccs.filter(o => {
                if (!search) return true;
                const s = search.toLowerCase();
                return o.item.title?.toLowerCase().includes(s)
                  || o.item.clients?.name?.toLowerCase().includes(s)
                  || o.item.clients?.company?.toLowerCase().includes(s);
              });
              const groups = new Map<string, typeof filtered>();
              for (const o of filtered) {
                const arr = groups.get(o.competence) ?? [];
                arr.push(o); groups.set(o.competence, arr);
              }
              const keys = Array.from(groups.keys()).sort();
              if (keys.length === 0) {
                return (
                  <Card className="card-premium p-10 text-center text-muted-foreground">
                    Nenhuma receita em {monthLabel(selectedMonth)}.
                  </Card>
                );
              }
              return keys.map(k => (
                <Card key={k} className="card-premium overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                    <h3 className="font-semibold text-foreground">{monthLabel(parseISO(k + '-01'))}</h3>
                    <span className="text-xs text-muted-foreground">{groups.get(k)!.length} lançamento(s)</span>
                  </div>
                  <div className="table-scroll"><Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Imposto</TableHead>
                        <TableHead>Líquido</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead className="w-36">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.get(k)!.map((occ, idx) => {
                        const inv = occ.item;
                        const st = invoiceStatusConfig[resolveStatus(occ)] ?? invoiceStatusConfig.pending;
                        const StIcon = st.icon;
                        return (
                          <TableRow key={`${inv.id}-${occ.occurrence_date}-${idx}`}>
                            <TableCell className="font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                <InlineEdit table="invoices" id={inv.id} field="title" value={inv.title} disabled={occ.virtual} onSaved={loadData} />
                                {occ.virtual && (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                                    <Sparkles className="mr-1 h-2.5 w-2.5" />Previsto
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{clientDisplay(inv.clients)}</TableCell>
                            <TableCell className="font-medium text-foreground">
                              <InlineEdit table="invoices" id={inv.id} field="amount" value={inv.amount} type="number" disabled={occ.virtual} format={(v) => fmt(Number(v))} onSaved={loadData} />
                            </TableCell>
                            <TableCell className="text-destructive text-xs whitespace-nowrap">
                              <InlineEdit table="invoices" id={inv.id} field="tax_percent" value={inv.tax_percent ?? 0} type="number"
                                disabled={occ.virtual}
                                display={`${Number(inv.tax_percent ?? 0).toLocaleString('pt-BR')}% • ${fmt(taxAmount(inv.amount, inv.tax_percent))}`}
                                onSaved={loadData} />
                            </TableCell>
                            <TableCell className="font-medium text-emerald-400 whitespace-nowrap">
                              {fmt(netRevenue(inv.amount, inv.tax_percent, deductionsByInvoice(inv.id)))}
                              {(costsByInvoice.get(inv.id) ?? 0) > 0 && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  −{fmt(costsByInvoice.get(inv.id) ?? 0)} em custos da fatura
                                </div>
                              )}
                              {(linkedByInvoice.get(inv.id) ?? 0) > 0 && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  −{fmt(linkedByInvoice.get(inv.id) ?? 0)} em despesas
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <InlineEdit table="invoices" id={inv.id} field="due_date" value={inv.due_date} type="date" disabled={occ.virtual} format={(v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'} display={new Date(occ.occurrence_date).toLocaleDateString('pt-BR')} onSaved={loadData} />
                            </TableCell>
                            <TableCell>
                              {inv.recurrence === 'recurring' ? (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                  <RefreshCw className="mr-1 h-3 w-3" />Recorrente
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">Única</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={st.color}>
                                <StIcon className="mr-1 h-3 w-3" />{st.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {!occ.virtual && inv.payment_method ? paymentMethods[inv.payment_method] ?? inv.payment_method : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {resolveStatus(occ) !== 'paid' && resolveStatus(occ) !== 'cancelled' && (
                                  <>
                                    <Button variant="ghost" size="icon" title="Marcar como pago"
                                      onClick={() => occ.virtual ? materializeInvoicePaid(occ) : markInvoicePaid(inv)}>
                                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    </Button>
                                    <Button variant="ghost" size="icon" title="Enviar WhatsApp"
                                      onClick={() => sendWhatsApp(inv)}>
                                      <MessageCircle className="h-4 w-4 text-green-500" />
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => openEditInvoice(inv)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!occ.virtual && (
                                  <Button variant="ghost" size="icon" onClick={() => deleteInvoice(inv.id)}>
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
              ));
            })()}
          </TabsContent>

          {/* EXPENSES TAB */}
          <TabsContent value="expenses" className="space-y-4">
            <div className="flex justify-end gap-2">
              <CreditCardImport onImported={loadData} />
              <Button onClick={openNewExpense}><Plus className="mr-2 h-4 w-4" /> Nova Despesa</Button>
            </div>
            {(() => {
              const filtered = expenseOccs.filter(o => {
                if (!search) return true;
                const s = search.toLowerCase();
                return o.item.description?.toLowerCase().includes(s)
                  || o.item.category?.toLowerCase().includes(s);
              });
              const groups = new Map<string, typeof filtered>();
              for (const o of filtered) {
                const arr = groups.get(o.competence) ?? [];
                arr.push(o); groups.set(o.competence, arr);
              }
              const keys = Array.from(groups.keys()).sort();
              if (keys.length === 0) {
                return (
                  <Card className="card-premium p-10 text-center text-muted-foreground">
                    Nenhuma despesa em {monthLabel(selectedMonth)}.
                  </Card>
                );
              }
              return keys.map(k => (
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
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cliente/Projeto</TableHead>
                        <TableHead className="w-28">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.get(k)!.map((occ, idx) => {
                        const exp = occ.item;
                        const st = expenseStatusConfig[resolveStatus(occ)] ?? expenseStatusConfig.pending;
                        const StIcon = st.icon;
                        return (
                          <TableRow key={`${exp.id}-${occ.occurrence_date}-${idx}`}>
                            <TableCell className="font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                <InlineEdit table="expenses" id={exp.id} field="description" value={exp.description} disabled={occ.virtual} onSaved={loadData} />
                                {occ.virtual && (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                                    <Sparkles className="mr-1 h-2.5 w-2.5" />Previsto
                                  </Badge>
                                )}
                                {exp.attachment_url && (
                                  <a href={exp.attachment_url} target="_blank" rel="noopener noreferrer">
                                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                                  </a>
                                )}
                                {exp.linked_invoice_id && (
                                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                                    {(pjInvoices as any[]).find(i => i.id === exp.linked_invoice_id)?.title ?? 'Vinculada'}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell><InlineCategorySelect table="expenses" id={exp.id} value={exp.category} disabled={occ.virtual} onSaved={loadData} /></TableCell>
                            <TableCell className="font-medium text-destructive">
                              <InlineEdit table="expenses" id={exp.id} field="amount" value={exp.amount} type="number" disabled={occ.virtual} format={(v) => fmt(Number(v))} onSaved={loadData} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <InlineEdit table="expenses" id={exp.id} field="due_date" value={exp.due_date} type="date" disabled={occ.virtual} format={(v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'} display={new Date(occ.occurrence_date).toLocaleDateString('pt-BR')} onSaved={loadData} />
                            </TableCell>
                            <TableCell>
                              {exp.recurrence === 'recurring' ? (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                  <RefreshCw className="mr-1 h-3 w-3" />Recorrente
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">Única</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={st.color}>
                                <StIcon className="mr-1 h-3 w-3" />{st.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {exp.clients?.company || exp.clients?.name || '—'}
                              {exp.projects?.name && <div>{exp.projects.name}</div>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {cardParentIds.has(exp.id) && (
                                  <Button variant="ghost" size="icon" title="Ver itens da fatura"
                                    onClick={() => setCardDialog({ open: true, parentId: exp.id, parentTitle: exp.description })}>
                                    <Eye className="h-4 w-4 text-primary" />
                                  </Button>
                                )}
                                {resolveStatus(occ) !== 'paid' && (
                                  <Button variant="ghost" size="icon" title="Marcar como pago"
                                    onClick={() => occ.virtual ? materializeExpensePaid(occ) : markExpensePaid(exp)}>
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => openEditExpense(exp)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!occ.virtual && (
                                  <Button variant="ghost" size="icon" onClick={() => deleteExpense(exp.id)}>
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
              ));
            })()}
          </TabsContent>

        </Tabs>
      </div>

      {/* INVOICE DIALOG */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Editar Fatura' : 'Nova Fatura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <ClientCombobox
                value={iClientId}
                onChange={setIClientId}
                clients={clients}
                onClientCreated={() => loadData()}
              />

            </div>
            <div>
              <Label>Título</Label>
              <Input value={iTitle} onChange={e => setITitle(e.target.value)} placeholder="Ex: Fatura Abril 2026" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" value={iAmount || ''} onChange={e => setIAmount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={iDueDate} onChange={e => setIDueDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={iRecurrence} onValueChange={setIRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">Única</SelectItem>
                    <SelectItem value="recurring">Recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projeto</Label>
                <Select value={iProjectId || '__none__'} onValueChange={(v) => setIProjectId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {projects.filter(p => !iClientId || p.client_id === iClientId).map(p =>
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {iRecurrence === 'recurring' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dia de cobrança</Label>
                  <Input type="number" min="1" max="31" value={iRecurrenceDay}
                    onChange={e => setIRecurrenceDay(e.target.value)} placeholder="Ex: 10" />
                </div>
                <div>
                  <Label>Data final (opcional)</Label>
                  <Input type="date" value={iRecurrenceEnd} onChange={e => setIRecurrenceEnd(e.target.value)} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={iStatus} onValueChange={setIStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Atrasado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método de Pagamento</Label>
                <Select value={iPaymentMethod} onValueChange={setIPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="bank_transfer">Transferência</SelectItem>
                    <SelectItem value="credit_card">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Imposto (%)</Label>
                <Input type="number" step="0.01" min="0" value={iTaxPercent}
                  onChange={e => setITaxPercent(e.target.value)} placeholder="Ex: 6" />
              </div>
              <div>
                <Label>Conta de faturamento</Label>
                <Select value={iAsaasAccount || '1'} onValueChange={(v) => {
                  setIAsaasAccount(v);
                  setICnpj((accounts as any)[`asaas_account_${v}_cnpj`] ?? iCnpj);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{accountLabel('1')}</SelectItem>
                    <SelectItem value="2">{accountLabel('2')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>CNPJ / CPF da nota</Label>
              <Input value={iCnpj} onChange={e => setICnpj(e.target.value)} placeholder="CNPJ usado nesta fatura" />
            </div>
            <InvoiceCostsEditor gross={iAmount} costs={iCosts} onChange={setICosts} />
            {iAmount > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto</span>
                  <span className="text-foreground">{fmt(iAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Imposto</span>
                  <span className="text-destructive">−{fmt(taxAmount(iAmount, iTaxPercent))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Custos do trabalho</span>
                  <span className="text-destructive">−{fmt(totalCosts(iCosts, iAmount))}</span></div>
                <div className="flex justify-between font-semibold text-sm pt-1 border-t border-border/60">
                  <span>Sobra limpo</span>
                  <span className="text-emerald-400">{fmt(netRevenue(iAmount, iTaxPercent, totalCosts(iCosts, iAmount)))}</span></div>
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea value={iNotes} onChange={e => setINotes(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={saveInvoice} disabled={!iClientId || !iTitle || !iDueDate}>
              {editingInvoice ? 'Salvar Alterações' : 'Criar Fatura'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* EXPENSE DIALOG */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descrição</Label>
              <Input value={eDescription} onChange={e => setEDescription(e.target.value)} placeholder="Ex: Aluguel escritório" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" value={eAmount || ''} onChange={e => setEAmount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={eCategory} onValueChange={setECategory}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={eDueDate} onChange={e => setEDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={eRecurrence} onValueChange={setERecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">Única</SelectItem>
                    <SelectItem value="recurring">Recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {eRecurrence === 'recurring' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dia de vencimento</Label>
                  <Input type="number" min="1" max="31" value={eRecurrenceDay}
                    onChange={e => setERecurrenceDay(e.target.value)} placeholder="Ex: 5" />
                </div>
                <div>
                  <Label>Data final (opcional)</Label>
                  <Input type="date" value={eRecurrenceEnd} onChange={e => setERecurrenceEnd(e.target.value)} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cliente (opcional)</Label>
                <ClientCombobox
                  value={eClientId}
                  onChange={setEClientId}
                  clients={clients}
                  onClientCreated={() => loadData()}
                  allowNone
                  noneLabel="Nenhum"
                />

              </div>
              <div>
                <Label>Projeto (opcional)</Label>
                <Select value={eProjectId || '__none__'} onValueChange={(v) => setEProjectId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Vincular à receita (opcional)</Label>
              <Select value={eLinkedInvoiceId || '__none__'} onValueChange={(v) => setELinkedInvoiceId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {(pjInvoices as any[])
                    .filter(inv => !inv.parent_invoice_id && (!eClientId || inv.client_id === eClientId))
                    .map(inv => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.title} — {fmt(Number(inv.amount))} ({new Date(inv.due_date).toLocaleDateString('pt-BR')})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Despesas vinculadas são descontadas do líquido daquela receita.
              </p>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={eStatus} onValueChange={setEStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comprovante (opcional)</Label>
              <Input type="file" onChange={e => setEAttachment(e.target.files?.[0] ?? null)}
                accept="image/*,.pdf" />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={eNotes} onChange={e => setENotes(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={saveExpense} disabled={!eDescription || !eDueDate || uploading}>
              {uploading ? 'Enviando...' : editingExpense ? 'Salvar Alterações' : 'Criar Despesa'}
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
