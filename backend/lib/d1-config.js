/** District 1 Fred Meyer stores and SAS project IDs */
export const D1_STORES = new Set([
  4, 35, 40, 51, 60, 63, 143, 153, 218, 220, 240, 242, 285, 375, 377, 393,
  462, 482, 516, 651, 661, 694,
]);

export const D1_PROJECTS = [
  { id: 1, name: 'Fred Meyer Kompass ISE' },
  { id: 1668, name: 'Cut In Kompass ISE' },
  { id: 1715, name: 'Blitz Kompass ISE' },
  { id: 9293, name: 'Central Pet Service Surge' },
  { id: 9295, name: 'Central Pet Reset Surge' },
  { id: 147, name: 'InHouse NonBillable Admin' },
];

export const STATUS_LABELS = {
  active: 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  deleted: 'Deleted',
};

export const ROLES = ['viewer', 'modifier', 'admin'];

export function isD1Store(storeNumber) {
  const n = Number(storeNumber);
  return Number.isFinite(n) && D1_STORES.has(n);
}

export function allowedEmailDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || 'retailodyssey.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function emailDomainAllowed(email) {
  const domain = String(email).split('@')[1]?.toLowerCase();
  return domain && allowedEmailDomains().includes(domain);
}
