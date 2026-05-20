import type { AllowanceSnapshot, User } from "@/lib/types";
import { MODE_DEFAULTS } from "@/lib/utils/allowance-calculator";
import type { TransportMode, SnapshotModeConfig } from "@/lib/utils/allowance-calculator";
import { format } from "date-fns";

export interface ExportAllowanceOptions {
  snapshots: AllowanceSnapshot[];
  employees: User[];
  month: string;
  payPeriodLabel: string;
}

function getEffCfg(mode: TransportMode | "wfh", mc?: SnapshotModeConfig | null) {
  const def = { ...MODE_DEFAULTS[mode] };
  const ovr = mc?.[mode as keyof SnapshotModeConfig];
  if (!ovr) return def;
  return {
    unit_price: ovr.unit_price ?? def.unit_price,
    gas_mileage: ovr.gas_mileage ?? def.gas_mileage,
    refund_pct: ovr.refund_pct ?? def.refund_pct,
  };
}

function r2(n: number) { return Math.round(n * 100) / 100; }

interface ModeRow {
  label: string;
  rides: number | null;
  unit_price: number;
  distance: number | null;
  gas_mileage: number | null;
  gas_required: number | null;
  days: number;
  amount: number;
  pct: number;
  total: number;
  highlight: boolean;
}

function computeModeRows(snap: AllowanceSnapshot): ModeRow[] {
  const mc = snap.mode_config as SnapshotModeConfig | null | undefined;
  const declared = snap.declared_mode as TransportMode;
  const ut = Math.min(snap.undertime_days, snap.days_worked);
  const eff = snap.days_worked - ut + ut * 0.5;
  const wfh = Math.min(Math.max(0, snap.wfh_days), 8);
  const walkAllowed = snap.distance_km <= 2.4 && !snap.owns_vehicle;

  // Car
  const carCfg = getEffCfg("car", mc);
  const carGM = carCfg.gas_mileage ?? 8;
  const carGR = snap.distance_km / carGM;
  const carDays = declared === "car" ? eff : 0;
  const carAmt = r2(carCfg.unit_price * carGR * carDays);
  const car: ModeRow = {
    label: "Car", rides: null,
    unit_price: carCfg.unit_price, distance: snap.distance_km,
    gas_mileage: carGM, gas_required: carGR,
    days: carDays, amount: carAmt, pct: carCfg.refund_pct,
    total: r2(carAmt * carCfg.refund_pct),
    highlight: carDays > 0 && carAmt > 0,
  };

  // Motorcycle
  const motoCfg = getEffCfg("motorcycle", mc);
  const motoGM = motoCfg.gas_mileage ?? 25;
  const motoGR = snap.distance_km / motoGM;
  const motoDays = declared === "motorcycle" ? eff : 0;
  const motoAmt = r2(motoCfg.unit_price * motoGR * motoDays);
  const moto: ModeRow = {
    label: "Motorcycle", rides: null,
    unit_price: motoCfg.unit_price, distance: snap.distance_km,
    gas_mileage: motoGM, gas_required: motoGR,
    days: motoDays, amount: motoAmt, pct: motoCfg.refund_pct,
    total: r2(motoAmt * motoCfg.refund_pct),
    highlight: motoDays > 0 && motoAmt > 0,
  };

  // Walk
  const walkCfg = getEffCfg("walk", mc);
  const walkDays = declared === "walk" && walkAllowed ? eff : 0;
  const walkAmt = r2(walkCfg.unit_price * snap.distance_km * walkDays);
  const walk: ModeRow = {
    label: "Walk", rides: null,
    unit_price: walkCfg.unit_price, distance: snap.distance_km,
    gas_mileage: null, gas_required: null,
    days: walkDays, amount: walkAmt, pct: walkCfg.refund_pct,
    total: r2(walkAmt * walkCfg.refund_pct),
    highlight: walkDays > 0 && walkAmt > 0,
  };

  // Jeep
  const jeepCfg = getEffCfg("jeep", mc);
  const jeepPrimary = declared === "jeep";
  const jeepSecondary = !jeepPrimary && snap.jeep_rides > 0;
  const jeepDays = jeepPrimary ? eff : jeepSecondary ? snap.days_worked : 0;
  const jeepAmt = (jeepPrimary || jeepSecondary) ? r2(jeepCfg.unit_price * snap.jeep_rides * jeepDays) : 0;
  const jeep: ModeRow = {
    label: "Jeep",
    rides: (jeepPrimary || jeepSecondary) && snap.jeep_rides > 0 ? snap.jeep_rides : null,
    unit_price: jeepCfg.unit_price, distance: null,
    gas_mileage: null, gas_required: null,
    days: jeepDays, amount: jeepAmt, pct: jeepCfg.refund_pct,
    total: r2(jeepAmt * jeepCfg.refund_pct),
    highlight: jeepDays > 0 && jeepAmt > 0,
  };

  // Bus
  const busCfg = getEffCfg("bus", mc);
  const busPrimary = declared === "bus";
  const busSecondary = !busPrimary && snap.bus_rides > 0;
  const busDays = busPrimary ? eff : busSecondary ? snap.days_worked : 0;
  const busAmt = (busPrimary || busSecondary) ? r2(busCfg.unit_price * snap.bus_rides * busDays) : 0;
  const bus: ModeRow = {
    label: "Bus",
    rides: (busPrimary || busSecondary) && snap.bus_rides > 0 ? snap.bus_rides : null,
    unit_price: busCfg.unit_price, distance: null,
    gas_mileage: null, gas_required: null,
    days: busDays, amount: busAmt, pct: busCfg.refund_pct,
    total: r2(busAmt * busCfg.refund_pct),
    highlight: busDays > 0 && busAmt > 0,
  };

  // WFH
  const wfhCfg = getEffCfg("wfh", mc);
  const wfhAmt = r2(wfhCfg.unit_price * wfh);
  const wfhRow: ModeRow = {
    label: "WFH", rides: null,
    unit_price: wfhCfg.unit_price, distance: null,
    gas_mileage: null, gas_required: null,
    days: wfh, amount: wfhAmt, pct: wfhCfg.refund_pct,
    total: r2(wfhAmt * wfhCfg.refund_pct),
    highlight: wfh > 0 && wfhAmt > 0,
  };

  return [car, moto, walk, jeep, bus, wfhRow];
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-");
  return format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMMM yyyy").toUpperCase();
}

function safeSheetName(name: string): string {
  return name.replace(/[:\\/?\*\[\]]/g, "-").substring(0, 31);
}

const PHP = '"₱"#,##0.00';
const RED_M = { style: "medium" as const, color: { argb: "FFC00000" } };
const BLK_T = { style: "thin" as const, color: { argb: "FF000000" } };
const YELLOW_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFF00" } };
const GRAY_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF2F2F2" } };

const HEADERS = [
  "EMPLOYEE NAME", "MODE OF TRANSPO", "NO. OF\nRIDES",
  "UNIT PRICE\n(PHP)", "DISTANCE\n(KM)", "GAS\nMILEAGE",
  "GAS\nREQUIRED", "DAYS", "AMOUNT", "PERCENTAGE", "TOTAL", "TO BE PAID\n(by Ring)",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSheet(
  wb: any,
  sheetName: string,
  employees: User[],
  snapMap: Map<string, AllowanceSnapshot>,
  month: string,
  paymentDateStr: string | null,
  summary?: { withSnapshots: number; total: number; budget: number },
) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { width: 22 }, { width: 18 }, { width: 10 }, { width: 14 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 8 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 },
  ];

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 12);
  const tCell = ws.getRow(r).getCell(1);
  tCell.value = `RSD TRANSPORTATION ALLOWANCE — ${monthTitle(month)}`;
  tCell.font = { bold: true, size: 14 };
  tCell.alignment = { horizontal: "center", vertical: "middle" };
  tCell.fill = GRAY_FILL;
  ws.getRow(r).height = 28;
  r++;

  // Payment date
  ws.mergeCells(r, 1, r, 12);
  const pdCell = ws.getRow(r).getCell(1);
  pdCell.value = paymentDateStr ? `Payment Date: ${paymentDateStr}` : `Pay Period: ${monthTitle(month)}`;
  pdCell.font = { size: 11 };
  pdCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 20;
  r++;

  // Summary stats (All Employees sheet only)
  if (summary) {
    ws.mergeCells(r, 1, r, 5);
    const s1 = ws.getRow(r).getCell(1);
    s1.value = `Employees with Snapshots: ${summary.withSnapshots} / ${summary.total}`;
    s1.font = { bold: true, size: 11 };
    s1.alignment = { horizontal: "center", vertical: "middle" };
    s1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } };
    s1.border = { top: BLK_T, bottom: BLK_T, left: BLK_T, right: BLK_T };

    ws.mergeCells(r, 6, r, 12);
    const s2 = ws.getRow(r).getCell(6);
    s2.value = `Total Budget: ₱${summary.budget.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    s2.font = { bold: true, size: 12, color: { argb: "FF145A32" } };
    s2.alignment = { horizontal: "center", vertical: "middle" };
    s2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F5E3" } };
    s2.border = { top: BLK_T, bottom: BLK_T, left: BLK_T, right: BLK_T };
    ws.getRow(r).height = 24;
    r++;
  }

  // Spacer
  ws.getRow(r).height = 5;
  r++;

  // Header row
  const hRow = ws.getRow(r);
  hRow.height = 36;
  HEADERS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = GRAY_FILL;
    cell.border = { top: BLK_T, bottom: BLK_T, left: BLK_T, right: BLK_T };
  });
  const headerRow = r;
  r++;

  // Employee blocks
  const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name));

  for (const emp of sorted) {
    const snap = snapMap.get(emp.id);
    if (!snap) continue;

    const modeRows = computeModeRows(snap);
    const blockStart = r;
    const blockEnd = r + 5;

    for (let mIdx = 0; mIdx < 6; mIdx++) {
      const mr = modeRows[mIdx];
      const row = ws.getRow(blockStart + mIdx);
      row.height = 18;
      const isFirst = mIdx === 0;
      const isLast = mIdx === 5;

      // Apply borders + highlight fill to all 12 columns
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.border = {
          top: isFirst ? RED_M : BLK_T,
          bottom: isLast ? RED_M : BLK_T,
          left: c === 1 ? RED_M : BLK_T,
          right: c === 12 ? RED_M : BLK_T,
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        if (mr.highlight && c >= 2 && c <= 11) {
          cell.fill = YELLOW_FILL;
          cell.font = { bold: true };
        }
      }

      // B: Mode label
      row.getCell(2).value = mr.label;
      row.getCell(2).alignment = { horizontal: mr.highlight ? "center" : "left", vertical: "middle" };

      // C: No. of Rides (jeep/bus only when active)
      if (mr.rides !== null) {
        row.getCell(3).value = mr.rides;
        row.getCell(3).numFmt = "0";
      }

      // D: Unit Price
      row.getCell(4).value = mr.unit_price;
      row.getCell(4).numFmt = PHP;

      // E: Distance (car / motorcycle / walk)
      if (mr.distance !== null) {
        row.getCell(5).value = mr.distance;
        row.getCell(5).numFmt = "0.0#";
      }

      // F: Gas Mileage (car / motorcycle)
      if (mr.gas_mileage !== null) {
        row.getCell(6).value = mr.gas_mileage;
        row.getCell(6).numFmt = "0.0#";
      }

      // G: Gas Required = distance / gas_mileage (car / motorcycle)
      if (mr.gas_required !== null) {
        row.getCell(7).value = mr.gas_required;
        row.getCell(7).numFmt = "0.000";
      }

      // H: Days
      row.getCell(8).value = mr.days;
      row.getCell(8).numFmt = "0.0#";

      // I: Amount (before percentage)
      row.getCell(9).value = mr.amount;
      row.getCell(9).numFmt = PHP;

      // J: Percentage
      row.getCell(10).value = mr.pct;
      row.getCell(10).numFmt = "0%";

      // K: Total (= amount × percentage)
      row.getCell(11).value = mr.total;
      row.getCell(11).numFmt = PHP;
    }

    // Merge A across 6 rows
    ws.mergeCells(blockStart, 1, blockEnd, 1);
    const mA = ws.getRow(blockStart).getCell(1);
    mA.value = emp.name;
    mA.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    mA.border = { top: RED_M, bottom: RED_M, left: RED_M, right: BLK_T };

    // Merge L across 6 rows
    ws.mergeCells(blockStart, 12, blockEnd, 12);
    const mL = ws.getRow(blockStart).getCell(12);
    mL.value = snap.total_allowance;
    mL.numFmt = PHP;
    mL.font = { bold: true };
    mL.alignment = { horizontal: "center", vertical: "middle" };
    mL.border = { top: RED_M, bottom: RED_M, left: BLK_T, right: RED_M };

    r += 6;
  }

  // Freeze rows above data
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRow }];
}

export async function exportAllowanceToExcel({
  snapshots,
  employees,
  month,
}: ExportAllowanceOptions): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "RSD Attendance Manager";
  wb.created = new Date();

  const snapMap = new Map<string, AllowanceSnapshot>(
    snapshots.map((s) => [s.employee_id, s])
  );

  const [y, m] = month.split("-").map(Number);
  const nextMonth15 = new Date(y, m, 15); // month is 0-indexed, so `m` (already 1-based) = next month
  const paymentDateStr = format(nextMonth15, "MMMM d, yyyy");

  const totalBudget = snapshots.reduce((sum, s) => sum + s.total_allowance, 0);
  const empsWithSnaps = employees.filter((e) => snapMap.has(e.id));

  // All Employees sheet first (summary)
  await buildSheet(wb, "All Employees", empsWithSnaps, snapMap, month, paymentDateStr, {
    withSnapshots: snapshots.length,
    total: employees.length,
    budget: totalBudget,
  });

  // One sheet per department
  const deptMap = new Map<string, { name: string; employees: User[] }>();
  for (const emp of employees) {
    const dept = (emp as any).department;
    const key = dept?.id ?? "__none__";
    const name = dept?.name ?? "No Department";
    if (!deptMap.has(key)) deptMap.set(key, { name, employees: [] });
    deptMap.get(key)!.employees.push(emp);
  }

  const depts = Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  for (const dept of depts) {
    const deptEmps = dept.employees.filter((e) => snapMap.has(e.id));
    if (deptEmps.length === 0) continue;
    await buildSheet(wb, safeSheetName(dept.name), deptEmps, snapMap, month, paymentDateStr);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transportation-allowance-${month}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
