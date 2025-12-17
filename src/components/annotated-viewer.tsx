import { useState, useRef, useEffect, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Finding, PageData, BoundingBox, FindingType } from "@/types";

const FINDING_COLORS: Record<FindingType, string> = {
  content_mismatch: "rgba(239, 68, 68, 0.4)",
  content_uncertain: "rgba(156, 163, 175, 0.4)",
  missing_i_dot: "rgba(245, 158, 11, 0.4)",
  uncrossed_t: "rgba(245, 158, 11, 0.4)",
  numbering_error: "rgba(59, 130, 246, 0.4)",
};

const FINDING_STROKE_COLORS: Record<FindingType, string> = {
  content_mismatch: "rgb(239, 68, 68)",
  content_uncertain: "rgb(156, 163, 175)",
  missing_i_dot: "rgb(245, 158, 11)",
  uncrossed_t: "rgb(245, 158, 11)",
  numbering_error: "rgb(59, 130, 246)",
};

interface AnnotatedViewerProps {
  page: PageData;
  pageIndex: number;
  findings: Finding[];
  selectedFindingId?: string | null;
  onFindingSelect?: (finding: Finding | null) => void;
  className?: string;
}

export function AnnotatedViewer({
  page,
  pageIndex,
  findings,
  selectedFindingId,
  onFindingSelect,
  className,
}: AnnotatedViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showOverlays, setShowOverlays] = useState(true);

  const pageFindings = findings.filter((f) => f.pageIndex === pageIndex);

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.25));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.25, Math.min(4, z * delta)));
    }
  }, []);

  const focusOnBbox = useCallback((bbox: BoundingBox) => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const targetZoom = Math.min(
      containerRect.width / (bbox.w * 2),
      containerRect.height / (bbox.h * 2),
      2
    );

    setZoom(targetZoom);
    setPan({
      x: containerRect.width / 2 - (bbox.x + bbox.w / 2) * targetZoom,
      y: containerRect.height / 2 - (bbox.y + bbox.h / 2) * targetZoom,
    });
  }, []);

  useEffect(() => {
    if (selectedFindingId) {
      const finding = pageFindings.find((f) => f.id === selectedFindingId);
      if (finding) {
        focusOnBbox(finding.bbox);
      }
    }
  }, [selectedFindingId, pageFindings, focusOnBbox]);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleReset} title="Reset view">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant={showOverlays ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setShowOverlays(!showOverlays)}
          title={showOverlays ? "Hide overlays" : "Show overlays"}
        >
          {showOverlays ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Move className="h-3 w-3" />
          <span className="hidden sm:inline">Drag to pan</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "relative flex-1 overflow-hidden bg-muted/20",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: isPanning ? "none" : "transform 0.1s ease-out",
          }}
        >
          <img
            src={page.imageDataRef}
            alt={`Page ${pageIndex + 1}`}
            className="max-w-none"
            style={{ width: page.width, height: page.height }}
            draggable={false}
          />

          {showOverlays && (
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={page.width}
              height={page.height}
              viewBox={`0 0 ${page.width} ${page.height}`}
            >
              {pageFindings.map((finding) => {
                const isSelected = selectedFindingId === finding.id;
                const fillColor = FINDING_COLORS[finding.type];
                const strokeColor = FINDING_STROKE_COLORS[finding.type];

                return (
                  <g
                    key={finding.id}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFindingSelect?.(isSelected ? null : finding);
                    }}
                  >
                    <rect
                      x={finding.bbox.x}
                      y={finding.bbox.y}
                      width={finding.bbox.w}
                      height={finding.bbox.h}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3 : 2}
                      rx={2}
                    />
                    {isSelected && (
                      <rect
                        x={finding.bbox.x - 4}
                        y={finding.bbox.y - 4}
                        width={finding.bbox.w + 8}
                        height={finding.bbox.h + 8}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={1}
                        strokeDasharray="4 2"
                        rx={4}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
