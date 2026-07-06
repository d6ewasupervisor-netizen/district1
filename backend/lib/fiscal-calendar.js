/** Minimal fiscal calendar — P06W3/P06W4 week helpers for District 1 calendar */

const WEEKS_2026_P06 = {
  '3': { start: '2026-07-05', end: '2026-07-11', label: 'P06W3' },
  '4': { start: '2026-07-12', end: '2026-07-18', label: 'P06W4' },
};

function parseLocalIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return new Date(s);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

export function getPeriodWeekForDate(targetDate) {
  const target = new Date(targetDate);
  target.setHours(12, 0, 0, 0);
  for (const [weekNum, weekData] of Object.entries(WEEKS_2026_P06)) {
    const start = parseLocalIsoDate(weekData.start);
    start.setHours(0, 0, 0, 0);
    const end = parseLocalIsoDate(weekData.end);
    end.setHours(23, 59, 59, 999);
    if (target >= start && target <= end) {
      return { period: 6, week: parseInt(weekNum, 10), label: weekData.label, ...weekData };
    }
  }
  return null;
}

export function getCurrentPeriodWeek() {
  return getPeriodWeekForDate(new Date());
}

export function getInitialSyncWindow() {
  return { from: '2026-07-05', to: '2026-07-18', label: 'P06W3 + P06W4' };
}

export function formatPeriodWeek(period, week) {
  return `P${String(period).padStart(2, '0')}W${week}`;
}

export function addDays(isoDate, days) {
  const d = parseLocalIsoDate(isoDate);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getMonthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(iso);
  }
  return cells;
}

export function weekDatesFromSunday(isoDate) {
  const d = parseLocalIsoDate(isoDate);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}
