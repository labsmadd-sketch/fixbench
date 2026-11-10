/**
 * Suggest brand colours from a logo's pixels: the most common colours that are
 * not grey, near-white or near-black, merged when they look alike.
 * Pure function so it can be unit-tested without a browser.
 */
export function dominantColors(rgba: ArrayLike<number>, count = 3): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
    if (a < 128) continue; // transparent background
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 40) continue; // grey, white or black
    if (max < 40 || min > 225) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()]
    .sort((x, y) => y.n - x.n)
    .map((v) => [v.r / v.n, v.g / v.n, v.b / v.n] as const);

  const picked: (readonly [number, number, number])[] = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 60)) picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map(
    (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(),
  );
}

export const LOGO_MAX_BYTES = 100 * 1024;
const LOGO_MAX_SIDE = 256;

/** Approximate decoded size of a data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

/** Browser only. Colours from an image that is already stored (e.g. a saved logo data URL). */
export async function colorsFromImageUrl(src: string): Promise<string[]> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  canvas.width = Math.max(1, Math.round((img.naturalWidth || LOGO_MAX_SIDE) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || LOGO_MAX_SIDE) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return dominantColors(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

/**
 * Browser only. Shrinks a logo to at most 256px, returns a data URL small
 * enough for a Firestore document, plus colours suggested from its pixels.
 */
export async function readLogo(file: File): Promise<{ dataUrl: string; colors: string[] }> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
    throw new Error('Use a PNG, JPG, WebP or SVG image.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || LOGO_MAX_SIDE;
    const h0 = img.naturalHeight || LOGO_MAX_SIDE;
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot read images.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const colors = dominantColors(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrlBytes(dataUrl) > LOGO_MAX_BYTES) dataUrl = canvas.toDataURL('image/webp', 0.9);
    if (dataUrlBytes(dataUrl) > LOGO_MAX_BYTES) dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (dataUrlBytes(dataUrl) > LOGO_MAX_BYTES) throw new Error('This logo is too detailed to store. Try a simpler PNG or SVG.');
    return { dataUrl, colors };
  } catch (e) {
    if (e instanceof Error && !(e instanceof DOMException)) throw e;
    throw new Error('Could not read that image. Try a PNG or JPG.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
