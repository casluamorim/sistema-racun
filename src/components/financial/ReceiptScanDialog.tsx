import { useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const fileToBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = rej;
  r.readAsDataURL(f);
});

/** Ler recibo/nota com IA e preparar a despesa para revisão antes de salvar. */
export function ReceiptScanDialog({ financialType, onSaved }: { financialType: 'pj' | 'pf'; onSaved: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ description: '', amount: '', due_date: '', category: '', notes: '', paid: true });
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => { setPreview(null); setForm({ description: '', amount: '', due_date: '', category: '', notes: '', paid: true }); };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('Arquivo maior que 10MB');
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    setReading(true);
    const image = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke('scan-receipt', { body: { image, mediaType: file.type } });
    setReading(false);
    if (error) {
      let msg = 'Não foi possível ler o recibo';
      if (error instanceof FunctionsHttpError) { try { msg = (await error.context.json()).error ?? msg; } catch { /* */ } }
      return toast.error(msg);
    }
    const d = data?.data ?? {};
    setForm((f) => ({
      ...f,
      description: d.descricao ?? '',
      amount: d.valor != null ? String(d.valor) : '',
      due_date: d.data ?? new Date().toISOString().slice(0, 10),
      category: d.categoria ?? '',
      notes: [d.fornecedor, d.cnpj_emitente && `CNPJ ${d.cnpj_emitente}`, d.observacoes].filter(Boolean).join(' · '),
    }));
    toast.success('Dados lidos. Confira antes de salvar.');
  };

  const save = async () => {
    const amount = Number(form.amount.replace(',', '.'));
    if (!form.description.trim() || !amount || !form.due_date) return toast.error('Preencha descrição, valor e data');
    setSaving(true);
    const status = form.paid ? 'paid' : 'pending';
    const { error } = financialType === 'pj'
      ? await supabase.from('expenses').insert({ description: form.description, amount, due_date: form.due_date, category: form.category || null, notes: form.notes || null, financial_type: 'pj', status, recurrence: 'one_time', created_by: user?.id })
      : await supabase.from('expenses').insert({ description: form.description, amount, due_date: form.due_date, category: form.category || null, notes: form.notes || null, financial_type: 'pf', status, recurrence: 'one_time', created_by: user?.id });
    setSaving(false);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    toast.success('Despesa lançada');
    setOpen(false); reset(); onSaved();
  };

  return (
    <>
      <Button variant="outline" onClick={() => { reset(); setOpen(true); }}><Camera className="mr-2 h-4 w-4" />Ler recibo</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Lançar despesa por foto ({financialType.toUpperCase()})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} disabled={reading} />
            {preview && <img src={preview} alt="Recibo" className="max-h-48 w-full rounded-md object-contain bg-muted" />}
            {reading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo o recibo...</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Descrição</Label><Input value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
              <div><Label>Valor (R$)</Label><Input value={form.amount} onChange={(e) => set('amount', e.target.value)} inputMode="decimal" /></div>
              <div><Label>Data</Label><Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} /></div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => set('category', e.target.value)} /></div>
              <div className="flex items-end gap-2 pb-2"><input id="paid" type="checkbox" checked={form.paid} onChange={(e) => set('paid', e.target.checked)} /><Label htmlFor="paid">Já está pago</Label></div>
              <div className="sm:col-span-2"><Label>Observações</Label><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || reading}>{saving ? 'Salvando...' : 'Salvar despesa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
