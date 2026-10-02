/**
 * Date helper utilities for JATapp v1.0
 * Enforces JAT Operational Week: Lunes 00:00:00.000 → Sábado 23:59:59.999
 */

export interface DateRange {
  startOfWeek: Date;
  endOfWeek: Date;
}

/**
 * Calculates official JAT Operational Week for a given reference date.
 * - Monday 00:00:00.000 to Saturday 23:59:59.999.
 * - Sunday is completely excluded from the active week.
 * - If refDate is Sunday, returns the completed previous week (previous Monday → previous Saturday).
 */
export function getJatOperationalWeek(refDate?: Date): DateRange {
  const d = refDate ? new Date(refDate) : new Date();
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  let diffToMonday: number;
  let diffToSaturday: number;

  if (dayOfWeek === 0) {
    // Sunday: evaluate to previous week (previous Monday to previous Saturday)
    diffToMonday = -6;
    diffToSaturday = -1;
  } else {
    // Monday (1) through Saturday (6)
    diffToMonday = 1 - dayOfWeek;
    diffToSaturday = 6 - dayOfWeek;
  }

  const startOfWeek = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + diffToMonday,
    0,
    0,
    0,
    0
  );

  const endOfWeek = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + diffToSaturday,
    23,
    59,
    59,
    999
  );

  return { startOfWeek, endOfWeek };
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 */
export function formatDateToIsoString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD string into local Date object.
 */
export function parseIsoDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
}
