// Manual 24-bit BMP encoder (BITMAPFILEHEADER + BITMAPINFOHEADER, uncompressed,
// bottom-up row order). canvas.toBlob() does not support 'image/bmp' in any
// mainstream browser, so this replaces it — see SPECYFIKACJA.md §3.1b.
export function encodeBMP(imageData: ImageData): ArrayBuffer {
  const { width, height, data } = imageData;
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BITMAPFILEHEADER
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true);

  // BITMAPINFOHEADER
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive height = bottom-up row order
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // BI_RGB, no compression
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  const pixelStart = fileHeaderSize + infoHeaderSize;
  for (let outRow = 0; outRow < height; outRow++) {
    const srcY = height - 1 - outRow;
    const rowStart = pixelStart + outRow * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 4;
      const dstIdx = rowStart + x * 3;
      bytes[dstIdx] = data[srcIdx + 2]; // B
      bytes[dstIdx + 1] = data[srcIdx + 1]; // G
      bytes[dstIdx + 2] = data[srcIdx]; // R
    }
    // remaining bytes in the row (padding to 4-byte boundary) are already 0
  }

  return buffer;
}
