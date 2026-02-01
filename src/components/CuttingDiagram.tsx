import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { optimizeCuts } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";

const DIAGRAM_WIDTH = 400;
const DIAGRAM_HEIGHT = 200;

const PIECE_COLORS = [
  "#93c5fd",
  "#86efac",
  "#fcd34d",
  "#fca5a5",
  "#c4b5fd",
  "#fdba74",
  "#67e8f9",
  "#f9a8d4",
  "#a5b4fc",
  "#d9f99d",
];

export default function CuttingDiagram() {
  const { panels, settings } = useDesignStore();

  const result = useMemo(() => {
    return optimizeCuts(panels, settings.sheetWidth, settings.sheetHeight);
  }, [panels, settings.sheetWidth, settings.sheetHeight]);

  if (panels.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Add panels to see the cutting diagram
      </p>
    );
  }

  const scale =
    Math.min(
      DIAGRAM_WIDTH / settings.sheetWidth,
      DIAGRAM_HEIGHT / settings.sheetHeight,
    ) * 0.95;

  const scaledSheetWidth = settings.sheetWidth * scale;
  const scaledSheetHeight = settings.sheetHeight * scale;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            Sheets needed:{" "}
            <strong className="text-gray-800">{result.totalSheets}</strong>
          </span>
          <span>
            Material waste:{" "}
            <strong className="text-gray-800">{result.totalWaste}%</strong>
          </span>
        </div>
      </div>

      {/* Unplaced pieces warning */}
      {result.unplacedPieces.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle
            className="text-amber-500 flex-shrink-0 mt-0.5"
            size={16}
          />
          <div className="text-sm">
            <p className="font-medium text-amber-800">
              Some pieces are too large
            </p>
            <p className="text-amber-700">
              {result.unplacedPieces.map((p) => p.label).join(", ")} won't fit
              on a {settings.sheetWidth}×{settings.sheetHeight}mm sheet.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4 overflow-x-auto">
        {result.sheets.map((sheet, sheetIndex) => (
          <div key={sheet.id} className="inline-block">
            <div className="text-xs text-gray-500 mb-1">
              Sheet {sheetIndex + 1} — {100 - sheet.wastePercent}% used
            </div>
            <svg
              width={scaledSheetWidth + 2}
              height={scaledSheetHeight + 2}
              className="border border-gray-300 bg-gray-100"
            >
              {/* Sheet background */}
              <rect
                x={1}
                y={1}
                width={scaledSheetWidth}
                height={scaledSheetHeight}
                fill="#f3f4f6"
                stroke="#d1d5db"
                strokeWidth={1}
              />

              {/* Placed pieces */}
              {sheet.placements.map((placement, pieceIndex) => {
                const x = placement.x * scale + 1;
                const y = placement.y * scale + 1;
                const w = placement.width * scale;
                const h = placement.height * scale;
                const color = PIECE_COLORS[pieceIndex % PIECE_COLORS.length];

                return (
                  <g key={placement.id}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={color}
                      stroke="#64748b"
                      strokeWidth={1}
                    />
                    {/* Label if piece is big enough */}
                    {w > 40 && h > 20 && (
                      <text
                        x={x + w / 2}
                        y={y + h / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.min(10, w / 8)}
                        fill="#1f2937"
                      >
                        {placement.label.length > 12
                          ? placement.label.slice(0, 10) + "..."
                          : placement.label}
                      </text>
                    )}
                    {/* Dimensions if piece is big enough */}
                    {w > 50 && h > 35 && (
                      <text
                        x={x + w / 2}
                        y={y + h / 2 + 10}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={8}
                        fill="#6b7280"
                      >
                        {placement.width}×{placement.height}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
      </div>

      {/* Sheet size info */}
      <div className="mt-3 text-xs text-gray-400">
        Sheet size: {settings.sheetWidth} × {settings.sheetHeight} mm
      </div>
    </div>
  );
}
