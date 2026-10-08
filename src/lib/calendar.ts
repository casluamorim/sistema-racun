/** Converte link compartilhável / ID / URL pública do Google Agenda em URL de incorporação. */
export function calendarEmbedUrl(raw: string, mode: 'AGENDA' | 'WEEK' | 'MONTH' = 'AGENDA'): string | null {
  const v = raw.trim();
  if (!v) return null;
  let src: string | null = null;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('google.com')) return null;
    src = u.searchParams.get('src') ?? u.searchParams.get('cid');
    if (src && u.searchParams.has('cid')) { try { src = atob(src); } catch { /* id puro */ } }
    const ical = u.pathname.match(/\/ical\/([^/]+)\//);
    if (!src && ical) src = decodeURIComponent(ical[1]);
  } catch {
    if (v.includes('@')) src = v;
  }
  if (!src) return null;
  const p = new URLSearchParams({ src, mode, ctz: 'America/Sao_Paulo', showTitle: '0', showPrint: '0', showTabs: '1', showCalendars: '0', hl: 'pt_BR', bgcolor: '#ffffff' });
  return `https://calendar.google.com/calendar/embed?${p}`;
}
