import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Building2, Key, MessageSquare, FileText, User as UserIcon,
  Upload, Save, Loader2, Copy, Eye, EyeOff, Users as UsersIcon, Tags as TagsIcon, LayoutTemplate, CalendarDays, Workflow,
} from 'lucide-react';
import { UsersManagement } from '@/components/settings/UsersManagement';
import { TagsManager } from '@/components/settings/TagsManager';
import { TemplatesManager } from '@/components/settings/TemplatesManager';
import { FlowPresetsManager } from '@/components/settings/FlowPresetsManager';
import { calendarEmbedUrl } from '@/lib/calendar';

interface AgencySettings {
  id: string;
  agency_name: string;
  agency_logo_url: string | null;
  agency_phone: string | null;
  agency_email: string | null;
  agency_document: string | null;
  default_pix_key: string | null;
  default_pix_key_type: string | null;
  whatsapp_template: string;
  invoice_prefix: string;
  next_invoice_number: number;
  default_revision_limit: number;
  default_invoice_due_days: number;
  deadline_alert_days: number;
  stalled_alert_hours: number;

  timezone: string;
  currency: string;
  asaas_account_1_label?: string | null;
  asaas_account_1_cnpj?: string | null;
  asaas_account_2_label?: string | null;
  asaas_account_2_cnpj?: string | null;
  google_calendar_url?: string | null;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
}

const PIX_KEY_TYPES = [
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'cpf', label: 'CPF' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Aleatória' },
];

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asaasWebhook, setAsaasWebhook] = useState<Record<string, { id?: string; url?: string; events?: string[] }>>({});
  const [asaasBusy, setAsaasBusy] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);

  async function setupAsaasWebhook(account: '1' | '2') {
    setAsaasBusy(account);
    const { data, error } = await supabase.functions.invoke('asaas-billing', {
      body: { action: 'setup_webhook', account },
    });
    setAsaasBusy(null);
    if (error || (data as any)?.error) {
      toast({
        title: 'Erro ao cadastrar webhook',
        description: (data as any)?.error ?? error?.message,
        variant: 'destructive',
      });
      return;
    }
    setAsaasWebhook(prev => ({ ...prev, [account]: (data as any)?.webhook ?? {} }));
    toast({ title: `Webhook da conta ${account} cadastrado!`, description: 'Pagamentos agora atualizam as faturas automaticamente.' });
  }

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPix, setShowPix] = useState(false);

  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { loadAll(); }, [user?.id]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, p, r] = await Promise.all([
        supabase.from('agency_settings').select('*').limit(1).maybeSingle(),
        user ? supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        user ? supabase.from('user_roles').select('role').eq('user_id', user.id) : Promise.resolve({ data: [], error: null }),
      ]);
      if (s.error) throw s.error;
      if (p.error) throw p.error;
      setSettings(s.data as AgencySettings);
      setProfile(p.data as Profile);
      setIsAdmin((r.data || []).some((x: any) => x.role === 'admin'));
    } catch (e: any) {
      toast({ title: 'Erro ao carregar configurações', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const { id, ...payload } = settings;
      const { error } = await supabase.from('agency_settings').update(payload).eq('id', id);
      if (error) throw error;
      toast({ title: 'Configurações salvas' });
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar',
        description: e.message.includes('row-level security')
          ? 'Apenas administradores podem alterar as configurações da agência.'
          : e.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!profile || !user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
      }).eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Perfil atualizado' });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar perfil', description: e.message, variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const ext = file.name.split('.').pop();
    const path = `${prefix}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('agency-assets').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('agency-assets').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    setUploadingLogo(true);
    try {
      const url = await uploadFile(file, 'logos');
      setSettings({ ...settings, agency_logo_url: url });
      toast({ title: 'Logo enviada — clique em Salvar para confirmar' });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadFile(file, `avatars/${profile.user_id}`);
      setProfile({ ...profile, avatar_url: url });
      toast({ title: 'Avatar enviado — clique em Salvar perfil' });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  function copyPix() {
    if (!settings?.default_pix_key) return;
    navigator.clipboard.writeText(settings.default_pix_key);
    toast({ title: 'Chave Pix copiada' });
  }

  if (loading || !settings) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const update = <K extends keyof AgencySettings>(key: K, value: AgencySettings[K]) =>
    setSettings({ ...settings, [key]: value });

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-5">
          <div>
            <h1 className="page-title">Configurações</h1>
            <p className="text-sm text-muted-foreground">Personalize o Racun OS para a sua agência</p>
          </div>
          {!isAdmin && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-500">
              Modo somente leitura — apenas admins editam
            </Badge>
          )}
        </div>

        <Tabs defaultValue="agency" orientation="vertical" className="flex flex-col gap-6 md:flex-row">
          <aside className="md:w-56 md:shrink-0">
            <TabsList className="flex h-auto w-full gap-1 overflow-x-auto bg-transparent p-0 md:sticky md:top-4 md:flex-col md:items-stretch">
              {([
                ['Agência', [
                  ['agency', Building2, 'Dados da agência'],
                  ['payments', Key, 'Pagamentos'],
                  ['whatsapp', MessageSquare, 'WhatsApp'],
                  ['calendar', CalendarDays, 'Agenda'],
                ]],
                ['Operação', [
                  ['defaults', FileText, 'Padrões'],
                  ['tags', TagsIcon, 'Tags'],
                  ['templates', LayoutTemplate, 'Templates'],
                  ['flows', Workflow, 'Fluxos'],
                ]],
                ['Pessoas', [
                  ['users', UsersIcon, 'Usuários'],
                  ['profile', UserIcon, 'Meu perfil'],
                ]],
              ] as const).map(([group, items]) => (
                <div key={group} className="contents md:block md:pb-3">
                  <p className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:block">{group}</p>
                  {items.map(([value, Icon, label]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="justify-start gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none md:w-full"
                    >
                      <Icon className="h-4 w-4" />{label}
                    </TabsTrigger>
                  ))}
                </div>
              ))}
            </TabsList>
          </aside>
          <div className="min-w-0 flex-1 [&>[role=tabpanel]]:mt-0">

          {/* AGENDA */}
          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <CardTitle>Google Agenda da agência</CardTitle>
                <CardDescription>Cole o link compartilhável da agenda para exibir os próximos eventos no Painel.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Link compartilhável</Label>
                  <Input
                    value={settings.google_calendar_url || ''}
                    onChange={e => update('google_calendar_url', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="https://calendar.google.com/calendar/embed?src=..."
                  />
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Como pegar o link</p>
                  <p>1. No Google Agenda (computador), abra as configurações da agenda da agência.</p>
                  <p>2. Em "Permissões de acesso", marque "Disponibilizar publicamente" (ou deixe compartilhada com quem usa o sistema).</p>
                  <p>3. Em "Integrar agenda", copie o "URL público" ou o ID da agenda e cole aqui.</p>
                </div>
                {settings.google_calendar_url && calendarEmbedUrl(settings.google_calendar_url) && (
                  <iframe title="Prévia da agenda" src={calendarEmbedUrl(settings.google_calendar_url)!} className="h-80 w-full rounded-md border border-border" />
                )}
                <Button onClick={saveSettings} disabled={saving || !isAdmin}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAGS */}
          <TabsContent value="tags">
            <TagsManager />
          </TabsContent>

          {/* TEMPLATES */}
          <TabsContent value="templates" >
            <TemplatesManager isAdmin={isAdmin} />
          </TabsContent>

          {/* USUÁRIOS */}
          <TabsContent value="flows" >
            <FlowPresetsManager isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="users" >
            <UsersManagement isAdmin={isAdmin} />
          </TabsContent>

          {/* AGÊNCIA */}
          <TabsContent value="agency" >
            <Card>
              <CardHeader>
                <CardTitle>Dados da agência</CardTitle>
                <CardDescription>Informações exibidas em faturas, portal do cliente e cobranças</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20 rounded-lg">
                    <AvatarImage src={settings.agency_logo_url || undefined} className="object-contain" />
                    <AvatarFallback className="rounded-lg text-lg">
                      {settings.agency_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label htmlFor="logo-upload" className="cursor-pointer">
                      <div className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
                        {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Enviar logo
                      </div>
                      <Input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={!isAdmin} />
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">PNG ou JPG — recomendado 512x512px</p>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Nome da agência</Label>
                    <Input value={settings.agency_name} onChange={e => update('agency_name', e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div>
                    <Label>CNPJ / Documento</Label>
                    <Input value={settings.agency_document || ''} onChange={e => update('agency_document', e.target.value)} disabled={!isAdmin} placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input type="email" value={settings.agency_email || ''} onChange={e => update('agency_email', e.target.value)} disabled={!isAdmin} placeholder="contato@agencia.com" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={settings.agency_phone || ''} onChange={e => update('agency_phone', e.target.value)} disabled={!isAdmin} placeholder="+55 11 99999-9999" />
                  </div>
                </div>

                <Button onClick={saveSettings} disabled={saving || !isAdmin}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PAGAMENTOS */}
          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Asaas — contas de cobrança (2 CNPJs)</CardTitle>
                <CardDescription>
                  Cadastre as duas contas. Em cada cliente você escolhe por qual CNPJ ele será cobrado, e o sistema emite
                  a cobrança na conta correta automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(['1', '2'] as const).map(n => (
                  <div key={n} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium text-foreground">Conta {n}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Nome/apelido da empresa</Label>
                        <Input
                          value={(settings as any)?.[`asaas_account_${n}_label`] ?? ''}
                          disabled={!isAdmin}
                          placeholder={`Empresa ${n}`}
                          onChange={e => setSettings(s => s && ({ ...s, [`asaas_account_${n}_label`]: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>CNPJ</Label>
                        <Input
                          value={(settings as any)?.[`asaas_account_${n}_cnpj`] ?? ''}
                          disabled={!isAdmin}
                          placeholder="00.000.000/0000-00"
                          onChange={e => setSettings(s => s && ({ ...s, [`asaas_account_${n}_cnpj`]: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="secondary" onClick={() => setupAsaasWebhook(n)} disabled={!isAdmin || asaasBusy === n}>
                        {asaasBusy === n ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                        Cadastrar/atualizar webhook
                      </Button>
                      {asaasWebhook[n] && (
                        <span className="text-sm text-emerald-400">
                          Webhook ativo · {asaasWebhook[n]?.events?.length ?? 0} eventos
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <Button onClick={saveSettings} disabled={saving || !isAdmin}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar contas
                </Button>
                <p className="text-xs text-muted-foreground">
                  A chave de API da conta 1 é a ASAAS_API_KEY e a da conta 2 é a ASAAS_API_KEY_2.
                </p>
              </CardContent>
            </Card>
            <Card>

              <CardHeader>
                <CardTitle>Chave Pix padrão</CardTitle>
                <CardDescription>Usada automaticamente nas cobranças e mensagens de WhatsApp</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[200px_1fr_auto]">
                  <div>
                    <Label>Tipo da chave</Label>
                    <Select
                      value={settings.default_pix_key_type || 'cnpj'}
                      onValueChange={v => update('default_pix_key_type', v)}
                      disabled={!isAdmin}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PIX_KEY_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Chave Pix</Label>
                    <div className="relative">
                      <Input
                        type={showPix ? 'text' : 'password'}
                        value={settings.default_pix_key || ''}
                        onChange={e => update('default_pix_key', e.target.value)}
                        disabled={!isAdmin}
                        placeholder="Sua chave Pix"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPix(!showPix)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPix ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" onClick={copyPix} disabled={!settings.default_pix_key}>
                      <Copy className="mr-2 h-4 w-4" />Copiar
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-1">
                  <p className="font-medium">💡 Como é usada</p>
                  <p className="text-muted-foreground">A chave Pix aparece automaticamente na variável <code className="rounded bg-muted px-1">{'{pix}'}</code> das mensagens de cobrança via WhatsApp.</p>
                </div>

                <Button onClick={saveSettings} disabled={saving || !isAdmin}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WHATSAPP */}
          <TabsContent value="whatsapp" >
            <Card>
              <CardHeader>
                <CardTitle>Modelo de mensagem WhatsApp</CardTitle>
                <CardDescription>Mensagem usada ao gerar cobrança automática</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Variáveis disponíveis</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['{empresa}', '{cliente}', '{valor}', '{vencimento}', '{pix}', '{titulo}'].map(v => (
                      <Badge key={v} variant="secondary" className="font-mono">{v}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Template</Label>
                  <Textarea
                    rows={10}
                    value={settings.whatsapp_template}
                    onChange={e => update('whatsapp_template', e.target.value)}
                    disabled={!isAdmin}
                    className="font-mono text-sm"
                  />
                </div>
                <Button onClick={saveSettings} disabled={saving || !isAdmin}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PADRÕES */}
          <TabsContent value="defaults" >
            <Card>
              <CardHeader>
                <CardTitle>Padrões operacionais</CardTitle>
                <CardDescription>Valores aplicados automaticamente em novos registros</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Prefixo de fatura</Label>
                    <Input value={settings.invoice_prefix} onChange={e => update('invoice_prefix', e.target.value)} disabled={!isAdmin} placeholder="FAT" />
                  </div>
                  <div>
                    <Label>Próximo número</Label>
                    <Input
                      type="number"
                      value={settings.next_invoice_number}
                      onChange={e => update('next_invoice_number', parseInt(e.target.value) || 1)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div>
                    <Label>Limite padrão de revisões</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.default_revision_limit}
                      onChange={e => update('default_revision_limit', parseInt(e.target.value) || 3)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div>
                    <Label>Vencimento padrão (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.default_invoice_due_days}
                      onChange={e => update('default_invoice_due_days', parseInt(e.target.value) || 7)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div>
                    <Label>Fuso horário</Label>
                    <Input value={settings.timezone} onChange={e => update('timezone', e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div>
                    <Label>Moeda</Label>
                    <Select value={settings.currency} onValueChange={v => update('currency', v)} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BRL">Real (BRL)</SelectItem>
                        <SelectItem value="USD">Dólar (USD)</SelectItem>
                        <SelectItem value="EUR">Euro (EUR)</SelectItem>
                      </SelectContent>
                    </Select>
                </div>

                <Separator />

                <div>
                  <p className="font-medium text-foreground">Alertas de projeto</p>
                  <p className="text-sm text-muted-foreground">
                    Usados pela rotina diária que gera as notificações automáticas.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Avisar quantos dias antes do prazo</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={settings.deadline_alert_days ?? 3}
                      onChange={e => update('deadline_alert_days', parseInt(e.target.value) || 3)}
                      disabled={!isAdmin}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Padrão: 3 dias.</p>
                  </div>
                  <div>
                    <Label>Fase parada: alertar após quantas horas</Label>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={settings.stalled_alert_hours ?? 48}
                      onChange={e => update('stalled_alert_hours', parseInt(e.target.value) || 48)}
                      disabled={!isAdmin}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Padrão: 48 horas sem atualização.</p>
                  </div>
                </div>

                </div>
                <Button onClick={saveSettings} disabled={saving || !isAdmin}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PERFIL */}
          <TabsContent value="profile" >
            <Card>
              <CardHeader>
                <CardTitle>Meu perfil</CardTitle>
                <CardDescription>Suas informações pessoais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile ? (
                  <>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback>{profile.full_name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <Label htmlFor="avatar-upload" className="cursor-pointer">
                          <div className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
                            {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            Trocar foto
                          </div>
                          <Input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                        </Label>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Nome completo</Label>
                        <Input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} />
                      </div>
                      <div>
                        <Label>E-mail</Label>
                        <Input value={profile.email || user?.email || ''} disabled />
                      </div>
                      <div>
                        <Label>Função no sistema</Label>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge>{isAdmin ? 'Administrador' : profile.role || 'editor'}</Badge>
                        </div>
                      </div>
                    </div>

                    <Button onClick={saveProfile} disabled={savingProfile}>
                      {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salvar perfil
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground">Perfil não encontrado.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
}
