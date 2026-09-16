// Soft UI heuristic only — actual conversion always uses the first frame
// regardless (see SPECYFIKACJA.md §3.2), so a false negative here just means
// a missed warning, not a correctness bug.
export async function detectAnimated(file: File): Promise<boolean> {
  if (file.type === 'image/gif') {
    return isAnimatedGif(new Uint8Array(await file.slice(0, 5_000_000).arrayBuffer()));
  }
  if (file.type === 'image/webp') {
    return isAnimatedWebp(new Uint8Array(await file.slice(0, 5_000_000).arrayBuffer()));
  }
  return false;
}

function isAnimatedGif(bytes: Uint8Array): boolean {
  if (bytes.length < 13) return false;
  let offset = 6; // skip "GIF87a"/"GIF89a"
  offset += 4; // logical screen width/height
  const packed = bytes[offset];
  offset += 3; // packed, bg color index, pixel aspect ratio
  if (packed & 0x80) {
    const gctSize = 2 << (packed & 0x07);
    offset += gctSize * 3;
  }

  let frameCount = 0;
  while (offset < bytes.length) {
    const blockType = bytes[offset];
    if (blockType === 0x3b) break; // trailer
    if (blockType === 0x21) {
      offset += 2; // extension introducer + label
      offset = skipSubBlocks(bytes, offset);
    } else if (blockType === 0x2c) {
      frameCount++;
      if (frameCount > 1) return true;
      offset += 9; // image descriptor
      const localPacked = bytes[offset - 1];
      if (localPacked & 0x80) {
        const lctSize = 2 << (localPacked & 0x07);
        offset += lctSize * 3;
      }
      offset += 1; // LZW min code size
      offset = skipSubBlocks(bytes, offset);
    } else {
      break; // malformed/truncated — stop rather than misread
    }
  }
  return false;
}

function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset];
    offset += 1;
    if (size === 0) break;
    offset += size;
  }
  return offset;
}

function isAnimatedWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff !== 'RIFF' || webp !== 'WEBP') return false;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCC = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset + 4, true);
    if (fourCC === 'ANIM') return true;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return false;
}
