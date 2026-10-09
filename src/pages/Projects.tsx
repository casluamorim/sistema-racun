import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useUrlState, useUrlBoolean } from '@/hooks/usePersistedState';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Calendar, Copy, ArrowRight, Archive } from 'lucide-react';
import { ClientCombobox } from '@/components/clients/ClientCombobox';
import { calculateProjectTiming } from '@/lib/projectTiming';
import { useStageFlowPresets, applyFlowPreset } from '@/hooks/useStageFlowPresets';

import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';
import { useCachedState, hasPageCache } from '@/hooks/useCachedState';

type Project = Database['public']['Tables']['projects']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];

const statusConfig: Record<string, { label: string; color: string }> = {
  briefing: { label: 'Briefing', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  in_progress: { label: 'Em Andamento', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  review: { label: 'Revisão', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  completed: { label: 'Concluído', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  paused: { label: 'Pausado', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  cancelled: { label: 'Cancelado', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-gray-400' },
  medium: { label: 'Média', color: 'text-blue-400' },
  high: { label: 'Alta', color: 'text-amber-400' },
  urgent: { label: 'Urgente', color: 'text-red-400' },
};

export default function Projects() {
  const [projects, setProjects] = useCachedState<(Project & { clients: { name: string } | null })[]>('projects:list', []);
  const [stages, setStages] = useCachedState<Database['public']['Tables']['project_stages']['Row'][]>('projects:stages', []);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useUrlState('q', '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useUrlBoolean('archived', false);

  const { user } = useAuth();
  const { toast } = useToast();

  const { presets } = useStageFlowPresets();

  const [form, setForm] = useState({
    name: '', client_id: '', status: 'briefing' as any, priority: 'medium' as any, deadline: '', description: '', work_type: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    // Cria automaticamente o ciclo do mês seguinte dos projetos mensais
    await (supabase.rpc as any)('roll_monthly_projects').then(() => {}, () => {});
    const [p, c] = await Promise.all([
      supabase.from('projects').select('*, clients(name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('status', 'active').order('name'),
    ]);
    setProjects((p.data as any) ?? []);
    setClients(c.data ?? []);
    const ids = (p.data ?? []).map((x: any) => x.id);
    if (ids.length) {
      const { data: st } = await supabase.from('project_stages').select('*').in('project_id', ids).order('order_index');
      setStages(st ?? []);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.client_id) {
      toast({ title: 'Preencha nome e cliente', variant: 'destructive' });
      return;
    }
    const preset = presets.find(p => p.key === form.work_type);
    const { data: created, error } = await supabase.from('projects').insert({
      ...form,
      work_type: form.work_type || null,
      deadline: form.deadline || null,
      is_monthly: preset?.key === 'social_media' ? true : undefined,
      created_by: user?.id,
    } as any).select('id').single();
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    if (preset && created) {
      const stageError = await applyFlowPreset(created.id, preset);
      if (stageError) toast({ title: 'Projeto criado, mas o fluxo falhou', description: stageError.message, variant: 'destructive' });
    }
    toast({ title: preset ? `Projeto criado com o fluxo "${preset.label}"` : 'Projeto criado!' });
    setForm({ name: '', client_id: '', status: 'briefing', priority: 'medium', deadline: '', description: '', work_type: '' });
    setDialogOpen(false);
    loadData();
  }


  async function duplicateProject(project: Project) {
    const { error } = await supabase.from('projects').insert({
      name: `${project.name} (cópia)`,
      client_id: project.client_id,
      status: 'briefing',
      priority: project.priority,
      deadline: project.deadline,
      description: project.description,
      created_by: user?.id,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Projeto duplicado!' });
    loadData();
  }

  function getDeadlineInfo(deadline: string | null) {
    if (!deadline) return null;
    const d = new Date(deadline);
    const daysLeft = differenceInDays(d, new Date());
    const overdue = isPast(d);
    return {
      text: format(d, "dd 'de' MMM", { locale: ptBR }),
      color: overdue ? 'text-red-400' : daysLeft <= 3 ? 'text-amber-400' : 'text-emerald-400',
      progress: overdue ? 100 : Math.max(0, 100 - (daysLeft / 30) * 100),
      progressColor: overdue ? 'bg-red-400' : daysLeft <= 3 ? 'bg-amber-400' : 'bg-emerald-400',
    };
  }

  const isFinished = (p: Project) => p.status === 'completed' || p.status === 'cancelled';

  const visible = projects.filter(p => (showArchived ? isFinished(p) : !isFinished(p)));
  const finishedCount = projects.filter(isFinished).length;

  const filtered = visible.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.clients?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">{showArchived ? 'Projetos finalizados' : 'Projetos'}</h1>
            <p className="text-muted-foreground">
              {visible.length} {showArchived ? 'finalizados' : 'em andamento'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>
              <Archive className="mr-2 h-4 w-4" />
              {showArchived ? 'Ver projetos ativos' : `Ver finalizados (${finishedCount})`}
            </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo Projeto</Button>
            </DialogTrigger>

            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Novo Projeto</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-muted border-border" /></div>
                <div>
                  <Label>Cliente *</Label>
                  <ClientCombobox
                    value={form.client_id}
                    onChange={v => setForm({ ...form, client_id: v })}
                    clients={clients as any}
                    onClientCreated={() => loadData()}
                  />
                </div>
                <div>
                  <Label>Tipo de trabalho</Label>
                  <Select value={form.work_type || 'none'} onValueChange={v => setForm({ ...form, work_type: v === 'none' ? '' : v })}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Sem fluxo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem fluxo (criar fases depois)</SelectItem>
                      {presets.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {presets.find(p => p.key === form.work_type)?.description ?? 'Aplica automaticamente as fases da área escolhida.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                      <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(priorityConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Prazo</Label><Input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="bg-muted border-border" /></div>
                <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-muted border-border" /></div>
                <Button onClick={handleSave} className="w-full">Criar Projeto</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>


        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar projetos..." value={search} onChange={e => setSearch(e.target.value)} className="bg-muted border-border pl-10" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(project => {
            const deadlineInfo = getDeadlineInfo(project.deadline);
            const status = statusConfig[project.status] ?? { label: project.status, color: '' };
            const priority = priorityConfig[project.priority] ?? { label: project.priority, color: '' };
            const timing = calculateProjectTiming(project, stages.filter(s => s.project_id === project.id));
            return (
              <Card key={project.id} className="border-border bg-card group hover:border-primary/30 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg text-foreground truncate">{project.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{project.clients?.name}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => duplicateProject(project)} title="Duplicar">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={status.color}>{status.label}</Badge>
                    <Badge variant="outline" className={`${priority.color} border-current/20`}>{priority.label}</Badge>
                    {timing.totalStages > 0 && (
                      <Badge variant="outline" className={timing.levelClass}>{timing.levelLabel}</Badge>
                    )}
                  </div>
                  {timing.currentStage && (
                    <p className="text-xs text-muted-foreground">
                      Fase atual: <span className="text-foreground">{timing.currentStage.name}</span>
                      {' · '}{timing.completedStages}/{timing.totalStages} concluídas
                    </p>
                  )}

                  {deadlineInfo && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`flex items-center gap-1 ${deadlineInfo.color}`}>
                          <Calendar className="h-3 w-3" /> {deadlineInfo.text}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${deadlineInfo.progressColor} transition-all`} style={{ width: `${deadlineInfo.progress}%` }} />
                      </div>
                    </div>
                  )}
                  <Link to={`/projects/${project.id}`}>
                    <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground hover:text-foreground">
                      Ver detalhes <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              {search
                ? 'Nenhum projeto encontrado.'
                : showArchived
                  ? 'Nenhum projeto finalizado ainda.'
                  : 'Nenhum projeto em andamento. Comece criando um!'}

            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
