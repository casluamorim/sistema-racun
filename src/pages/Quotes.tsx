import { useCachedState, hasPageCache } from '@/hooks/useCachedState';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { InlineEdit } from '@/components/InlineEdit';
import { ClientCombobox, ComboClient } from '@/components/clients/ClientCombobox';
import { useUrlState } from '@/hooks/usePersistedState';
import { createProjectFromQuote, createInvoicesFromPlan, createReceivableForProject, type CreatedProject } from '@/lib/quoteAutomation';
import { buildInstallments, paymentPlanLabels, defaultInstallments, planSummary, type PaymentPlan } from '@/lib/paymentPlans';
import { PaymentScheduleDialog } from '@/components/finance/ProjectPaymentDialogs';
import {
  Plus, FileText, Receipt, Trash2, Edit, AlertTriangle, CheckCircle, Clock, XCircle, Search, ThumbsUp,
} from 'lucide-react';

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
  payment_plan?: string | null;
  installments?: number | null;
  first_due_date?: string | null;
  clients?: { name: string; company: string | null; phone: string | null };
}

const quoteStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: Clock },
  sent: { label: 'Enviado', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: FileText },
  accepted: { label: 'Aceito', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  rejected: { label: 'Recusado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
  expired: { label: 'Expirado', color: 'bg-muted text-muted-foreground', icon: AlertTriangle },
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

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

export default function Quotes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [quotes, setQuotes] = useCachedState<Quote[]>('quotes:list', []);
  const [clients, setClients] = useCachedState<ComboClient[]>('quotes:clients', []);
  const [search, setSearch] = useUrlState('q', '');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);

  const [qClientId, setQClientId] = useState('');
  const [qTitle, setQTitle] = useState('');
  const [qServices, setQServices] = useState<{ name: string; value: number }[]>([{ name: '', value: 0 }]);
  const [qNotes, setQNotes] = useState('');
  const [qValidUntil, setQValidUntil] = useState('');
  const [qStatus, setQStatus] = useState('draft');
  const [qPlan, setQPlan] = useState<PaymentPlan>('total');
  const [qInstallments, setQInstallments] = useState('1');

  // Gerar fatura
  const [invoiceFor, setInvoiceFor] = useState<Quote | null>(null);
  const [invDueDate, setInvDueDate] = useState('');
  const [invPlan, setInvPlan] = useState<PaymentPlan>('total');
  const [invInstallments, setInvInstallments] = useState('1');

  // Automação: proposta aceita → projeto + decisão de pagamento
  const [pendingProject, setPendingProject] = useState<CreatedProject | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [q, c] = await Promise.all([
      supabase.from('quotes').select('*, clients(name, company, phone)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, company, phone, email').order('name'),
    ]);
    setQuotes((q.data as any) ?? []);
    setClients((c.data as ComboClient[]) ?? []);
  }

  function openNew() {
    setEditing(null);
    setQClientId(''); setQTitle(''); setQServices([{ name: '', value: 0 }]);
    setQNotes(''); setQValidUntil(''); setQStatus('draft');
    setQPlan('total'); setQInstallments('1');
    setShowDialog(true);
  }

  function openEdit(q: Quote) {
    setEditing(q);
    setQClientId(q.client_id); setQTitle(q.title);
    setQServices(Array.isArray(q.services) && q.services.length ? q.services : [{ name: '', value: 0 }]);
    setQNotes(q.notes ?? ''); setQValidUntil(q.valid_until ?? ''); setQStatus(q.status);
    const plan = (q.payment_plan as PaymentPlan) ?? 'total';
    setQPlan(plan);
    setQInstallments(String(q.installments ?? defaultInstallments(plan)));
    setShowDialog(true);
  }

  async function save() {
    const services = qServices.filter(s => s.name.trim());
    const total = services.reduce((a, s) => a + Number(s.value || 0), 0);
    const payload: any = {
      client_id: qClientId, title: qTitle, services: services as any, total_value: total,
      notes: qNotes || null, valid_until: qValidUntil || null, status: qStatus as any,
      payment_plan: qPlan,
      installments: qPlan === 'total' ? 1 : qPlan === '50_50' ? 2 : Math.max(1, Number(qInstallments) || defaultInstallments(qPlan)),
      created_by: user?.id,
    };
    const { data: saved, error } = editing
      ? await supabase.from('quotes').update(payload).eq('id', editing.id).select('*').single()
      : await supabase.from('quotes').insert(payload).select('*').single();
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Proposta atualizada!' : 'Proposta criada!' });
    setShowDialog(false);
    const becameAccepted = qStatus === 'accepted' && (!editing || editing.status !== 'accepted');
    await loadData();
    if (becameAccepted && saved) await runAcceptance(saved as any);
  }

  /** Proposta aceita → cria projeto + tarefa e pergunta quando o pagamento entra. */
  async function runAcceptance(q: Quote) {
    const { project, error, alreadyExists } = await createProjectFromQuote(
      { id: q.id, client_id: q.client_id, title: q.title, total_value: Number(q.total_value), notes: q.notes, services: q.services },
      user?.id,
    );
    if (error || !project) {
      toast({ title: 'Erro ao criar projeto', description: error?.message, variant: 'destructive' });
      return;
    }
    if (alreadyExists) {
      toast({ title: 'Projeto já existe', description: `"${project.name}" já foi criado a partir desta proposta.` });
      return;
    }
    toast({ title: 'Projeto criado!', description: 'Também entrou em Meu Trabalho como tarefa ativa.' });
    setPendingProject(project);
  }

  async function approveQuote(q: Quote) {
    const { error } = await supabase.from('quotes').update({ status: 'accepted' as any }).eq('id', q.id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    await loadData();
    await runAcceptance(q);
  }

  async function schedulePayment(dueDate: string) {
    if (!pendingProject) return;
    const { error } = await createReceivableForProject({
      clientId: pendingProject.client_id,
      projectId: pendingProject.id,
      quoteId: pendingProject.quote_id,
      title: pendingProject.name,
      amount: Number(pendingProject.payment_amount || 0),
      dueDate,
      userId: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('projects')
      .update({ payment_trigger: 'scheduled', payment_pending: false } as any)
      .eq('id', pendingProject.id);
    toast({ title: 'Lançado em Contas a Receber (Financeiro PJ)' });
    setPendingProject(null);
  }

  async function markPaymentOnDelivery() {
    if (!pendingProject) return;
    await supabase.from('projects')
      .update({ payment_trigger: 'on_delivery', payment_pending: false } as any)
      .eq('id', pendingProject.id);
    toast({
      title: 'Pagamento após a entrega',
      description: 'Ao finalizar a tarefa em Meu Trabalho você confirma valor e data.',
    });
    setPendingProject(null);
  }

  async function remove(id: string) {
    await supabase.from('quotes').delete().eq('id', id);
    toast({ title: 'Proposta excluída' });
    loadData();
  }

  async function generateInvoice() {
    if (!invoiceFor || !invDueDate) return;
    const plan = invPlan;
    const { data: client } = await supabase.from('clients')
      .select('asaas_account, billing_cpf_cnpj').eq('id', invoiceFor.client_id).maybeSingle();
    const { error, count } = await createInvoicesFromPlan({
      clientId: invoiceFor.client_id,
      quoteId: invoiceFor.id,
      title: `Fatura - ${invoiceFor.title}`,
      amount: Number(invoiceFor.total_value),
      plan,
      firstDueDate: invDueDate,
      installments: Number(invInstallments) || null,
      cnpj: (client as any)?.billing_cpf_cnpj ?? null,
      asaasAccount: (client as any)?.asaas_account ?? null,
      userId: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: count > 1 ? `${count} faturas geradas no Financeiro PJ!` : 'Fatura gerada no Financeiro PJ!' });
    setInvoiceFor(null); setInvDueDate('');
  }

  const stats = useMemo(() => {
    const open = quotes.filter(q => ['draft', 'sent'].includes(q.status));
    const accepted = quotes.filter(q => q.status === 'accepted');
    return {
      openCount: open.length,
      openValue: open.reduce((a, q) => a + Number(q.total_value), 0),
      acceptedValue: accepted.reduce((a, q) => a + Number(q.total_value), 0),
      total: quotes.length,
    };
  }, [quotes]);

  const filtered = quotes.filter(q => {
    if (!search) return true;
    const s = search.toLowerCase();
    return q.title.toLowerCase().includes(s)
      || q.clients?.name?.toLowerCase().includes(s)
      || q.clients?.company?.toLowerCase().includes(s);
  });

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Propostas</h1>
            <p className="text-muted-foreground">{stats.total} propostas cadastradas</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card border-border" />
            </div>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Nova Proposta</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em aberto</CardTitle>
              <FileText className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{fmt(stats.openValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.openCount} proposta(s)</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aceitas</CardTitle>
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">{fmt(stats.acceptedValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Prontas para faturar</p>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total geral</CardTitle>
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {fmt(quotes.reduce((a, q) => a + Number(q.total_value), 0))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Todas as propostas</p>
            </CardContent>
          </Card>
        </div>

        <Card className="card-premium overflow-hidden">
          <div className="table-scroll"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(q => {
                const st = quoteStatusConfig[q.status] ?? quoteStatusConfig.draft;
                const StIcon = st.icon;
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium text-foreground">
                      <InlineEdit table="quotes" id={q.id} field="title" value={q.title} onSaved={loadData} />
                    </TableCell>
                    <TableCell>{clientDisplay(q.clients)}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      <InlineEdit table="quotes" id={q.id} field="total_value" value={q.total_value} type="number" format={(v) => fmt(Number(v))} onSaved={loadData} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <InlineEdit table="quotes" id={q.id} field="valid_until" value={q.valid_until} type="date" format={(v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'} onSaved={loadData} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.color}>
                        <StIcon className="mr-1 h-3 w-3" />{st.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {q.status === 'accepted' && (
                          <Button variant="ghost" size="icon" title="Gerar fatura"
                            onClick={() => {
                              setInvoiceFor(q); setInvDueDate('');
                              const plan = ((q.payment_plan as PaymentPlan) ?? 'total');
                              setInvPlan(plan);
                              setInvInstallments(String(q.installments ?? defaultInstallments(plan)));
                            }}>
                            <Receipt className="h-4 w-4 text-emerald-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(q)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(q.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma proposta cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table></div>
        </Card>
      </div>

      {/* DIALOG PROPOSTA */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Proposta' : 'Nova Proposta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <ClientCombobox
                value={qClientId}
                onChange={setQClientId}
                clients={clients}
                onClientCreated={(c) => setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
              />
            </div>
            <div>
              <Label>Título</Label>
              <Input value={qTitle} onChange={e => setQTitle(e.target.value)} placeholder="Ex: Pacote Social Media" />
            </div>
            <div>
              <Label>Serviços</Label>
              <div className="space-y-2">
                {qServices.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Serviço" value={s.name}
                      onChange={e => { const arr = [...qServices]; arr[i] = { ...arr[i], name: e.target.value }; setQServices(arr); }}
                      className="flex-1" />
                    <Input type="number" placeholder="Valor" value={s.value || ''}
                      onChange={e => { const arr = [...qServices]; arr[i] = { ...arr[i], value: Number(e.target.value) }; setQServices(arr); }}
                      className="w-32" />
                    {qServices.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setQServices(qServices.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setQServices([...qServices, { name: '', value: 0 }])}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar Serviço
                </Button>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                Total: {fmt(qServices.reduce((a, s) => a + Number(s.value || 0), 0))}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Validade</Label>
                <Input type="date" value={qValidUntil} onChange={e => setQValidUntil(e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={qStatus} onValueChange={setQStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="sent">Enviado</SelectItem>
                    <SelectItem value="accepted">Aceito</SelectItem>
                    <SelectItem value="rejected">Recusado</SelectItem>
                    <SelectItem value="expired">Expirado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={qPlan} onValueChange={(v) => {
                  const plan = v as PaymentPlan;
                  setQPlan(plan);
                  setQInstallments(String(defaultInstallments(plan)));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(paymentPlanLabels) as PaymentPlan[]).map(k => (
                      <SelectItem key={k} value={k}>{paymentPlanLabels[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(qPlan === 'weekly' || qPlan === 'monthly') && (
                <div>
                  <Label>Quantas parcelas</Label>
                  <Input type="number" min="1" value={qInstallments}
                    onChange={e => setQInstallments(e.target.value)} />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Ao gerar as faturas: {planSummary(qPlan, qServices.reduce((a, s) => a + Number(s.value || 0), 0), Number(qInstallments))}
            </p>
            <div>
              <Label>Observações</Label>
              <Textarea value={qNotes} onChange={e => setQNotes(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={save} disabled={!qClientId || !qTitle}>
              {editing ? 'Salvar Alterações' : 'Criar Proposta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* GERAR FATURA */}
      <Dialog open={!!invoiceFor} onOpenChange={o => !o && setInvoiceFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gerar fatura</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {invoiceFor?.title} — {fmt(Number(invoiceFor?.total_value ?? 0))}
            </p>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={invPlan} onValueChange={(v) => {
                const plan = v as PaymentPlan;
                setInvPlan(plan);
                setInvInstallments(String(defaultInstallments(plan)));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(paymentPlanLabels) as PaymentPlan[]).map(k => (
                    <SelectItem key={k} value={k}>{paymentPlanLabels[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(invPlan === 'weekly' || invPlan === 'monthly') && (
              <div>
                <Label>Quantas parcelas</Label>
                <Input type="number" min="1" value={invInstallments}
                  onChange={e => setInvInstallments(e.target.value)} />
              </div>
            )}
            <div>
              <Label>{invPlan === 'total' ? 'Vencimento' : 'Vencimento da 1ª parcela'}</Label>
              <Input type="date" value={invDueDate} onChange={e => setInvDueDate(e.target.value)} />
            </div>
            {invDueDate && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
                {buildInstallments(invPlan, Number(invoiceFor?.total_value ?? 0), invDueDate, Number(invInstallments)).map(p => (
                  <div key={p.number} className="flex justify-between">
                    <span className="text-muted-foreground">Parcela {p.number}/{p.total}</span>
                    <span className="text-foreground">{fmt(p.amount)} • {new Date(p.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full" onClick={generateInvoice} disabled={!invDueDate}>
              <Receipt className="mr-2 h-4 w-4" /> Criar fatura no Financeiro PJ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
