/**
 * Exact Fred Meyer store-number matching for SAS PROD APIs.
 * SAS substring-matches store_number query params — always filter client-side.
 */

export function normalizeStoreNumber(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? String(n) : digits.replace(/^0+/, '') || '0';
}

export function getVisitStoreNumber(visit) {
  if (!visit) return null;
  const raw =
    visit.store?.store?.number ??
    visit.store?.number ??
    visit.store_name?.number ??
    visit.store_number ??
    null;
  return normalizeStoreNumber(raw);
}

export function storesMatch(a, b) {
  const left = normalizeStoreNumber(a);
  const right = normalizeStoreNumber(b);
  if (left == null || right == null) return false;
  return left === right;
}

export function visitMatchesStore(visit, requestedStore) {
  return storesMatch(getVisitStoreNumber(visit), requestedStore);
}

export function filterVisitsByStore(visits, requestedStore) {
  if (requestedStore == null || requestedStore === '') {
    return Array.isArray(visits) ? visits.slice() : [];
  }
  return (visits || []).filter((v) => visitMatchesStore(v, requestedStore));
}

export function assertVisitStore(visit, requestedStore, context) {
  const actual = getVisitStoreNumber(visit);
  const expected = normalizeStoreNumber(requestedStore);
  if (!storesMatch(actual, expected)) {
    const visitId = visit?.id ?? '?';
    throw new Error(
      `${context || 'Visit'} store mismatch: expected ${expected}, got ${actual ?? 'unknown'} (visit ${visitId})`,
    );
  }
  return true;
}

export function visitIsD1Store(visit, d1StoreSet) {
  const sn = getVisitStoreNumber(visit);
  if (sn == null) return false;
  return d1StoreSet.has(Number(sn));
}
