import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const PENDING_KEY = 'assistant_pending_question';

/** Caixa do assistente no topo do Painel: cria uma conversa e abre com a pergunta. */
export function AssistantBar() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!(role === 'admin' || role === 'manager' || role === 'financeiro')) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('assistant_threads').insert({ user_id: user.id }).select('id').single();
    setBusy(false);
    if (error || !data) return toast.error('Não foi possível abrir o assistente');
    sessionStorage.setItem(PENDING_KEY, text.trim());
    navigate(`/assistente/${data.id}`);
  };

  return (
    <form onSubmit={submit} className="mr-14 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Peça ao assistente: lançar cobrança, cadastrar cliente, relatório, previsão..."
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar" className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-40">
        <ArrowUp className="h-4 w-4" />
      </button>
    </form>
  );
}
