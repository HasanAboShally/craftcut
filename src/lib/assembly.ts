/**
 * Assembly Instruction Generator
 * 
 * Analyzes panel positions and generates logical assembly order
 * using spatial relationships and furniture assembly heuristics.
 */

import toposort from "toposort";
import type { Panel, Settings } from "../types";

// Connection between two panels
export interface PanelConnection {
  panelA: string;
  panelB: string;
  type: "perpendicular" | "parallel" | "adjacent";
  face: "top" | "bottom" | "left" | "right" | "front" | "back";
}

// Assembly step
export interface AssemblyStep {
  stepNumber: number;
  panelId: string;
  panelLabel: string;
  action: string;
  instruction: string;
  connectsTo: string[]; // Panel IDs this step connects to
  cumulativePanels: string[]; // All panels assembled so far including this one
}

// Get true dimensions based on orientation
function getTrueDimensions(panel: Panel, thickness: number): { width: number; height: number; depth: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal": 
      return { width: panel.width, height: thickness, depth: panel.depth || 400 };
    case "vertical": 
      return { width: thickness, height: panel.height, depth: panel.depth || 400 };
    case "back": 
      return { width: panel.width, height: panel.height, depth: thickness };
    default: 
      return { width: panel.width, height: thickness, depth: panel.depth || 400 };
  }
}

// Get panel bounding box in 3D space
function getPanelBounds(panel: Panel, thickness: number, furnitureDepth: number) {
  const dims = getTrueDimensions(panel, thickness);
  const orientation = panel.orientation || "horizontal";
  const panelDepth = panel.depth || furnitureDepth;
  const zAlign = panel.zAlign || "front";
  
  let z: number;
  if (orientation === "back") {
    z = furnitureDepth - thickness;
  } else {
    switch (zAlign) {
      case "front": z = 0; break;
      case "back": z = furnitureDepth - panelDepth; break;
      case "center": z = (furnitureDepth - panelDepth) / 2; break;
      default: z = 0;
    }
  }
  
  return {
    minX: panel.x,
    maxX: panel.x + dims.width,
    minY: panel.y,
    maxY: panel.y + dims.height,
    minZ: z,
    maxZ: z + (orientation === "back" ? thickness : panelDepth),
    orientation,
  };
}

// Check if two panels are touching/connected
function panelsConnect(
  panelA: Panel, 
  panelB: Panel, 
  thickness: number, 
  furnitureDepth: number
): PanelConnection | null {
  const boundsA = getPanelBounds(panelA, thickness, furnitureDepth);
  const boundsB = getPanelBounds(panelB, thickness, furnitureDepth);
  
  const tolerance = 2; // mm tolerance for connection detection
  
  // Check for perpendicular connections (most common in furniture)
  // Vertical panel touching horizontal panel
  if (boundsA.orientation === "vertical" && boundsB.orientation === "horizontal") {
    // Check if vertical's bottom touches horizontal's top
    if (Math.abs(boundsA.minY - boundsB.maxY) <= tolerance) {
      // Check X overlap
      if (boundsA.minX < boundsB.maxX && boundsA.maxX > boundsB.minX) {
        return { panelA: panelA.id, panelB: panelB.id, type: "perpendicular", face: "bottom" };
      }
    }
    // Check if vertical sits on horizontal
    if (Math.abs(boundsA.minY - boundsB.minY) <= tolerance || Math.abs(boundsA.minY - boundsB.maxY) <= tolerance) {
      if (boundsA.minX < boundsB.maxX && boundsA.maxX > boundsB.minX) {
        return { panelA: panelA.id, panelB: panelB.id, type: "perpendicular", face: "bottom" };
      }
    }
  }
  
  if (boundsA.orientation === "horizontal" && boundsB.orientation === "vertical") {
    // Check if horizontal rests on vertical's edges
    if (Math.abs(boundsA.minX - boundsB.minX) <= tolerance || Math.abs(boundsA.minX - boundsB.maxX) <= tolerance) {
      // Check Y overlap
      if (boundsA.minY < boundsB.maxY && boundsA.maxY > boundsB.minY) {
        return { panelA: panelA.id, panelB: panelB.id, type: "perpendicular", face: "left" };
      }
    }
    if (Math.abs(boundsA.maxX - boundsB.minX) <= tolerance || Math.abs(boundsA.maxX - boundsB.maxX) <= tolerance) {
      if (boundsA.minY < boundsB.maxY && boundsA.maxY > boundsB.minY) {
        return { panelA: panelA.id, panelB: panelB.id, type: "perpendicular", face: "right" };
      }
    }
  }
  
  // Check horizontal-to-horizontal (shelves between sides)
  if (boundsA.orientation === "horizontal" && boundsB.orientation === "horizontal") {
    // Adjacent horizontally
    if (Math.abs(boundsA.maxX - boundsB.minX) <= tolerance || Math.abs(boundsA.minX - boundsB.maxX) <= tolerance) {
      return { panelA: panelA.id, panelB: panelB.id, type: "adjacent", face: "left" };
    }
  }
  
  // Check vertical-to-vertical
  if (boundsA.orientation === "vertical" && boundsB.orientation === "vertical") {
    // Adjacent vertically at same Y
    if (Math.abs(boundsA.minY - boundsB.minY) <= tolerance) {
      return { panelA: panelA.id, panelB: panelB.id, type: "adjacent", face: "bottom" };
    }
  }
  
  // Back panel connections
  if (boundsA.orientation === "back" || boundsB.orientation === "back") {
    const back = boundsA.orientation === "back" ? panelA : panelB;
    const other = boundsA.orientation === "back" ? panelB : panelA;
    const backBounds = boundsA.orientation === "back" ? boundsA : boundsB;
    const otherBounds = boundsA.orientation === "back" ? boundsB : boundsA;
    
    // Back panel touches the back of other panels
    if (Math.abs(backBounds.minZ - otherBounds.maxZ) <= tolerance) {
      // Check XY overlap
      if (backBounds.minX < otherBounds.maxX && backBounds.maxX > otherBounds.minX &&
          backBounds.minY < otherBounds.maxY && backBounds.maxY > otherBounds.minY) {
        return { panelA: back.id, panelB: other.id, type: "parallel", face: "back" };
      }
    }
  }
  
  return null;
}

// Detect all connections between panels
export function detectConnections(panels: Panel[], settings: Settings): PanelConnection[] {
  const connections: PanelConnection[] = [];
  const furnitureDepth = settings.furnitureDepth || 400;
  
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const connection = panelsConnect(panels[i], panels[j], settings.thickness, furnitureDepth);
      if (connection) {
        connections.push(connection);
      }
    }
  }
  
  return connections;
}

// Calculate assembly priority based on heuristics
function getAssemblyPriority(panel: Panel, thickness: number, allPanels: Panel[]): number {
  const orientation = panel.orientation || "horizontal";
  
  // Find min Y across all panels (floor level)
  const minY = Math.min(...allPanels.map(p => p.y));
  
  // Priority factors (lower = assemble earlier)
  let priority = 0;
  
  // 1. Foundation pieces (at floor level) come first
  if (Math.abs(panel.y - minY) < thickness * 2) {
    priority -= 100;
  }
  
  // 2. Vertical panels (structural) before horizontal (shelves)
  if (orientation === "vertical") {
    priority -= 50;
  } else if (orientation === "horizontal") {
    priority += 10;
  }
  
  // 3. Back panels always last
  if (orientation === "back") {
    priority += 200;
  }
  
  // 4. Lower panels before higher (build bottom-up)
  priority += panel.y / 10;
  
  // 5. Outer panels before inner (left/right sides first)
  const minX = Math.min(...allPanels.map(p => p.x));
  const maxX = Math.max(...allPanels.map(p => {
    const dims = getTrueDimensions(p, thickness);
    return p.x + dims.width;
  }));
  const centerX = (minX + maxX) / 2;
  const distFromCenter = Math.abs(panel.x - centerX);
  priority -= distFromCenter / 20; // Favor outer panels
  
  return priority;
}

// Build dependency graph from connections and priorities
function buildDependencyGraph(
  panels: Panel[], 
  connections: PanelConnection[],
  settings: Settings
): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  const panelMap = new Map(panels.map(p => [p.id, p]));
  
  // Get priorities for all panels
  const priorities = new Map<string, number>();
  panels.forEach(p => {
    priorities.set(p.id, getAssemblyPriority(p, settings.thickness, panels));
  });
  
  // For each connection, determine which panel should come first
  connections.forEach(conn => {
    const panelA = panelMap.get(conn.panelA);
    const panelB = panelMap.get(conn.panelB);
    if (!panelA || !panelB) return;
    
    const prioA = priorities.get(conn.panelA) || 0;
    const prioB = priorities.get(conn.panelB) || 0;
    
    // Edge format: [dependent, dependency] meaning dependent requires dependency first
    if (prioA < prioB) {
      // A comes first, so B depends on A
      edges.push([conn.panelB, conn.panelA]);
    } else if (prioB < prioA) {
      // B comes first, so A depends on B
      edges.push([conn.panelA, conn.panelB]);
    }
    // If equal priority, use additional heuristics
    else {
      // Vertical panels support horizontal ones
      const orientA = panelA.orientation || "horizontal";
      const orientB = panelB.orientation || "horizontal";
      
      if (orientA === "vertical" && orientB === "horizontal") {
        edges.push([conn.panelB, conn.panelA]); // horizontal depends on vertical
      } else if (orientB === "vertical" && orientA === "horizontal") {
        edges.push([conn.panelA, conn.panelB]); // horizontal depends on vertical
      }
      // Back panels depend on everything else
      else if (orientA === "back") {
        edges.push([conn.panelA, conn.panelB]);
      } else if (orientB === "back") {
        edges.push([conn.panelB, conn.panelA]);
      }
    }
  });
  
  return edges;
}

// Generate action verb based on panel orientation
function getActionVerb(orientation: string): string {
  switch (orientation) {
    case "horizontal": return "Place";
    case "vertical": return "Attach";
    case "back": return "Secure";
    default: return "Install";
  }
}

// Generate instruction text
function generateInstructionText(
  panel: Panel,
  connectsTo: Panel[],
  isFirst: boolean,
  thickness: number
): string {
  const orientation = panel.orientation || "horizontal";
  const label = panel.label || `Panel ${panel.id.slice(0, 4)}`;
  
  if (isFirst) {
    if (orientation === "horizontal") {
      return `Place the ${label} on a flat, stable surface. This will serve as the foundation.`;
    } else {
      return `Start with the ${label}. Lay it flat on a stable surface.`;
    }
  }
  
  if (connectsTo.length === 0) {
    return `Position the ${label} according to the design.`;
  }
  
  const connectionNames = connectsTo.map(p => p.label || `Panel ${p.id.slice(0, 4)}`);
  
  if (orientation === "vertical") {
    if (connectionNames.length === 1) {
      return `Attach the ${label} perpendicular to the ${connectionNames[0]}.`;
    } else {
      return `Attach the ${label} between the ${connectionNames.slice(0, -1).join(", ")} and ${connectionNames.slice(-1)}.`;
    }
  }
  
  if (orientation === "horizontal") {
    if (connectionNames.length === 1) {
      return `Rest the ${label} on top of the ${connectionNames[0]}.`;
    } else if (connectionNames.length === 2) {
      return `Insert the ${label} between the ${connectionNames[0]} and ${connectionNames[1]}.`;
    } else {
      return `Position the ${label} connecting to ${connectionNames.join(", ")}.`;
    }
  }
  
  if (orientation === "back") {
    return `Attach the ${label} to the back of the assembled frame to add rigidity.`;
  }
  
  return `Install the ${label}.`;
}

// Main function: Generate assembly steps
export function generateAssemblySteps(panels: Panel[], settings: Settings): AssemblyStep[] {
  if (panels.length === 0) return [];
  
  // 1. Detect connections
  const connections = detectConnections(panels, settings);
  
  // 2. Build dependency graph
  const edges = buildDependencyGraph(panels, connections, settings);
  
  // 3. Get all panel IDs and add isolated panels
  const allPanelIds = panels.map(p => p.id);
  
  // 4. Topological sort
  let orderedIds: string[];
  try {
    // toposort returns in reverse order (dependencies first)
    orderedIds = toposort.array(allPanelIds, edges);
  } catch (e) {
    // If there's a cycle, fall back to priority-based sorting
    console.warn("Cycle detected in assembly graph, using priority sorting");
    const priorities = new Map<string, number>();
    panels.forEach(p => {
      priorities.set(p.id, getAssemblyPriority(p, settings.thickness, panels));
    });
    orderedIds = [...allPanelIds].sort((a, b) => 
      (priorities.get(a) || 0) - (priorities.get(b) || 0)
    );
  }
  
  // 5. Generate steps
  const panelMap = new Map(panels.map(p => [p.id, p]));
  const assembledSoFar: string[] = [];
  
  return orderedIds.map((panelId, index) => {
    const panel = panelMap.get(panelId);
    if (!panel) {
      return null;
    }
    
    // Find which already-assembled panels this one connects to
    const connectsToIds = connections
      .filter(c => 
        (c.panelA === panelId && assembledSoFar.includes(c.panelB)) ||
        (c.panelB === panelId && assembledSoFar.includes(c.panelA))
      )
      .map(c => c.panelA === panelId ? c.panelB : c.panelA);
    
    const connectsToPanels = connectsToIds
      .map(id => panelMap.get(id))
      .filter((p): p is Panel => p !== undefined);
    
    assembledSoFar.push(panelId);
    
    const orientation = panel.orientation || "horizontal";
    
    return {
      stepNumber: index + 1,
      panelId,
      panelLabel: panel.label || `Panel ${panelId.slice(0, 4)}`,
      action: getActionVerb(orientation),
      instruction: generateInstructionText(panel, connectsToPanels, index === 0, settings.thickness),
      connectsTo: connectsToIds,
      cumulativePanels: [...assembledSoFar],
    };
  }).filter((step): step is AssemblyStep => step !== null);
}

// Get summary of assembly
export function getAssemblySummary(steps: AssemblyStep[]): {
  totalSteps: number;
  estimatedTime: string;
} {
  const totalSteps = steps.length;
  // Rough estimate: 2-5 minutes per panel depending on complexity
  const minutesPerPanel = 3;
  const totalMinutes = totalSteps * minutesPerPanel;
  
  let estimatedTime: string;
  if (totalMinutes < 60) {
    estimatedTime = `${totalMinutes} minutes`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    estimatedTime = mins > 0 ? `${hours}h ${mins}min` : `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  
  return { totalSteps, estimatedTime };
}
