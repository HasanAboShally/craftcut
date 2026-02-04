/**
 * IKEA-style Assembly Step Illustration
 *
 * Uses React Three Fiber to render cumulative assembly progress.
 * Current panel highlighted, previous panels shown in gray.
 */

import { Edges, Text } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Panel, Settings } from "../types";

// Get true dimensions based on orientation
function getTrueDimensions(
  panel: Panel,
  thickness: number,
): { width: number; height: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal":
      return { width: panel.width, height: thickness };
    case "vertical":
      return { width: thickness, height: panel.height };
    case "back":
      return { width: panel.width, height: panel.height };
    default:
      return { width: panel.width, height: thickness };
  }
}

// Panel component with letter label
function AssemblyPanel({
  panel,
  thickness,
  furnitureDepth,
  letter,
  isCurrent,
}: {
  panel: Panel;
  thickness: number;
  furnitureDepth: number;
  letter: string;
  isCurrent: boolean;
}) {
  const dims = getTrueDimensions(panel, thickness);
  const orientation = panel.orientation || "horizontal";
  const panelDepth = panel.depth || furnitureDepth;
  const zAlign = panel.zAlign || "front";

  // Calculate Z offset based on alignment
  const getZOffset = () => {
    switch (zAlign) {
      case "front":
        return panelDepth / 2;
      case "back":
        return furnitureDepth - panelDepth / 2;
      case "center":
        return furnitureDepth / 2;
      default:
        return panelDepth / 2;
    }
  };

  let position: [number, number, number];
  let boxSize: [number, number, number];

  if (orientation === "horizontal") {
    boxSize = [dims.width, dims.height, panelDepth];
    position = [
      panel.x + dims.width / 2,
      panel.y + dims.height / 2,
      getZOffset(),
    ];
  } else if (orientation === "vertical") {
    boxSize = [dims.width, dims.height, panelDepth];
    position = [
      panel.x + dims.width / 2,
      panel.y + dims.height / 2,
      getZOffset(),
    ];
  } else {
    boxSize = [dims.width, dims.height, thickness];
    position = [
      panel.x + dims.width / 2,
      panel.y + dims.height / 2,
      furnitureDepth - thickness / 2,
    ];
  }

  // Colors based on whether this is the current panel
  const fillColor = isCurrent ? "#ffffff" : "#e8e8e8";
  const edgeColor = isCurrent ? "#000000" : "#666666";
  const edgeWidth = isCurrent ? 1.5 : 0.75;

  // Calculate label position (front face center, slightly in front)
  const labelPosition: [number, number, number] = [
    position[0],
    position[1],
    orientation === "back" ? position[2] - thickness / 2 - 5 : -5,
  ];

  // Scale letter size based on panel dimensions
  const minDim = Math.min(dims.width, dims.height);
  const letterSize = Math.min(minDim * 0.4, 80);

  return (
    <group>
      <mesh position={position}>
        <boxGeometry args={boxSize} />
        <meshBasicMaterial color={fillColor} />
        <Edges threshold={15} color={edgeColor} lineWidth={edgeWidth} />
      </mesh>

      {/* Letter label on front face */}
      <Text
        position={labelPosition}
        fontSize={letterSize}
        color={isCurrent ? "#000000" : "#888888"}
        fontWeight={isCurrent ? "bold" : "normal"}
        anchorX="center"
        anchorY="middle"
      >
        {letter}
      </Text>
    </group>
  );
}

// Scene content for assembly step
function AssemblyScene({
  panels,
  cumulativePanelIds,
  currentPanelId,
  letterLabels,
  settings,
  onCapture,
}: {
  panels: Panel[];
  cumulativePanelIds: string[];
  currentPanelId: string;
  letterLabels: Map<string, string>;
  settings: Settings;
  onCapture: (dataUrl: string) => void;
}) {
  const { gl, scene, camera } = useThree();
  const hasRendered = useRef(false);

  const furnitureDepth = settings.furnitureDepth || 400;

  // Filter to only show cumulative panels
  const visiblePanels = panels.filter((p) => cumulativePanelIds.includes(p.id));

  // Calculate bounds for camera positioning
  const bounds = {
    minX: Math.min(...visiblePanels.map((p) => p.x), 0),
    maxX: Math.max(
      ...visiblePanels.map((p) => {
        const dims = getTrueDimensions(p, settings.thickness);
        return p.x + dims.width;
      }),
      100,
    ),
    minY: Math.min(...visiblePanels.map((p) => p.y), 0),
    maxY: Math.max(
      ...visiblePanels.map((p) => {
        const dims = getTrueDimensions(p, settings.thickness);
        return p.y + dims.height;
      }),
      100,
    ),
  };

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = furnitureDepth / 2;
  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const maxSize = Math.max(sizeX, sizeY, furnitureDepth);

  useEffect(() => {
    if (hasRendered.current) return;

    // Position camera for isometric-like view
    const distance = maxSize * 1.8;
    camera.position.set(
      centerX + distance * 0.6,
      centerY + distance * 0.4,
      centerZ + distance * 0.8,
    );
    camera.lookAt(centerX, centerY, centerZ);
    camera.updateProjectionMatrix();

    // Render and capture after a short delay
    const timeout = setTimeout(() => {
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");
      onCapture(dataUrl);
      hasRendered.current = true;
    }, 100);

    return () => clearTimeout(timeout);
  }, [gl, scene, camera, centerX, centerY, centerZ, maxSize, onCapture]);

  return (
    <>
      {visiblePanels.map((panel) => (
        <AssemblyPanel
          key={panel.id}
          panel={panel}
          thickness={settings.thickness}
          furnitureDepth={furnitureDepth}
          letter={letterLabels.get(panel.id) || "?"}
          isCurrent={panel.id === currentPanelId}
        />
      ))}
    </>
  );
}

interface AssemblyIllustrationProps {
  panels: Panel[];
  cumulativePanelIds: string[];
  currentPanelId: string;
  letterLabels: Map<string, string>;
  settings: Settings;
  size?: number;
}

export default function AssemblyIllustration({
  panels,
  cumulativePanelIds,
  currentPanelId,
  letterLabels,
  settings,
  size = 140,
}: AssemblyIllustrationProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const handleCapture = (dataUrl: string) => {
    setImageDataUrl(dataUrl);
  };

  // Filter visible panels
  const visiblePanels = panels.filter((p) => cumulativePanelIds.includes(p.id));

  if (visiblePanels.length === 0) {
    return (
      <div
        style={{ width: size, height: size }}
        className="bg-white border border-gray-200 rounded flex items-center justify-center text-gray-400 text-xs"
      >
        No panels
      </div>
    );
  }

  // Show the captured image once ready
  if (imageDataUrl) {
    return (
      <img
        src={imageDataUrl}
        alt={`Assembly step - Panel ${letterLabels.get(currentPanelId) || "?"}`}
        style={{ width: size, height: size, objectFit: "contain" }}
        className="bg-white border border-gray-200 rounded"
      />
    );
  }

  // Render the 3D scene to capture it
  return (
    <div
      style={{ width: size, height: size }}
      className="border border-gray-200 rounded overflow-hidden"
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: 45, near: 1, far: 50000 }}
        style={{ background: "#ffffff" }}
      >
        <AssemblyScene
          panels={panels}
          cumulativePanelIds={cumulativePanelIds}
          currentPanelId={currentPanelId}
          letterLabels={letterLabels}
          settings={settings}
          onCapture={handleCapture}
        />
      </Canvas>
    </div>
  );
}
