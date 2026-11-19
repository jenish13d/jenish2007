/** CSV cell escaping, including spreadsheet formula injection (=, +, -, @). */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  const isNumber = typeof value === "number" || typeof value === "bigint" || /^-?\d+(\.\d+)?$/.test(text);
  if (!isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
