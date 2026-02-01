import type { DesignData } from "../types";

export function exportToJSON(data: DesignData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `craftcut-design-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToCSV(
  pieces: { label: string; width: number; height: number; qty: number }[],
): void {
  const headers = ["Label", "Width (mm)", "Height (mm)", "Quantity"];
  const rows = pieces.map((p) => [p.label, p.width, p.height, p.qty].join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `craftcut-cutlist-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromJSON(file: File): Promise<DesignData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // Basic validation
        if (!data.version || !data.settings || !data.panels) {
          throw new Error("Invalid CraftCut file format");
        }
        resolve(data as DesignData);
      } catch (err) {
        reject(
          new Error(
            "Failed to parse file. Make sure it's a valid CraftCut JSON file.",
          ),
        );
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
