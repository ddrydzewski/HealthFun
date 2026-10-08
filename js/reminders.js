export function calendarURL({ time, days, timeZone }, now = new Date()) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) throw new Error('Wybierz poprawną godzinę.');
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) throw new Error('Wybierz poprawną godzinę.');
  if (!Array.isArray(days) || !days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Wybierz przynajmniej jeden dzień.');
  }
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  new Intl.DateTimeFormat('pl-PL', { timeZone: zone }).format(now);
  const start = new Date(now);
  start.setHours(hours, minutes, 0, 0);
  for (let offset = 0; offset <= 7; offset++) {
    if (start > now && days.includes(start.getDay())) break;
    start.setDate(start.getDate() + 1);
  }
  const end = new Date(start.getTime() + 5 * 60 * 1000);
  const pad = value => String(value).padStart(2, '0');
  const stamp = date => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
  const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const url = new URL('https://calendar.google.com/calendar/render');
  url.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Czas na trening · HealthFun',
    dates: `${stamp(start)}/${stamp(end)}`,
    ctz: zone,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${[...new Set(days)].map(day => weekdayCodes[day]).join(',')}`,
    details: 'Twój trening: https://ddrydzewski.github.io/HealthFun/#/dzis',
  }).toString();
  return url.href;
}