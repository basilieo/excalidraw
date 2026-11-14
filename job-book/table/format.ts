// How a cell reads, by its column's format: 1250 as "$1,250.00" in a
// currency column, "2026-11-14" as "Nov 14, 2026" in a date column. The
// stored value stays as typed, so formulas, sorting and filtering see it.

import type { Column } from "./model";

const asNumber = (s: string) => {
  const t = s.replace(/[$,%\s]/g, "");
  return t !== "" && !isNaN(Number(t)) ? Number(t) : null;
};

export const formatCell = (col: Column, shown: string): string => {
  if (!shown || shown.startsWith("#")) {
    return shown;
  }
  const n = asNumber(shown);
  switch (col.format) {
    case "number":
      return n === null
        ? shown
        : n.toLocaleString("en-US", { maximumFractionDigits: 10 });
    case "currency":
      return n === null
        ? shown
        : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
    case "percent":
      return n === null
        ? shown
        : `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })}%`;
    case "date": {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shown.trim());
      if (!m) {
        return shown;
      }
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    default:
      return shown;
  }
};
