import { lightArt as art } from "@/theming/illustration";

export const mosaicColumns = 32;
export const mosaicRows = 24;
export type RGB = [number, number, number];
type Scene = (x: number, y: number) => string;

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}
function triangle(x: number, y: number, cx: number, top: number, halfWidth: number, height: number) {
  return y >= top && y < top + height && Math.abs(x - cx) <= halfWidth * (y - top) / height;
}

// Broad silhouettes and deliberately few colors retain their shape when sampled into 32 × 24 tiles.
const alpine: Scene = (x, y) => {
  if (y > 0.76 + 0.10 * Math.cos(x * 5)) return art.sage;
  if (y > 0.64 + 0.15 * Math.sin(x * 4)) return art.moss;
  if (triangle(x, y, 0.35, 0.21, 0.46, 0.64)) return y < 0.42 ? art.cloud : art.teal;
  if (triangle(x, y, 0.72, 0.35, 0.43, 0.46)) return art.tealLight;
  if (ellipse(x, y, 0.77, 0.21, 0.085, 0.113)) return art.sun;
  return art.canvasBlue;
};
const coast: Scene = (x, y) => {
  if (y > 0.77 + 0.08 * Math.sin(x * 7)) return art.sand;
  if (y > 0.50) return y > 0.68 + 0.045 * Math.cos(x * 9) ? art.sage : art.moss;
  if (ellipse(x, y, 0.26, 0.45, 0.125, 0.167)) return art.sun;
  return y > 0.39 ? art.rose : art.canvasPeach;
};
const balloon: Scene = (x, y) => {
  if (y >= 0.87 + 0.09 * Math.cos(x * 5)) return art.moss;
  if (y > 0.76 + 0.065 * Math.sin(x * 7)) return art.sage;
  if (ellipse(x, y, 0.47, 0.33, 0.195, 0.24) ||
      (y >= 0.40 && y < 0.64 && Math.abs(x - 0.47) < 0.18 - (y - 0.40) * 0.54)) {
    return Math.abs(x - 0.47) < 0.07 ? art.rose : art.terracotta;
  }
  if (y >= 0.65 && y < 0.74 && Math.abs(x - 0.47) < 0.065) return art.sandDeep;
  if (ellipse(x, y, 0.80, 0.28, 0.13, 0.058) || ellipse(x, y, 0.11, 0.54, 0.16, 0.065)) return art.cloud;
  return art.canvasBlue;
};
const moon: Scene = (x, y) => {
  if (y > 0.79 + 0.09 * Math.sin(x * 8)) return art.teal;
  if (y > 0.67 + 0.11 * Math.cos(x * 8)) return art.tealLight;
  if (ellipse(x, y, 0.51, 0.36, 0.19, 0.253) &&
      !ellipse(x, y, 0.59, 0.29, 0.16, 0.213)) return art.canvasButter;
  if (ellipse(x, y, 0.73, 0.24, 0.034, 0.045) || ellipse(x, y, 0.81, 0.42, 0.023, 0.030) ||
      ellipse(x, y, 0.23, 0.34, 0.030, 0.040)) return art.cloud;
  return art.tealDeep;
};

function raster(scene: Scene): RGB[] {
  const colors = new Map<string, number>();
  return Array.from({ length: mosaicColumns * mosaicRows }, (_, index) => {
    const rgb: RGB = [0, 0, 0];
    for (const dy of [0.17, 0.5, 0.83]) {
      for (const dx of [0.17, 0.5, 0.83]) {
        const hex = scene((index % mosaicColumns + dx) / mosaicColumns, (Math.floor(index / mosaicColumns) + dy) / mosaicRows);
        const color = colors.get(hex) ?? parseInt(hex.slice(1), 16);
        colors.set(hex, color);
        rgb[0] += color >> 16;
        rgb[1] += (color >> 8) & 255;
        rgb[2] += color & 255;
      }
    }
    return [Math.round(rgb[0] / 9), Math.round(rgb[1] / 9), Math.round(rgb[2] / 9)];
  });
}

// The target rasters are only sampled by the matcher. The viewer draws photo pixels.
export const mosaicScenes = [
  { name: "Alpine Morning", targets: raster(alpine) },
  { name: "Peach Coast", targets: raster(coast) },
  { name: "Balloon Drift", targets: raster(balloon) },
  { name: "Crescent Hills", targets: raster(moon) },
];
