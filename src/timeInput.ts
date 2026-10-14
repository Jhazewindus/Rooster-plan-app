/** Expand a typed hour (or compact hour/minute) to the time shown in the form. */
export function normalizeTimeInput(value: string): string {
  const input = value.trim();
  let hour: number;
  let minute: number;

  if (/^\d{1,2}$/.test(input)) {
    hour = Number(input);
    minute = 0;
  } else if (/^\d{3,4}$/.test(input)) {
    hour = Number(input.slice(0, -2));
    minute = Number(input.slice(-2));
  } else {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(input);
    if (!match) return value;
    hour = Number(match[1]);
    minute = Number(match[2]);
  }

  if (hour > 23 || minute > 59) return value;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseTimeInput(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(normalizeTimeInput(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
