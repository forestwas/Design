import { toPng } from 'html-to-image';

export async function downloadShareCard(element, filename) {
  if (!element) throw new Error('Kart bulunamadı');

  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#0b1f14',
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
