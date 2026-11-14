// NP's job book, as it was laid out in Miro: one row per phase of the job,
// each row a run of sheets numbered as the table of contents numbers them,
// with the same placeholders. Rows are colored by phase; each sheet is
// numbered by its page in the set. Run on an empty board (Menu → "Lay out the NP
// job book"), then save the board as a template.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw";

import { paperPx } from "../paper";
import { sheetColor, viewportOffsets } from "../sheets";
import { tableFrom } from "../table/model";
import { syncTables, tableAnchor } from "../table/render";
import { syncTocs, tocAnchor } from "../toc/render";

import type { BoardSettings } from "../settings";
import type { SheetData } from "../sheets";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

type Item =
  | { kind: "text"; x: number; y: number; text: string; size: number }
  | {
      kind: "box";
      x: number;
      y: number;
      w: number;
      h: number;
      label: string;
      size?: number;
    }
  | {
      kind: "table";
      x: number;
      y: number;
      columns: (string | { name: string; width: number })[];
      rows: string[][];
      caption?: string;
    }
  | { kind: "chart" }
  /** the live table of contents (toc/render) */
  | { kind: "contents"; x: number; y: number; w: number };

type SheetSpec = { n: string; title: string; items?: Item[] };

const INK = "#1e1e1e";

/** the job book's own sheets, by phase, as Miro's table of contents lists them */
const ROWS: { phase: string; sheets: SheetSpec[] }[] = [
  {
    phase: "OV",
    sheets: [
      {
        n: "1",
        title: "Cover",
        items: [
          { kind: "text", x: 70, y: 70, text: "PROJECT TITLE", size: 84 },
          {
            kind: "text",
            x: 80,
            y: 190,
            text: "Internal short hand",
            size: 40,
          },
          {
            kind: "box",
            x: 80,
            y: 280,
            w: 1494,
            h: 690,
            label: "CLIENT RENDERINGS",
            size: 56,
          },
        ],
      },
      {
        n: "2",
        title: "Table of Contents",
        items: [] /* filled in below, from ROWS */,
      },
      {
        n: "3",
        title: "Key Dates",
        items: [
          {
            kind: "table",
            x: 70,
            y: 80,
            columns: [
              { name: "Milestone", width: 320 },
              { name: "Date", width: 150 },
              { name: "Owner", width: 160 },
              { name: "Notes", width: 420 },
            ],
            rows: [
              ["Contract signed"],
              ["Deposit received"],
              ["Kickoff"],
              ["Drawings approved"],
              ["Materials ordered"],
              ["Production start"],
              ["QC complete"],
              ["Ship"],
              ["Install"],
              ["Punchlist closed"],
              ["Wrap"],
            ],
          },
        ],
      },
      {
        n: "4",
        title: "Stakeholders and Contacts",
        items: [
          { kind: "chart" },
          {
            kind: "table",
            x: 620,
            y: 90,
            columns: [
              { name: "Name", width: 190 },
              { name: "Company", width: 170 },
              { name: "Role", width: 170 },
              { name: "Email", width: 220 },
              { name: "Phone", width: 150 },
            ],
            rows: [[], [], [], [], [], []],
          },
        ],
      },
    ],
  },
  {
    phase: "PP",
    sheets: [
      {
        n: "5",
        title: "Production Scope",
        items: [
          {
            kind: "box",
            x: 70,
            y: 180,
            w: 1494,
            h: 760,
            label: "SCOPE MAP",
            size: 56,
          },
        ],
      },
      {
        n: "6",
        title: "BOM",
        items: [
          {
            kind: "table",
            x: 50,
            y: 80,
            columns: [
              { name: "Title", width: 170 },
              ...[
                "Status",
                "Priority",
                "Spec",
                "Link",
                "Assignee",
                "Vendor",
                "Order QTY",
                "Exact QTY",
                "Unit",
                "QTY Notes",
                "Pricing Notes",
                "Bill#",
                "Order Log",
                "Deliverables",
              ].map((name) => ({ name, width: 95 })),
            ],
            rows: [[], [], [], [], [], []],
          },
        ],
      },
    ],
  },
  {
    phase: "PR",
    sheets: [
      {
        n: "7",
        title: "Family Portrait",
        items: [
          {
            kind: "box",
            x: 90,
            y: 90,
            w: 1100,
            h: 600,
            label: "OVERVIEW OF DRAWN DELIVERABLES VIA DRAFTERS",
            size: 40,
          },
        ],
      },
      { n: "8", title: "Production WBS" },
      {
        n: "9",
        title: "Production Tracking",
        items: [
          {
            kind: "table",
            x: 50,
            y: 110,
            caption: "(department / team) (deliverables)",
            columns: [
              { name: "Unit", width: 200 },
              { name: "Done", width: 80 },
              ...[1, 2, 3, 4, 5, 6].map((i) => ({
                name: `Process ${i}`,
                width: 150,
              })),
            ],
            rows: [[], [], [], [], [], [], [], []],
          },
        ],
      },
      { n: "10", title: "WFS & QC Checklists" },
    ],
  },
  {
    phase: "LG",
    sheets: [
      {
        n: "11",
        title: "Locations",
        items: [
          {
            kind: "box",
            x: 110,
            y: 100,
            w: 1050,
            h: 200,
            label: "Detail of installation sites",
            size: 40,
          },
          {
            kind: "box",
            x: 110,
            y: 700,
            w: 520,
            h: 250,
            label: "“Nearests”\nHospital\nParking garage",
            size: 36,
          },
        ],
      },
      {
        n: "12",
        title: "Load-In Detail",
        items: [
          {
            kind: "box",
            x: 40,
            y: 640,
            w: 380,
            h: 250,
            label: "LOADING DOCK",
            size: 36,
          },
          {
            kind: "box",
            x: 440,
            y: 640,
            w: 380,
            h: 250,
            label: "SITE APPROACH",
            size: 36,
          },
          {
            kind: "box",
            x: 840,
            y: 640,
            w: 380,
            h: 250,
            label: "ELEVATORS AND\nPINCH POINTS",
            size: 36,
          },
        ],
      },
      {
        n: "13",
        title: "Vehicle Load Plan",
        items: [
          {
            kind: "box",
            x: 60,
            y: 30,
            w: 380,
            h: 260,
            label: "HOW WE ARE\nGOING TO PACK\nTHE TRUCK VIA\nDRAFTERS",
            size: 34,
          },
          {
            kind: "box",
            x: 60,
            y: 600,
            w: 380,
            h: 260,
            label: "WHAT GOES\nWHEN",
            size: 34,
          },
        ],
      },
      {
        n: "14",
        title: "BOL & Packlist",
        items: [
          {
            kind: "box",
            x: 430,
            y: 120,
            w: 740,
            h: 420,
            label: "BILL OF LADING\nPACKLIST TEMPLATE",
            size: 40,
          },
          {
            kind: "box",
            x: 40,
            y: 560,
            w: 380,
            h: 260,
            label: "LOGISTICS\nVENDOR\nCONTACT\nINFORMATION",
            size: 34,
          },
        ],
      },
    ],
  },
  {
    phase: "PI",
    sheets: [
      { n: "15", title: "Install Scope" },
      { n: "16", title: "Strike Scope" },
      { n: "17", title: "Floorplan" },
      {
        n: "18",
        title: "Site Photos",
        items: [
          {
            kind: "box",
            x: 40,
            y: 30,
            w: 440,
            h: 260,
            label: "CONDITIONS OF\nDELIVERABLE\nLOCATIONS",
            size: 34,
          },
          {
            kind: "box",
            x: 40,
            y: 320,
            w: 440,
            h: 260,
            label: "CONDITIONS OF\nDELIVERABLE\nLOCATIONS",
            size: 34,
          },
        ],
      },
      { n: "19", title: "Site Photos 2" },
      { n: "20", title: "Site Condition Report" },
      {
        n: "29",
        title: "Site Visit Notes",
        items: [] /* the checklist, below */,
      },
    ],
  },
  {
    phase: "IN",
    sheets: [
      { n: "21", title: "Install WBS" },
      { n: "22", title: "Run of Show" },
      { n: "23", title: "Our Punchlist" },
      { n: "24", title: "Client Punchlist" },
      { n: "25", title: "Work Order" },
      { n: "26", title: "COI / OSHA Safety" },
    ],
  },
];

const SITE_VISIT_CHECKLIST = [
  [
    "SITE VISIT CHECK LIST",
    "Check all boxes (n/a if not applicable). Fill in all",
    "necessary information. Capture all dimensions.",
    "Use separate sheets if need be. Take photographs.",
    "",
    "Address / Client:",
    "",
    "THINGS TO BRING",
    "☐ Plans / drawings / photographs",
    "☐ Measuring tools, tape measure, range finder, level",
    "☐ Ladder",
    "☐ New Project shirts",
    "",
    "LOAD IN",
    "☐ Parking situation",
    "☐ Unloading situation",
    "☐ Entrance: steps, doors, ramps, loading dock",
    "     ☐ If a dock: height of dock, size of truck",
    "",
    "PATH (INGRESS, EGRESS)",
    "☐ Length / type of path",
    "☐ Elevator / stairs / freight elevator. DIMENSIONS",
    "☐ Type of floor. Do we need protection?",
    "☐ Narrowest pinch point: doorways, ceiling",
    "     obstructions (signage, utilities), tight turns",
    "☐ Dollies, A-frames, forklift",
  ].join("\n"),
  [
    "SITE",
    "☐ Type (museum, residential, construction, etc)",
    "☐ Condition",
    "☐ All relevant measurements (separate sheets)",
    "☐ Moldings (base, crown, doors/windows). Dimensions",
    "☐ Types of walls. Wood backed?",
    "☐ Floor, and floor type",
    "☐ Wall attachments (switches, cameras, thermostats)",
    "☐ Ceiling details (lighting, fire sensors, soffits,",
    "     utilities)",
    "☐ Garbage disposal situation",
    "☐ On site storage",
    "☐ Power sources, locations, type",
    "☐ Messy work options",
    "☐ Work hours",
    "☐ Other trades we need to be aware of",
    "☐ Union requirements",
    "☐ Inside / outside (weather concerns)",
    "☐ Security / check-in concerns",
    "",
    "ANY OTHER IMPORTANT CONSIDERATIONS",
    "OR CONSTRAINTS?",
  ].join("\n"),
];

let seq = 0;
const id = (s: string) => `npjb-${s}-${++seq}`;

export const buildNpJobBook = (
  api: ExcalidrawImperativeAPI,
  settings: BoardSettings,
) => {
  seq = 0;
  const { width: W, height: H } = paperPx("a3", "landscape");
  const GAP = 240;
  const ROW_GAP = 460;

  // the table of contents is the live one: it lists the sheets as they are
  ROWS[0].sheets[1].items = [{ kind: "contents", x: 60, y: 50, w: 980 }];
  ROWS[4].sheets[6].items = [
    { kind: "text", x: 60, y: 50, text: SITE_VISIT_CHECKLIST[0], size: 24 },
    { kind: "text", x: 820, y: 50, text: SITE_VISIT_CHECKLIST[1], size: 24 },
  ];

  const skeletons: any[] = [];
  const contents: { frameId: string; x: number; y: number; w: number }[] = [];
  const tables: {
    frameId: string;
    x: number;
    y: number;
    data: ReturnType<typeof tableFrom>;
  }[] = [];

  ROWS.forEach((row, ri) => {
    const y0 = ri * (H + ROW_GAP);

    row.sheets.forEach((spec, si) => {
      const fx = si * (W + GAP);
      const fy = y0;
      const frameId = id("sheet");
      const children: string[] = [];
      const push = (el: any) => {
        children.push(el.id);
        skeletons.push(el);
      };

      for (const item of spec.items ?? []) {
        if (item.kind === "text") {
          push({
            type: "text",
            id: id("text"),
            x: fx + item.x,
            y: fy + item.y,
            text: item.text,
            fontSize: item.size,
            fontFamily: FONT_FAMILY.Helvetica,
            strokeColor: INK,
          });
        } else if (item.kind === "box") {
          push({
            type: "rectangle",
            id: id("box"),
            x: fx + item.x,
            y: fy + item.y,
            width: item.w,
            height: item.h,
            strokeColor: INK,
            strokeStyle: "dashed",
            strokeWidth: 2,
            backgroundColor: "transparent",
            roughness: 0,
            roundness: null,
            label: {
              text: item.label,
              fontSize: item.size ?? 40,
              fontFamily: FONT_FAMILY.Helvetica,
              strokeColor: INK,
            },
          });
        } else if (item.kind === "table") {
          if (item.caption) {
            push({
              type: "text",
              id: id("caption"),
              x: fx + item.x,
              y: fy + item.y - 40,
              text: item.caption,
              fontSize: 20,
              fontFamily: FONT_FAMILY.Helvetica,
              strokeColor: "#868e96",
            });
          }
          tables.push({
            frameId,
            x: fx + item.x,
            y: fy + item.y,
            data: tableFrom(item.columns, item.rows),
          });
        } else if (item.kind === "contents") {
          contents.push({ frameId, x: fx + item.x, y: fy + item.y, w: item.w });
        } else if (item.kind === "chart") {
          // who answers to whom: LV → LMI → NP, and NP on to the trades
          const node = (key: string, text: string, ny: number) => {
            const nid = id(key);
            push({
              type: "rectangle",
              id: nid,
              x: fx + 150,
              y: fy + ny,
              width: 280,
              height: 130,
              strokeColor: "transparent",
              backgroundColor: "transparent",
              roughness: 0,
              roundness: null,
              label: {
                text,
                fontSize: 84,
                fontFamily: FONT_FAMILY.Helvetica,
                strokeColor: INK,
              },
            });
            return nid;
          };
          const lv = node("lv", "LV", 110);
          const lmi = node("lmi", "LMI", 400);
          const np = node("np", "NP", 690);
          const arrow = (from: string, to: string, x: number, y: number) =>
            push({
              type: "arrow",
              id: id("arrow"),
              x,
              y,
              width: 0,
              height: 150,
              strokeColor: INK,
              strokeWidth: 2,
              roughness: 0,
              roundness: { type: 2 },
              start: { id: from },
              end: { id: to },
            });
          arrow(lv, lmi, fx + 290, fy + 245);
          arrow(lmi, np, fx + 290, fy + 535);
          for (const dx of [-220, 300]) {
            push({
              type: "arrow",
              id: id("arrow"),
              x: fx + 290,
              y: fy + 825,
              width: dx,
              height: 180,
              points: [
                [0, 0],
                [dx, 180],
              ],
              strokeColor: INK,
              strokeWidth: 2,
              roughness: 0,
              roundness: { type: 2 },
              start: { id: np },
            });
          }
        }
      }

      const data: SheetData = {
        // pages are numbered for it, from its place in the set
        number: "",
        order: si,
        discipline: row.phase,
        status: "draft",
        revision: "0",
        issued: "",
        titleBlock: true,
      };
      skeletons.push({
        type: "frame",
        id: frameId,
        children,
        x: fx,
        y: fy,
        width: W,
        height: H,
        name: spec.title,
        customData: {
          sheet: data,
          sheetColor: sheetColor(data, settings.colorBy),
          sheetNumber: data.number,
        },
      });
    });
  });

  const built = convertToExcalidrawElements(skeletons, {
    regenerateIds: false,
  });
  const anchors: ExcalidrawElement[] = [
    ...tables.map((t) => tableAnchor(t.data, t.x, t.y, t.frameId)),
    ...contents.map((c) => tocAnchor(c.x, c.y, c.w, c.frameId)),
  ];
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...built, ...anchors],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  syncTables(api);
  syncTocs(api);
  window.setTimeout(() => {
    api.setViewport({
      target: api.getSceneElements(),
      fit: "contain",
      animation: false,
      offsets: viewportOffsets(),
    });
  }, 50);
};
