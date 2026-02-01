import type { OptimizationResult, Panel, Placement, Sheet } from "../types";

interface Piece {
  id: string;
  label: string;
  width: number;
  height: number;
  sourceId: string;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * First-Fit Decreasing bin-packing algorithm with Guillotine cutting
 */
export function optimizeCuts(
  panels: Panel[],
  sheetWidth: number,
  sheetHeight: number,
): OptimizationResult {
  if (panels.length === 0) {
    return {
      sheets: [],
      totalSheets: 0,
      totalWaste: 0,
      unplacedPieces: [],
    };
  }

  // Expand panels by quantity
  const pieces: Piece[] = [];
  let pieceIndex = 0;
  for (const panel of panels) {
    for (let i = 0; i < panel.quantity; i++) {
      pieces.push({
        id: `${panel.id}_${i}`,
        label: panel.quantity > 1 ? `${panel.label} (${i + 1})` : panel.label,
        width: panel.width,
        height: panel.height,
        sourceId: panel.id,
      });
      pieceIndex++;
    }
  }

  // Sort by area descending (largest first)
  pieces.sort((a, b) => b.width * b.height - a.width * a.height);

  const sheets: Sheet[] = [];
  const unplacedPieces: Panel[] = [];
  const sheetArea = sheetWidth * sheetHeight;

  for (const piece of pieces) {
    // Check if piece can fit at all
    const canFitNormal =
      piece.width <= sheetWidth && piece.height <= sheetHeight;
    const canFitRotated =
      piece.height <= sheetWidth && piece.width <= sheetHeight;

    if (!canFitNormal && !canFitRotated) {
      // Piece is too large for any sheet
      const existing = unplacedPieces.find((p) => p.id === piece.sourceId);
      if (!existing) {
        const original = panels.find((p) => p.id === piece.sourceId);
        if (original) unplacedPieces.push(original);
      }
      continue;
    }

    let placed = false;

    // Try to place in existing sheets
    for (const sheet of sheets) {
      const position = findPosition(sheet, piece, sheetWidth, sheetHeight);
      if (position) {
        sheet.placements.push({
          id: piece.id,
          label: piece.label,
          x: position.x,
          y: position.y,
          width: position.rotated ? piece.height : piece.width,
          height: position.rotated ? piece.width : piece.height,
          rotated: position.rotated,
          sourceId: piece.sourceId,
        });
        sheet.usedArea += piece.width * piece.height;
        sheet.wastePercent = Math.round((1 - sheet.usedArea / sheetArea) * 100);
        placed = true;
        break;
      }
    }

    // Create new sheet if needed
    if (!placed) {
      const newSheet: Sheet = {
        id: `sheet_${sheets.length + 1}`,
        placements: [],
        usedArea: 0,
        wastePercent: 100,
      };

      const rotated = !canFitNormal && canFitRotated;
      newSheet.placements.push({
        id: piece.id,
        label: piece.label,
        x: 0,
        y: 0,
        width: rotated ? piece.height : piece.width,
        height: rotated ? piece.width : piece.height,
        rotated,
        sourceId: piece.sourceId,
      });
      newSheet.usedArea = piece.width * piece.height;
      newSheet.wastePercent = Math.round(
        (1 - newSheet.usedArea / sheetArea) * 100,
      );
      sheets.push(newSheet);
    }
  }

  const totalUsedArea = sheets.reduce((sum, s) => sum + s.usedArea, 0);
  const totalSheetArea = sheets.length * sheetArea;
  const totalWaste =
    totalSheetArea > 0
      ? Math.round((1 - totalUsedArea / totalSheetArea) * 100)
      : 0;

  return {
    sheets,
    totalSheets: sheets.length,
    totalWaste,
    unplacedPieces,
  };
}

function findPosition(
  sheet: Sheet,
  piece: Piece,
  sheetWidth: number,
  sheetHeight: number,
): { x: number; y: number; rotated: boolean } | null {
  // Get free rectangles using simple shelf algorithm
  const freeRects = getFreeRectangles(sheet, sheetWidth, sheetHeight);

  // Try each free rectangle
  for (const rect of freeRects) {
    // Try normal orientation
    if (piece.width <= rect.width && piece.height <= rect.height) {
      return { x: rect.x, y: rect.y, rotated: false };
    }
    // Try rotated
    if (piece.height <= rect.width && piece.width <= rect.height) {
      return { x: rect.x, y: rect.y, rotated: true };
    }
  }

  return null;
}

function getFreeRectangles(
  sheet: Sheet,
  sheetWidth: number,
  sheetHeight: number,
): FreeRect[] {
  if (sheet.placements.length === 0) {
    return [{ x: 0, y: 0, width: sheetWidth, height: sheetHeight }];
  }

  // Simple approach: find empty space to the right and below existing placements
  const freeRects: FreeRect[] = [];

  // Calculate bounding box of all placements
  let maxX = 0;
  let maxY = 0;

  for (const p of sheet.placements) {
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }

  // Space to the right of all placements
  if (maxX < sheetWidth) {
    freeRects.push({
      x: maxX,
      y: 0,
      width: sheetWidth - maxX,
      height: sheetHeight,
    });
  }

  // Space below all placements
  if (maxY < sheetHeight) {
    freeRects.push({
      x: 0,
      y: maxY,
      width: maxX, // Only up to the used width
      height: sheetHeight - maxY,
    });
  }

  // Also try to find gaps between placements (shelf-based)
  // Group placements by Y position (shelves)
  const shelves = new Map<number, Placement[]>();
  for (const p of sheet.placements) {
    const key = p.y;
    if (!shelves.has(key)) shelves.set(key, []);
    shelves.get(key)!.push(p);
  }

  // For each shelf, find space at the end
  for (const [y, placements] of shelves) {
    placements.sort((a, b) => a.x - b.x);
    const lastPlacement = placements[placements.length - 1];
    const endX = lastPlacement.x + lastPlacement.width;
    const shelfHeight = Math.max(...placements.map((p) => p.height));

    if (endX < maxX) {
      freeRects.push({
        x: endX,
        y,
        width: maxX - endX,
        height: shelfHeight,
      });
    }
  }

  // Sort by area descending to prefer larger spaces
  freeRects.sort((a, b) => b.width * b.height - a.width * a.height);

  return freeRects;
}

export function calculateCutList(panels: Panel[]): {
  pieces: {
    label: string;
    width: number;
    height: number;
    qty: number;
    area: number;
  }[];
  totalPieces: number;
  totalArea: number;
} {
  const pieces = panels.map((p) => ({
    label: p.label,
    width: p.width,
    height: p.height,
    qty: p.quantity,
    area: (p.width * p.height * p.quantity) / 1000000, // Convert to m²
  }));

  const totalPieces = pieces.reduce((sum, p) => sum + p.qty, 0);
  const totalArea = pieces.reduce((sum, p) => sum + p.area, 0);

  return { pieces, totalPieces, totalArea };
}
