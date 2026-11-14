import { evaluateFormula, formatNumber, tableDisplay } from "./formula";
import { newTable, setCell, viewRows } from "./model";

const none = () => {
  throw new Error("no cells");
};

describe("formulas", () => {
  it("does arithmetic in the usual order", () => {
    expect(evaluateFormula("=1+2*3", none)).toBe(7);
    expect(evaluateFormula("=(1+2)*3", none)).toBe(9);
    expect(evaluateFormula("=2^3^2", none)).toBe(512);
    // a leading minus binds first, as in Numbers and Excel
    expect(evaluateFormula("=-2^2", none)).toBe(4);
    expect(evaluateFormula("=10/4", none)).toBe(2.5);
    expect(evaluateFormula("=200*15%", none)).toBe(30);
    expect(evaluateFormula("=6×7", none)).toBe(42);
    expect(evaluateFormula("=9÷3", none)).toBe(3);
    expect(formatNumber(evaluateFormula("=0.1+0.2", none))).toBe("0.3");
  });

  it("knows a handful of functions", () => {
    const cell = (c: number, r: number) => (r + 1) * (c + 1);
    expect(evaluateFormula("=SUM(A1:A4)", cell)).toBe(10);
    expect(evaluateFormula("=average(A1:B2)", cell)).toBe(2.25);
    expect(evaluateFormula("=MAX(A1:A4, 9)", cell)).toBe(9);
    expect(evaluateFormula("=COUNT(A1:C2)", cell)).toBe(6);
    expect(evaluateFormula("=ROUND(10/3, 2)", cell)).toBe(3.33);
    expect(evaluateFormula("=ABS(A1-A3)", cell)).toBe(2);
  });

  it("refuses what it can't read", () => {
    expect(() => evaluateFormula("=1/0", none)).toThrow("#DIV/0");
    expect(() => evaluateFormula("=1+", none)).toThrow("#ERR");
    expect(() => evaluateFormula("=alert(1)", none)).toThrow("#ERR");
    expect(() => evaluateFormula("=A1:A2", () => 1)).toThrow("#VALUE");
  });
});

describe("a table's cells", () => {
  const build = () => {
    let t = newTable(3, 3);
    const [a, b, c] = t.columns.map((x) => x.id);
    const [r1, r2, r3] = t.rows.map((x) => x.id);
    t = setCell(t, r1, a, "4");
    t = setCell(t, r1, b, "$1,250");
    t = setCell(t, r1, c, "=A1*B1");
    t = setCell(t, r2, a, "10");
    t = setCell(t, r2, c, "=SUM(A1:A3)");
    t = setCell(t, r3, a, "hello");
    return { t, a, b, c, r1, r2, r3 };
  };

  it("shows results, and errors in place", () => {
    const { t, a, c, r1, r2, r3 } = build();
    const show = tableDisplay(t);
    expect(show(r1, c)).toBe("5000");
    expect(show(r1, a)).toBe("4");
    // A3 is text: summing it is a #VALUE
    expect(show(r2, c)).toBe("#VALUE");
    expect(show(r3, a)).toBe("hello");
  });

  it("catches a formula that depends on itself", () => {
    let { t, a, b, r1 } = build();
    t = setCell(t, r1, a, "=B1+1");
    t = setCell(t, r1, b, "=A1+1");
    const show = tableDisplay(t);
    expect(show(r1, a)).toBe("#CYCLE");
    expect(show(r1, b)).toBe("#CYCLE");
  });

  it("refers to stored rows, so sorting doesn't move what a formula sees", () => {
    let { t, a, c, r1 } = build();
    t = { ...t, sort: { colId: a, dir: "desc" } };
    const show = tableDisplay(t);
    expect(show(r1, c)).toBe("5000");
    // text after numbers isn't comparable; numbers sort among themselves
    const order = viewRows(t, show).map((r) => show(r.id, a));
    expect(order.slice(0, 2)).toEqual(["10", "4"]);
  });

  it("filters on what cells show", () => {
    let { t, a } = build();
    t = { ...t, filters: [{ colId: a, op: ">", value: "5" }] };
    const show = tableDisplay(t);
    expect(viewRows(t, show).map((r) => show(r.id, a))).toEqual(["10"]);
  });
});
