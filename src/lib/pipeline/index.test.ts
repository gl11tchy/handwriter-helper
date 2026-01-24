import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cropLineImage } from "./index";

// Track drawImage calls to verify cropping behavior
let drawImageCalls: Array<{
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
}> = [];

// Track crop canvas dimensions
let cropCanvasDimensions: { width: number; height: number } | null = null;

// Mock canvas implementation for testing
function createMockCanvas(width: number, height: number): HTMLCanvasElement {
  const mockContext = {
    drawImage: vi.fn((_source, sx, sy, sw, sh, dx, dy, dw, dh) => {
      drawImageCalls.push({ sx, sy, sw, sh, dx, dy, dw, dh });
    }),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),
    putImageData: vi.fn(),
  };

  const canvas = {
    width,
    height,
    getContext: vi.fn(() => mockContext),
    toDataURL: vi.fn(() => "data:image/jpeg;base64,mockBase64Data"),
  };
  
  return canvas as unknown as HTMLCanvasElement;
}

// Mock document.createElement for canvas creation
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  drawImageCalls = [];
  cropCanvasDimensions = null;
  
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    if (tagName === "canvas") {
      const canvas = createMockCanvas(100, 100);
      // Capture when dimensions are set on the crop canvas
      const originalWidth = canvas.width;
      const originalHeight = canvas.height;
      Object.defineProperty(canvas, "width", {
        get: () => cropCanvasDimensions?.width ?? originalWidth,
        set: (v) => { cropCanvasDimensions = { ...cropCanvasDimensions, width: v, height: cropCanvasDimensions?.height ?? 0 }; },
      });
      Object.defineProperty(canvas, "height", {
        get: () => cropCanvasDimensions?.height ?? originalHeight,
        set: (v) => { cropCanvasDimensions = { ...cropCanvasDimensions, width: cropCanvasDimensions?.width ?? 0, height: v }; },
      });
      return canvas;
    }
    return originalCreateElement(tagName);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cropLineImage", () => {
  const PADDING = 10; // The function uses 10px padding
  
  it("returns base64 string without data URL prefix", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 50, y: 30, w: 200, h: 40 };

    const result = cropLineImage(canvas, bbox);

    expect(result).toBe("mockBase64Data");
    expect(result).not.toContain("data:");
  });

  it("creates a canvas element for cropping", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 50, y: 30, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    expect(document.createElement).toHaveBeenCalledWith("canvas");
  });

  it("applies 10px padding around the bbox", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 100, y: 50, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    // Expected crop dimensions with padding
    const expectedX = bbox.x - PADDING; // 90
    const expectedY = bbox.y - PADDING; // 40
    const expectedW = bbox.w + PADDING * 2; // 220
    const expectedH = bbox.h + PADDING * 2; // 60

    // Verify crop canvas was sized correctly
    expect(cropCanvasDimensions?.width).toBe(expectedW);
    expect(cropCanvasDimensions?.height).toBe(expectedH);

    // Verify drawImage was called with correct source coordinates
    expect(drawImageCalls).toHaveLength(1);
    expect(drawImageCalls[0].sx).toBe(expectedX);
    expect(drawImageCalls[0].sy).toBe(expectedY);
    expect(drawImageCalls[0].sw).toBe(expectedW);
    expect(drawImageCalls[0].sh).toBe(expectedH);
  });

  it("clamps padding to canvas bounds when bbox is near left edge (x=0)", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 0, y: 50, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    // x should be clamped to 0 (can't go negative)
    expect(drawImageCalls[0].sx).toBe(0);
    // Width should be adjusted: Math.min(500 - 0, 200 + 20) = 220
    expect(drawImageCalls[0].sw).toBe(bbox.w + PADDING * 2);
  });

  it("clamps padding to canvas bounds when bbox is near top edge (y=0)", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 50, y: 0, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    // y should be clamped to 0 (can't go negative)
    expect(drawImageCalls[0].sy).toBe(0);
  });

  it("clamps width when bbox extends past canvas right edge", () => {
    const canvas = createMockCanvas(500, 300);
    // bbox.x + bbox.w + padding would exceed canvas width
    const bbox = { x: 450, y: 30, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    // x with padding: 450 - 10 = 440
    // Width should be clamped: Math.min(500 - 440, 200 + 20) = 60
    const expectedX = 440;
    const expectedW = Math.min(500 - expectedX, bbox.w + PADDING * 2);
    
    expect(drawImageCalls[0].sx).toBe(expectedX);
    expect(drawImageCalls[0].sw).toBe(expectedW);
    expect(cropCanvasDimensions?.width).toBe(expectedW);
  });

  it("clamps height when bbox extends past canvas bottom edge", () => {
    const canvas = createMockCanvas(500, 300);
    // bbox.y + bbox.h + padding would exceed canvas height
    const bbox = { x: 50, y: 280, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    // y with padding: 280 - 10 = 270
    // Height should be clamped: Math.min(300 - 270, 40 + 20) = 30
    const expectedY = 270;
    const expectedH = Math.min(300 - expectedY, bbox.h + PADDING * 2);
    
    expect(drawImageCalls[0].sy).toBe(expectedY);
    expect(drawImageCalls[0].sh).toBe(expectedH);
    expect(cropCanvasDimensions?.height).toBe(expectedH);
  });

  it("handles small bbox near origin correctly", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 5, y: 5, w: 50, h: 20 };

    cropLineImage(canvas, bbox);

    // x would be 5 - 10 = -5, clamped to 0
    // y would be 5 - 10 = -5, clamped to 0
    expect(drawImageCalls[0].sx).toBe(0);
    expect(drawImageCalls[0].sy).toBe(0);
  });

  it("draws the cropped region to destination at origin (0,0)", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 100, y: 50, w: 200, h: 40 };

    cropLineImage(canvas, bbox);

    // Destination should always be at origin of the crop canvas
    expect(drawImageCalls[0].dx).toBe(0);
    expect(drawImageCalls[0].dy).toBe(0);
  });

  it("calls toDataURL with jpeg format and 0.9 quality", () => {
    const canvas = createMockCanvas(500, 300);
    const bbox = { x: 100, y: 50, w: 200, h: 40 };

    // Track toDataURL calls on the crop canvas
    let toDataURLArgs: unknown[] = [];
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        const cropCanvas = createMockCanvas(100, 100);
        const originalToDataURL = cropCanvas.toDataURL;
        cropCanvas.toDataURL = vi.fn((...args: unknown[]) => {
          toDataURLArgs = args;
          return (originalToDataURL as () => string)();
        });
        return cropCanvas;
      }
      return originalCreateElement(tagName);
    });

    const result = cropLineImage(canvas, bbox);

    // Verify toDataURL was called with correct arguments
    expect(toDataURLArgs[0]).toBe("image/jpeg");
    expect(toDataURLArgs[1]).toBe(0.9);
    expect(result).toBe("mockBase64Data");
  });
});
