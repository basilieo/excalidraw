// Formulas: a cell whose text starts with "=" shows the result.
//
//   =A1*B1          =(A1+A2)/2        =B3^2        =C1*15%
//   =SUM(B1:B10)    =AVERAGE(B1:D1)   =MIN(...)    =MAX(...)
//   =COUNT(A1:A9)   =ROUND(A1/3, 2)   =ABS(A1-B1)
//
// A1 is column A, the first row under the header, in the table's stored
// order: sorting or filtering the view never changes what a formula points
// at. A small parser of its own (no eval), so a formula can only do
// arithmetic. Errors show in the cell: #REF (no such cell), #VALUE (text
// where a number was needed), #DIV/0, #CYCLE (a formula that depends on
// itself), #ERR (anything else it couldn't read).

import { columnLetter } from "./model";

import type { TableData } from "./model";

export class FormulaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

type Token =
  | { t: "num"; v: number }
  | { t: "ref"; col: number; row: number }
  | { t: "name"; v: string }
  | { t: "op"; v: string };

const tokenize = (src: string): Token[] => {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (num) {
      out.push({ t: "num", v: parseFloat(num[1]) });
      i += num[1].length;
      continue;
    }
    const ref = /^([A-Za-z]{1,3})(\d+)(?![A-Za-z(])/.exec(src.slice(i));
    if (ref) {
      let col = 0;
      for (const ch of ref[1].toUpperCase()) {
        col = col * 26 + (ch.charCodeAt(0) - 64);
      }
      out.push({ t: "ref", col: col - 1, row: parseInt(ref[2], 10) - 1 });
      i += ref[0].length;
      continue;
    }
    const name = /^[A-Za-z]+/.exec(src.slice(i));
    if (name) {
      out.push({ t: "name", v: name[0].toUpperCase() });
      i += name[0].length;
      continue;
    }
    if ("+-*/^()%,:×÷".includes(c)) {
      out.push({ t: "op", v: c === "×" ? "*" : c === "÷" ? "/" : c });
      i++;
      continue;
    }
    throw new FormulaError("#ERR");
  }
  return out;
};

type Value = number | number[];

/**
 * Evaluates one formula. `cell(col, row)` gives a referenced cell's number
 * (and throws a FormulaError for a bad one).
 */
export const evaluateFormula = (
  formula: string,
  cell: (col: number, row: number) => number,
): number => {
  const tokens = tokenize(formula.replace(/^=/, ""));
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => {
    const tk = tokens[p];
    return tk?.t === "op" && tk.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) {
      throw new FormulaError("#ERR");
    }
    p++;
  };

  const scalar = (v: Value): number => {
    if (Array.isArray(v)) {
      throw new FormulaError("#VALUE");
    }
    return v;
  };

  const expr = (): Value => {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[p++] as { v: string }).v;
      const r = scalar(term());
      v = op === "+" ? scalar(v) + r : scalar(v) - r;
    }
    return v;
  };
  const term = (): Value => {
    let v = power();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[p++] as { v: string }).v;
      const r = scalar(power());
      if (op === "/" && r === 0) {
        throw new FormulaError("#DIV/0");
      }
      v = op === "*" ? scalar(v) * r : scalar(v) / r;
    }
    return v;
  };
  const power = (): Value => {
    const base = unary();
    if (isOp("^")) {
      p++;
      return Math.pow(scalar(base), scalar(power()));
    }
    return base;
  };
  const unary = (): Value => {
    if (isOp("-")) {
      p++;
      return -scalar(unary());
    }
    if (isOp("+")) {
      p++;
      return scalar(unary());
    }
    let v = primary();
    while (isOp("%")) {
      p++;
      v = scalar(v) / 100;
    }
    return v;
  };
  const primary = (): Value => {
    const tk = peek();
    if (!tk) {
      throw new FormulaError("#ERR");
    }
    if (tk.t === "num") {
      p++;
      return tk.v;
    }
    if (tk.t === "ref") {
      p++;
      if (isOp(":")) {
        p++;
        const end = peek();
        if (end?.t !== "ref") {
          throw new FormulaError("#ERR");
        }
        p++;
        const values: number[] = [];
        for (
          let r = Math.min(tk.row, end.row);
          r <= Math.max(tk.row, end.row);
          r++
        ) {
          for (
            let c = Math.min(tk.col, end.col);
            c <= Math.max(tk.col, end.col);
            c++
          ) {
            values.push(cell(c, r));
          }
        }
        return values;
      }
      return cell(tk.col, tk.row);
    }
    if (tk.t === "name") {
      p++;
      expect("(");
      const args: Value[] = [];
      if (!isOp(")")) {
        args.push(expr());
        while (isOp(",")) {
          p++;
          args.push(expr());
        }
      }
      expect(")");
      return call(tk.v, args);
    }
    if (tk.t === "op" && tk.v === "(") {
      p++;
      const v = expr();
      expect(")");
      return v;
    }
    throw new FormulaError("#ERR");
  };

  const call = (name: string, args: Value[]): number => {
    const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    switch (name) {
      case "SUM":
        return flat.reduce((a, b) => a + b, 0);
      case "AVERAGE":
      case "AVG":
        if (!flat.length) {
          throw new FormulaError("#DIV/0");
        }
        return flat.reduce((a, b) => a + b, 0) / flat.length;
      case "MIN":
        return flat.length ? Math.min(...flat) : 0;
      case "MAX":
        return flat.length ? Math.max(...flat) : 0;
      case "COUNT":
        return flat.length;
      case "ROUND": {
        const digits = args[1] === undefined ? 0 : scalar(args[1]);
        const f = Math.pow(10, digits);
        return Math.round(scalar(args[0]) * f) / f;
      }
      case "ABS":
        return Math.abs(scalar(args[0]));
      default:
        throw new FormulaError("#ERR");
    }
  };

  const v = expr();
  if (p !== tokens.length) {
    throw new FormulaError("#ERR");
  }
  return scalar(v);
};

/** a number as a cell shows it: no float noise (0.1+0.2 shows 0.3) */
export const formatNumber = (n: number) =>
  Number.isFinite(n) ? String(parseFloat(n.toPrecision(12))) : "#ERR";

const numberOf = (text: string) => {
  const t = text.replace(/[$,\s]/g, "");
  if (t === "") {
    return 0; // an empty cell counts as 0, as in Numbers
  }
  const n = Number(t.endsWith("%") ? t.slice(0, -1) : t);
  if (isNaN(n)) {
    throw new FormulaError("#VALUE");
  }
  return t.endsWith("%") ? n / 100 : n;
};

/**
 * What every cell of a table shows: its text, or its formula's result.
 * Results are worked out once per table and remembered.
 */
export const tableDisplay = (t: TableData) => {
  const shown = new Map<string, string>();
  const busy = new Set<string>();
  const rowIndex = new Map(t.rows.map((r, i) => [r.id, i]));
  const colIndex = new Map(t.columns.map((c, i) => [c.id, i]));

  const raw = (row: number, col: number) => {
    const r = t.rows[row];
    const c = t.columns[col];
    if (!r || !c) {
      throw new FormulaError("#REF");
    }
    return { key: `${r.id}:${c.id}`, text: r.cells[c.id] ?? "" };
  };

  const value = (row: number, col: number): string => {
    const { key, text } = raw(row, col);
    if (shown.has(key)) {
      return shown.get(key)!;
    }
    if (!text.startsWith("=")) {
      shown.set(key, text);
      return text;
    }
    if (busy.has(key)) {
      throw new FormulaError("#CYCLE");
    }
    busy.add(key);
    let out: string;
    try {
      out = formatNumber(
        evaluateFormula(text, (c, r) => {
          const v = value(r, c);
          if (v.startsWith("#")) {
            throw new FormulaError(v);
          }
          return numberOf(v);
        }),
      );
    } catch (e) {
      if (e instanceof FormulaError && e.code === "#CYCLE" && busy.size > 1) {
        busy.delete(key);
        throw e; // let the cycle unwind to where it started
      }
      out = e instanceof FormulaError ? e.code : "#ERR";
    }
    busy.delete(key);
    shown.set(key, out);
    return out;
  };

  return (rowId: string, colId: string): string => {
    const r = rowIndex.get(rowId);
    const c = colIndex.get(colId);
    if (r === undefined || c === undefined) {
      return "";
    }
    try {
      return value(r, c);
    } catch (e) {
      return e instanceof FormulaError ? e.code : "#ERR";
    }
  };
};

/** "B3" for a cell, as formulas refer to it */
export const cellName = (t: TableData, rowId: string, colId: string) => {
  const r = t.rows.findIndex((x) => x.id === rowId);
  const c = t.columns.findIndex((x) => x.id === colId);
  return r < 0 || c < 0 ? "" : `${columnLetter(c)}${r + 1}`;
};
