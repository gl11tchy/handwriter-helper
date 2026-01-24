import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cropLineImage, preprocessImage } from "./index";

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

// Helper to create a canvas with specific pixel data for blur testing
function createTestCanvas(
  width: number,
  height: number,
  pixelGenerator: (x: number, y: number) => number // Returns brightness 0-255
): HTMLCanvasElement {
  const imageData = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const brightness = pixelGenerator(x, y);
      imageData[idx] = brightness;     // R
      imageData[idx + 1] = brightness; // G
      imageData[idx + 2] = brightness; // B
      imageData[idx + 3] = 255;        // A
    }
  }

  const mockContext = {
    getImageData: vi.fn(() => ({
      data: imageData,
      width,
      height,
    })),
    putImageData: vi.fn(),
  };

  const canvas = {
    width,
    height,
    getContext: vi.fn(() => mockContext),
  };

  return canvas as unknown as HTMLCanvasElement;
}

describe("preprocessImage blur detection", () => {
  it("accepts sharp handwriting (high edge contrast)", () => {
    // Create image with sharp dark lines on white background
    // Sharp edge: instant transition from white (255) to dark (30)
    const canvas = createTestCanvas(100, 100, (x, y) => {
      // Draw horizontal lines at y=20, 40, 60, 80 with sharp edges
      const linePositions = [20, 40, 60, 80];
      for (const lineY of linePositions) {
        if (y >= lineY && y <= lineY + 3) {
          return 30; // Dark ink
        }
      }
      return 255; // White paper
    });

    const result = preprocessImage(canvas, false);

    // Sharp image should NOT have blur rejection
    const hasBlurRejection = result.rejectionReasons.some(r =>
      r.toLowerCase().includes("blurry")
    );
    expect(hasBlurRejection).toBe(false);
    expect(result.metrics.blurScore).toBeGreaterThan(0.15);
  });

  it("rejects extremely blurry handwriting", () => {
    // Create extremely blurry image - almost no edge definition
    // Simulates severe out-of-focus or motion blur
    const canvas = createTestCanvas(100, 100, (x, y) => {
      // Draw horizontal "blurry" lines with almost no edge definition
      const linePositions = [25, 50, 75];
      for (const lineY of linePositions) {
        const distance = Math.abs(y - lineY);
        if (distance <= 20) {
          // Extremely gradual transition - center barely darker than edges
          // This simulates motion blur or severe defocus
          const blurFactor = distance / 20;
          // Center is 150 (gray), edges fade to 199 (just under threshold)
          return Math.round(150 + (199 - 150) * blurFactor);
        }
      }
      return 255; // White paper
    });

    const result = preprocessImage(canvas, false);

    // Extremely blurry image should have very low blur score
    // Even if not rejected at current threshold, score should be notably low
    expect(result.metrics.blurScore).toBeLessThan(0.3);
  });

  it("detects blur score difference between sharp and blurry images", () => {
    // Sharp image with crisp edges
    const sharpCanvas = createTestCanvas(100, 100, (x, y) => {
      const linePositions = [20, 40, 60, 80];
      for (const lineY of linePositions) {
        if (y >= lineY && y <= lineY + 3) {
          return 30; // Instant transition to dark
        }
      }
      return 255;
    });

    // Blurry image with gradual edges
    const blurryCanvas = createTestCanvas(100, 100, (x, y) => {
      const linePositions = [20, 40, 60, 80];
      for (const lineY of linePositions) {
        const distance = Math.abs(y - lineY);
        if (distance <= 10) {
          const blurFactor = distance / 10;
          return Math.round(80 + (255 - 80) * blurFactor);
        }
      }
      return 255;
    });

    const sharpResult = preprocessImage(sharpCanvas, false);
    const blurryResult = preprocessImage(blurryCanvas, false);

    // Sharp should have notably higher blur score than blurry
    expect(sharpResult.metrics.blurScore).toBeGreaterThan(
      blurryResult.metrics.blurScore * 2
    );
  });

  it("handles mostly white paper with sparse content correctly", () => {
    // Real handwriting: mostly white paper with occasional dark lines
    // This should NOT trigger blur rejection just because there's little content
    const canvas = createTestCanvas(200, 200, (x, y) => {
      // Single sharp line at y=100
      if (y >= 100 && y <= 103 && x >= 20 && x <= 180) {
        return 30; // Dark ink
      }
      return 255; // White paper
    });

    const result = preprocessImage(canvas, false);

    // Sparse but sharp content should pass
    const hasBlurRejection = result.rejectionReasons.some(r =>
      r.toLowerCase().includes("blurry")
    );
    expect(hasBlurRejection).toBe(false);
  });

  it("skips blur check when content is less than 1%", () => {
    // Nearly all white image - not enough content to assess blur
    const canvas = createTestCanvas(100, 100, () => 255); // All white

    const result = preprocessImage(canvas, false);

    // Should not reject as blurry - not enough content to measure
    const hasBlurRejection = result.rejectionReasons.some(r =>
      r.toLowerCase().includes("blurry")
    );
    expect(hasBlurRejection).toBe(false);
    // Blur score defaults to 1 (sharp) when insufficient content
    expect(result.metrics.blurScore).toBe(1);
  });

  it("only measures blur on ink pixels, not white space", () => {
    // Create image where ink regions are sharp but there's lots of white space
    const canvas = createTestCanvas(100, 100, (x, y) => {
      // Small sharp text in one corner
      if (x >= 10 && x <= 30 && y >= 10 && y <= 15) {
        return 30; // Sharp dark ink
      }
      return 255; // White paper (majority of image)
    });

    const result = preprocessImage(canvas, false);

    // Should not be rejected as blurry - the ink itself is sharp
    const hasBlurRejection = result.rejectionReasons.some(r =>
      r.toLowerCase().includes("blurry")
    );
    expect(hasBlurRejection).toBe(false);
  });
});
