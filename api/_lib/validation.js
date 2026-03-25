const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const USAB_ID_RE = /^\d+$/;
const AGE_GROUP_RE = /^U\d{1,2}$/;
const EVENT_TYPE_RE = /^[A-Z]{2}$/;
const TSW_ID_RE = /^[0-9A-Fa-f-]+$/;
const SEASON_RE = /^\d{4}-\d{4}$/;
const TSW_DAY_RE = /^\d{8}$/;

export function isValidDate(v) {
  return typeof v === 'string' && DATE_RE.test(v);
}

export function isValidUsabId(v) {
  return typeof v === 'string' && USAB_ID_RE.test(v);
}

export function isValidAgeGroup(v) {
  return typeof v === 'string' && AGE_GROUP_RE.test(v);
}

export function isValidEventType(v) {
  return typeof v === 'string' && EVENT_TYPE_RE.test(v);
}

export function isValidTswId(v) {
  return typeof v === 'string' && TSW_ID_RE.test(v);
}

export function isValidSeason(v) {
  return typeof v === 'string' && SEASON_RE.test(v);
}

export function isValidTswDayParam(v) {
  return typeof v === 'string' && TSW_DAY_RE.test(v);
}
