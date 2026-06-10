// Converts page-context JSON into compact Markdown (tables/lists) before it's
// sent to the AI — denser than raw JSON and easier for the model to scan.

export function formatContextAsMarkdown(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => formatSection(key, value))
    .filter(Boolean)
    .join("\n\n");
}

function formatSection(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  const title = titleCase(key);
  if (Array.isArray(value)) {
    if (value.length === 0) return `### ${title}\n(none)`;
    if (isArrayOfObjects(value)) return `### ${title}\n${arrayToTable(value)}`;
    return `### ${title}\n${value.map(formatCell).join(", ")}`;
  }
  if (typeof value === "object") {
    return `### ${title}\n${objectToList(value as Record<string, unknown>)}`;
  }
  return `### ${title}: ${formatCell(value)}`;
}

function objectToList(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      if (Array.isArray(v) && isArrayOfObjects(v) && v.length > 0) {
        return `**${titleCase(k)}**:\n${arrayToTable(v)}`;
      }
      if (Array.isArray(v)) {
        return `- **${titleCase(k)}**: ${v.length === 0 ? "(none)" : v.map(formatCell).join(", ")}`;
      }
      if (typeof v === "object") {
        return `**${titleCase(k)}**:\n${objectToList(v as Record<string, unknown>)}`;
      }
      return `- **${titleCase(k)}**: ${formatCell(v)}`;
    })
    .join("\n");
}

function arrayToTable(arr: Record<string, unknown>[]): string {
  const keys = Array.from(new Set(arr.flatMap((o) => Object.keys(o))));
  const header = `| ${keys.map(titleCase).join(" | ")} |`;
  const sep = `| ${keys.map(() => "---").join(" | ")} |`;
  const rows = arr.map((o) => `| ${keys.map((k) => formatCell(o[k])).join(" | ")} |`);
  return [header, sep, ...rows].join("\n");
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(formatCell).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function isArrayOfObjects(arr: unknown[]): arr is Record<string, unknown>[] {
  return arr.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
}

function titleCase(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}
