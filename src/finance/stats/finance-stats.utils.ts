export type PeriodType = 'day' | 'week' | 'month' | 'custom';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function isValidDateKey(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function getWeekRange(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1);
  const day = base.getDay(); // 0 Sun ... 6 Sat
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const toKey = (dt: Date) =>
    `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

  return { from: toKey(monday), to: toKey(sunday) };
}

export function getMonthRange(dateKey: string) {
  const [y, m] = dateKey.split('-').map(Number);
  const first = new Date(y, (m ?? 1) - 1, 1);
  const last = new Date(y, m ?? 1, 0);

  const toKey = (dt: Date) =>
    `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

  return { from: toKey(first), to: toKey(last) };
}

export function resolveRange(params: {
  periodType: PeriodType;
  dateKey?: string;
  from?: string;
  to?: string;
}) {
  const { periodType } = params;

  if (periodType === 'custom') {
    if (!isValidDateKey(params.from) || !isValidDateKey(params.to)) {
      throw new Error('from/to inválidos');
    }
    return { from: params.from!, to: params.to! };
  }

  const dk =
    params.dateKey && isValidDateKey(params.dateKey)
      ? params.dateKey
      : undefined;
  const dateKey =
    dk ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Cordoba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

  if (periodType === 'day') return { from: dateKey, to: dateKey };
  if (periodType === 'week') return getWeekRange(dateKey);
  if (periodType === 'month') return getMonthRange(dateKey);

  throw new Error('periodType inválido');
}
