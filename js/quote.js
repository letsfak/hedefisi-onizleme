// Survey requests: builds the WhatsApp message for the home quote and the project form.
// Pure functions, no DOM, so the wording can be tested. Nothing is stored or sent by the site:
// the visitor sees the message in WhatsApp and presses send.

export const HOME_LIMITS = Object.freeze({
  m2: { min: 5, max: 1000 },
});

export const WORK_LIMITS = Object.freeze({
  m2: { min: 20, max: 500000 },
  kat: { min: 1, max: 80 },
});

const ROOM_DEVICES = new Set(['Klima']);

/** Removes control characters, squeezes spaces and cuts to a maximum length. */
export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Reads a whole number typed the Turkish way ("1.500", "22,6") and keeps it inside its range.
 * Returns null when nothing usable was typed.
 */
export function cleanWhole(raw, { min, max }) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const normal = text.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(normal);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const thousands = (n) => n.toLocaleString('tr-TR');

/** Message for a home survey: device, size, optional calculator result, then the photo promise. */
export function homeMessage({ ne, m2, hesap, ad, yer }) {
  const where = ROOM_DEVICES.has(ne) ? 'Oda' : 'Daire';
  return [
    'Merhaba, web sitenizden ücretsiz keşif istiyorum.',
    `Ne için: ${ne}`,
    m2 ? `${where}: ${thousands(m2)} m²` : '',
    hesap ? `Hesaplayıcıda: ${hesap}` : '',
    ad ? `Ad: ${ad}` : '',
    yer ? `Yer: ${yer}` : '',
    'Cihazın ve duvarın fotoğraflarını bu mesajın ardından gönderiyorum.',
  ].filter(Boolean).join('\n');
}

/** Message for a project: building, size, floors, stage, company, then the drawings promise. */
export function workMessage({ tur, m2, kat, zaman, ad, firma }) {
  return [
    'Merhaba, web sitenizden bir proje için yazıyorum.',
    `Bina: ${tur}`,
    m2 ? `Kapalı alan: ${thousands(m2)} m²` : '',
    kat ? `Kat sayısı: ${kat}` : '',
    zaman ? `Aşama: ${zaman}` : '',
    ad ? `Ad: ${ad}` : '',
    firma ? `Firma: ${firma}` : '',
    'Çizimleri ya da proje dosyasını bu mesajın ardından gönderiyorum.',
  ].filter(Boolean).join('\n');
}
