import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

type Ev = { id: string; title: string; location: string | null; link: string | null; allDay: boolean; start: string; end: string };

function whenLabel(e: Ev) {
  if (e.allDay) {
    // datas de dia inteiro: sem conversão de fuso
    const [y, m, d] = e.start.split('-').map(Number);
    return format(new Date(y, m - 1, d), "EEE, dd MMM", { locale: ptBR }) + ' · dia todo';
  }
  return format(parseISO(e.start), "EEE, dd MMM · HH:mm", { locale: ptBR });
}

export function AgencyCalendarCard() {
  const [state, setState] = useState<{ loading: boolean; connected?: boolean; error?: string; events: Ev[] }>({ loading: true, events: [] });

  useEffect(() => {
    supabase.functions.invoke('agency-calendar').then(({ data, error }) => {
      if (error) return setState({ loading: false, error: 'Não foi possível carregar a agenda.', events: [] });
      setState({ loading: false, connected: data?.connected, error: data?.error, events: data?.events ?? [] });
    });
  }, []);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" />Agenda da agência</CardTitle>
        <span className="text-xs text-muted-foreground">Próximos 14 dias</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {state.loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!state.loading && state.connected === false && (
          <p className="text-sm text-muted-foreground">Google Agenda ainda não conectado. Um administrador do workspace precisa conectar a agenda da agência.</p>
        )}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {!state.loading && state.connected && !state.error && !state.events.length && (
          <p className="text-sm text-muted-foreground">Nenhum evento nos próximos dias.</p>
        )}
        {state.events.map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{e.title}</p>
              <p className="text-xs capitalize text-muted-foreground">{whenLabel(e)}{e.location ? ` · ${e.location}` : ''}</p>
            </div>
            {e.link && <a href={e.link} target="_blank" rel="noreferrer" aria-label="Abrir no Google Agenda" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
