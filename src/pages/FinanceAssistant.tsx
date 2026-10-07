import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { buildFinanceContext } from '@/lib/financeContext';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@/components/ai-elements/prompt-input';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import logo from '@/assets/finance-assistant.png';

type Thread = { id: string; title: string; updated_at: string };

const SUGGESTIONS = [
  'Como foi o lucro líquido deste mês comparado ao mês passado?',
  'Quais clientes mais faturaram nos últimos 6 meses?',
  'Onde estou gastando mais na PJ e na PF?',
  'Tenho contas atrasadas ou meses previstos no negativo?',
];

export default function FinanceAssistant() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const allowed = role === 'admin' || role === 'manager' || role === 'financeiro';

  const loadThreads = async () => {
    const { data, error } = await supabase.from('assistant_threads').select('id, title, updated_at').order('updated_at', { ascending: false });
    if (error) toast.error('Erro ao carregar conversas');
    setThreads((data as Thread[]) ?? []);
    return (data as Thread[]) ?? [];
  };

  const createThread = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('assistant_threads').insert({ user_id: user.id }).select('id, title, updated_at').single();
    if (error || !data) return toast.error('Não foi possível criar a conversa');
    setThreads((t) => [data as Thread, ...t]);
    navigate(`/assistente/${data.id}`);
  };

  const deleteThread = async (id: string) => {
    const { error } = await supabase.from('assistant_threads').delete().eq('id', id);
    if (error) return toast.error('Não foi possível excluir');
    const rest = threads.filter((t) => t.id !== id);
    setThreads(rest);
    if (id === threadId) navigate(rest[0] ? `/assistente/${rest[0].id}` : '/assistente');
  };

  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!allowed) return;
    loadThreads().then((list) => {
      if (threadId || bootstrapped.current) return;
      bootstrapped.current = true;
      if (list[0]) navigate(`/assistente/${list[0].id}`, { replace: true });
      else createThread();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) {
    return <AppLayout><p className="text-muted-foreground">Apenas administradores e financeiro podem usar o assistente.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-7rem)] gap-4 md:h-[calc(100vh-3rem)]">
        <aside className="hidden w-64 shrink-0 flex-col rounded-lg border border-border bg-card md:flex">
          <div className="border-b border-border p-3">
            <Button className="w-full" size="sm" onClick={createThread}><MessageSquarePlus className="mr-2 h-4 w-4" />Nova análise</Button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {threads.map((t) => (
              <div key={t.id} className={cn('group flex items-center gap-1 rounded-md', t.id === threadId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}>
                <button className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => navigate(`/assistente/${t.id}`)}>
                  <p className="truncate text-sm">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(t.updated_at), "dd MMM, HH:mm", { locale: ptBR })}</p>
                </button>
                <button aria-label="Excluir conversa" className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" onClick={() => deleteThread(t.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!threads.length && <p className="p-2 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>}
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8 rounded-md bg-foreground/5 p-0.5" />
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold">Assistente financeiro</h1>
              <p className="text-xs text-muted-foreground">Pergunte sobre o Financeiro PJ e PF</p>
            </div>
            <Button className="md:hidden" size="sm" variant="outline" onClick={createThread}><MessageSquarePlus className="h-4 w-4" /></Button>
          </div>
          {threadId ? <ChatWindow key={threadId} threadId={threadId} onActivity={loadThreads} /> : <div className="flex-1" />}
        </section>
      </div>
    </AppLayout>
  );
}

function ChatWindow({ threadId, onActivity }: { threadId: string; onActivity: () => void }) {
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState('');
  const ctxRef = useRef<unknown>(null);

  useEffect(() => {
    supabase.from('assistant_messages').select('message_id, role, parts').eq('thread_id', threadId).order('created_at').then(({ data, error }) => {
      if (error) toast.error('Erro ao carregar a conversa');
      setInitial(((data as any[]) ?? []).map((m) => ({ id: m.message_id, role: m.role, parts: m.parts })));
    });
  }, [threadId]);

  if (!initial) return <div className="flex flex-1 items-center justify-center"><Shimmer>Carregando conversa...</Shimmer></div>;
  return <ChatInner threadId={threadId} initial={initial} input={input} setInput={setInput} ctxRef={ctxRef} onActivity={onActivity} />;
}

function ChatInner({ threadId, initial, input, setInput, ctxRef, onActivity }: {
  threadId: string; initial: UIMessage[]; input: string; setInput: (v: string) => void;
  ctxRef: React.MutableRefObject<unknown>; onActivity: () => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-assistant`,
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };
    },
    body: async () => {
      if (!ctxRef.current) ctxRef.current = await buildFinanceContext();
      return { threadId, financeContext: ctxRef.current };
    },
  }), [threadId, ctxRef]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => {
      let msg = e.message;
      try { msg = JSON.parse(e.message).error ?? msg; } catch { /* texto simples */ }
      toast.error(msg || 'Erro ao falar com o assistente');
    },
    onFinish: () => onActivity(),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!busy) textareaRef.current?.focus(); }, [busy, threadId]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput('');
    setTimeout(onActivity, 1500);
  };

  // Pergunta enviada pela caixa do Painel
  useEffect(() => {
    const pending = sessionStorage.getItem('assistant_pending_question');
    if (pending && !initial.length) {
      sessionStorage.removeItem('assistant_pending_question');
      send(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent>
          {!messages.length && (
            <ConversationEmptyState>
              <img src={logo} alt="" width={64} height={64} className="h-16 w-16" />
              <div className="space-y-1">
                <h3 className="font-medium">Que análise você quer hoje?</h3>
                <p className="text-sm text-muted-foreground">Uso os números do Financeiro PJ e PF dos últimos 12 meses e próximos 6.</p>
              </div>
              <div className="mt-2 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-md border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground">{s}</button>
                ))}
              </div>
            </ConversationEmptyState>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent className={m.role === 'user' ? 'bg-primary text-primary-foreground' : undefined}>
                {m.parts.map((p, i) => {
                  if (p.type === 'text') return m.role === 'assistant'
                    ? <MessageResponse key={i}>{p.text}</MessageResponse>
                    : <p key={i} className="whitespace-pre-wrap">{p.text}</p>;
                  if (p.type === 'reasoning' && p.text) return (
                    <Reasoning key={i} isStreaming={status === 'streaming' && i === m.parts.length - 1}>
                      <ReasoningTrigger />
                      <ReasoningContent>{p.text}</ReasoningContent>
                    </Reasoning>
                  );
                  if (p.type.startsWith('tool-')) {
                    const t = p as any;
                    const done = t.state === 'output-available';
                    const failed = t.state === 'output-error' || t.output?.error;
                    return (
                      <div key={i} className={cn('my-1 rounded-md border px-3 py-2 text-xs', failed ? 'border-destructive text-destructive' : 'border-border text-muted-foreground')}>
                        {failed ? `Falhou: ${t.output?.error ?? t.errorText ?? ''}` : done ? `✓ ${t.output?.message ?? 'Feito'}` : 'Executando ação...'}
                      </div>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {status === 'submitted' && <Shimmer className="text-sm">Analisando os números...</Shimmer>}
          {error && !busy && <p className="text-sm text-destructive">A resposta não pôde ser gerada. Tente enviar de novo.</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-3">
        <PromptInput onSubmit={({ text }) => send(text)}>
          <PromptInputTextarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex.: compare o lucro líquido do último trimestre com o anterior" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}
