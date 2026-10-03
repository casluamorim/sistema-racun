import { addMonths, endOfMonth, format, isAfter, isBefore, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type RecurringItem = {
  id: string;
  due_date: string;
  amount: number | string;
  status: string;
  recurrence: string;
  recurrence_day: number | null;
  recurrence_end: string | null;
  is_recurring_active: boolean;
  // For matching materialized children:
  parent_invoice_id?: string | null;
  parent_expense_id?: string | null;
  parent_income_id?: string | null;
};

export type Occurrence<T> = {
  item: T;
  /** YYYY-MM-DD scheduled date for the occurrence */
  occurrence_date: string;
  /** YYYY-MM key of competence */
  competence: string;
  /** true when this is a virtual projection, not a row in the DB for that month */
  virtual: boolean;
  /** Resolved status for the occurrence (uses the real row's status when not virtual) */
  status: string;
};

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function parseMonthKey(key: string): Date {
  return parseISO(`${key}-01`);
}

export function monthLabel(date: Date): string {
  const s = format(date, "MMMM yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function listMonthsAround(center: Date, before = 12, after = 6): Date[] {
  const out: Date[] = [];
  for (let i = -before; i <= after; i++) out.push(addMonths(center, i));
  return out;
}

/**
 * Clamp recurrence day to a valid day for the given month (handles Feb/30-31).
 */
function clampDay(year: number, monthIdx: number, day: number): number {
  const last = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(day, last);
}

/**
 * Returns all occurrences (real rows for that month + virtual projections from
 * recurring items whose origin is in another month) that fall in [start, end].
 */
export function expandOccurrencesInRange<T extends RecurringItem>(
  items: T[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  // Group materialized children by parent
  const materializedByParent = new Map<string, Set<string>>();
  for (const it of items) {
    const parent = (it.parent_invoice_id ?? it.parent_expense_id ?? it.parent_income_id) || null;
    if (parent) {
      const set = materializedByParent.get(parent) ?? new Set<string>();
      set.add(monthKey(parseISO(it.due_date)));
      materializedByParent.set(parent, set);
    }
  }

  for (const it of items) {
    const due = parseISO(it.due_date);
    // Always include the real row itself if it falls in range
    if (!isBefore(due, rangeStart) && !isAfter(due, rangeEnd)) {
      out.push({
        item: it,
        occurrence_date: it.due_date,
        competence: monthKey(due),
        virtual: false,
        status: it.status,
      });
    }

    if (it.recurrence !== 'recurring' || !it.is_recurring_active) continue;
    // Skip children (they are the materialization of another item)
    if (it.parent_invoice_id || it.parent_expense_id || it.parent_income_id) continue;

    const end = it.recurrence_end ? parseISO(it.recurrence_end) : null;
    const stop = end && isBefore(end, rangeEnd) ? end : rangeEnd;
    const dayOfMonth = it.recurrence_day ?? due.getDate();

    let cursor = startOfMonth(addMonths(due, 1));
    const rangeStartMonth = startOfMonth(rangeStart);
    if (isBefore(cursor, rangeStartMonth)) cursor = rangeStartMonth;

    while (!isAfter(cursor, stop)) {
      const day = clampDay(cursor.getFullYear(), cursor.getMonth(), dayOfMonth);
      const occDate = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      if (!isBefore(occDate, rangeStart) && !isAfter(occDate, rangeEnd)) {
        const mk = monthKey(occDate);
        const materialized = materializedByParent.get(it.id);
        if (!materialized || !materialized.has(mk)) {
          out.push({
            item: it,
            occurrence_date: format(occDate, 'yyyy-MM-dd'),
            competence: mk,
            virtual: true,
            status: 'pending',
          });
        }
      }
      cursor = addMonths(cursor, 1);
    }
  }
  return out;
}

export function expandOccurrencesForMonth<T extends RecurringItem>(items: T[], month: Date) {
  return expandOccurrencesInRange(items, startOfMonth(month), endOfMonth(month));
}

export function expandOccurrencesForMonths<T extends RecurringItem>(items: T[], startMonth: Date, count: number) {
  return expandOccurrencesInRange(items, startOfMonth(startMonth), endOfMonth(addMonths(startMonth, count - 1)));
}

/**
 * Remove os lançamentos-filhos de faturas de cartão (o valor já está na despesa-mãe
 * "Cartão de Crédito"), igual ao Financeiro PJ/PF, para não somar duas vezes.
 */
export function withoutCardChildren<T extends { id: string; category?: string | null; parent_expense_id?: string | null }>(expenses: T[]): T[] {
  const cardIds = new Set(expenses.filter(e => e.category === 'Cartão de Crédito' && !e.parent_expense_id).map(e => e.id));
  return expenses.filter(e => !(e.parent_expense_id && cardIds.has(e.parent_expense_id)));
}

/** Ignora itens cancelados nos totais. */
export function withoutCancelled<T extends { status: string }>(items: T[]): T[] {
  return items.filter(i => i.status !== 'cancelled');
}
