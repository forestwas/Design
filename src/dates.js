/** Return YYYY-MM-DD for the Monday of the week containing `date`. */
export function mondayOf(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

/** Nearest Monday: today if Monday, else upcoming Monday (or today if past Mon same week). */
export function nearestMonday(date = new Date()) {
  return mondayOf(date);
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTrMonday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Snap any date input to that week's Monday. */
export function snapToMonday(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return mondayOf(new Date(y, m - 1, d));
}

export function shiftMonday(iso, weeks) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + weeks * 7);
  return toISODate(date);
}
