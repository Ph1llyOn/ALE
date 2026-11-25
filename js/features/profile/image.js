// Prepara la foto profilo nel browser: ritaglio quadrato, ridimensionamento, ricodifica in JPEG.
// La ricodifica elimina i metadati (EXIF, posizione) prima del caricamento.
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const OUTPUT_SIZE = 512;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export function checkImageFile(file) {
  if (!file) return 'Nessun file selezionato.';
  if (!/^image\//.test(file.type)) return 'Scegli un’immagine.';
  if (file.size > MAX_INPUT_BYTES) return 'L’immagine è troppo grande.';
  return null;
}

async function decode(file) {
  if ('createImageBitmap' in globalThis) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* ricade su <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export async function toAvatarBlob(file) {
  const err = checkImageFile(file);
  if (err) throw new Error(err);
  let img;
  try { img = await decode(file); } catch { throw new Error('Non riesco a leggere questa immagine.'); }
  const w = img.width || img.naturalWidth;
  const hgt = img.height || img.naturalHeight;
  const side = Math.min(w, hgt);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.drawImage(img, (w - side) / 2, (hgt - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  if (img.close) img.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Non riesco a preparare l’immagine.');
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('L’immagine è ancora troppo pesante.');
  return blob;
}
