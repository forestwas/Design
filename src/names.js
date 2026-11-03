/** "Ahmet Yılmaz" → "A. Yılmaz"; single token stays as-is. */
export function formatShortName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = first.charAt(0).toLocaleUpperCase('tr-TR');
  return `${initial}. ${last}`;
}
