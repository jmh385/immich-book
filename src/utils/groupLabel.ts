/**
 * Automatic page text for automatically generated groups (TASKS.md goal 3).
 *
 * Pure string formatting so that the web preview and the PDF render the exact
 * same label; used by PhotoGrid via the group labels handed to the layout.
 */

export interface GroupLabelFacts {
  location?: string | null;
  /** "YYYY-MM-DD", inclusive; null disables the date part. */
  startDate?: string | null;
  endDate?: string | null;
  people?: string[];
}

interface DayParts {
  y: number;
  m: number;
  d: number;
}

function parseDay(day: string | null | undefined): DayParts | null {
  if (!day) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Full month names for a locale, index 0 = January. */
function monthNames(locale: string): string[] {
  const year = 2001; // non-leap year so every month works via Date(y, m, 1)
  const format = new Intl.DateTimeFormat(locale, { month: "long" });
  const names: string[] = [];
  for (let month = 0; month < 12; month++) {
    names.push(format.format(new Date(Date.UTC(year, month, 1))));
  }
  return names;
}

/** Formats "14 July 2026". */
function formatDay(day: DayParts, months: string[]): string {
  return `${day.d} ${months[day.m - 1]} ${day.y}`;
}

/**
 * Formats a date range for a group label:
 * - same day: "14 July 2026"
 * - same month: "14–21 July 2026"
 * - same year, different month: "14 July – 3 August 2026"
 * - different years: "14 July 2025 – 3 August 2026"
 * - only one side known: that side as a single day
 */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  locale: string,
): string | null {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start && !end) return null;

  const months = monthNames(locale);

  if (start && end) {
    if (start.y === end.y && start.m === end.m) {
      if (start.d === end.d) return formatDay(start, months);
      return `${start.d}–${end.d} ${months[start.m - 1]} ${start.y}`;
    }

    if (start.y === end.y) {
      return `${start.d} ${months[start.m - 1]} – ${formatDay(end, months)}`;
    }

    return `${formatDay(start, months)} – ${formatDay(end, months)}`;
  }

  // At least one side parsed, so exactly one is defined here.
  return formatDay((start ?? end) as DayParts, months);
}

/**
 * Builds the automatic caption of a group from its facts, e.g.
 * "Madeira, 14–21 July 2026, with Alice & Bob". Returns null when a group has
 * no usable facts at all.
 */
export function formatGroupLabel(
  facts: GroupLabelFacts,
  locale = "en-GB",
): string | null {
  const parts: string[] = [];

  const location = facts.location?.trim();
  if (location) parts.push(location);

  const dateRange = formatDateRange(facts.startDate, facts.endDate, locale);
  if (dateRange) parts.push(dateRange);

  const people = (facts.people ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  if (people.length > 0) {
    parts.push(`with ${people.join(" & ")}`);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}
