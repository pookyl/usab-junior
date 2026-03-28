/**
 * Zero-dependency DOM-to-PNG capture using the SVG foreignObject technique.
 * Same canvas.toBlob() pattern as the QR card export in PlayerProfileLayout.
 */

function inlineStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  const inline = (target as HTMLElement).style;
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    inline.setProperty(prop, computed.getPropertyValue(prop));
  }
  const srcChildren = source.children;
  const tgtChildren = target.children;
  for (let i = 0; i < srcChildren.length; i++) {
    inlineStyles(srcChildren[i], tgtChildren[i]);
  }
}

export async function domToPng(node: HTMLElement): Promise<Blob | null> {
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  if (width === 0 || height === 0) return null;

  const dpr = Math.max(window.devicePixelRatio, 2);

  const clone = node.cloneNode(true) as HTMLElement;
  inlineStyles(node, clone);

  // Reset any positioning/margin on the root clone so it renders at (0,0)
  clone.style.margin = '0';
  clone.style.position = 'static';

  const serializer = new XMLSerializer();
  const html = serializer.serializeToString(clone);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    ${html}
  </foreignObject>
</svg>`;

  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  const img = new Image();
  img.width = width;
  img.height = height;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load SVG image'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
