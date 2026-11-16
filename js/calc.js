// Hedef Isı demo: capacity rules of thumb. Pure functions, no DOM, so they can be tested in Node.
// Every number here is a rule of thumb, shown to the visitor next to the result.
// Coefficients are to be confirmed by Hedef Isı before launch.

export const KLIMA_BASE_BTU_PER_M2 = 500; // Black Sea coast, approximate
export const KLIMA_SIZES = [9000, 12000, 18000, 24000];
export const KLIMA_TOLERANCE = 0.05; // a size may fall short of the computed value by at most 5%

export const KOMBI_SIZES = [20, 24, 28, 35];
export const KOMBI_MARGIN = 1.2; // the boiler covers the heat loss plus 20%
export const KOMBI_MIN_KW = 20; // hot water sets the floor for a combi boiler

export const LIMITS = Object.freeze({
  oda: { min: 5, max: 150, fallback: 20 },
  daire: { min: 30, max: 400, fallback: 110 },
});

export const FACTORS = Object.freeze({
  cephe: {
    kuzey: { label: 'Kuzey', klima: 0.9, kombi: 1.1 },
    dogu: { label: 'Doğu', klima: 1.0, kombi: 1.0 },
    bati: { label: 'Batı', klima: 1.1, kombi: 1.0 },
    guney: { label: 'Güney', klima: 1.1, kombi: 0.95 },
  },
  kat: {
    ara: { label: 'Ara kat', klima: 1.0, kombi: 1.0 },
    zemin: { label: 'Zemin kat', klima: 0.95, kombi: 1.1 },
    cati: { label: 'Çatı katı', klima: 1.2, kombi: 1.15 },
  },
  yalitim: {
    iyi: { label: 'İyi', klima: 0.9, wattPerM2: 60 },
    orta: { label: 'Orta', klima: 1.0, wattPerM2: 90 },
    zayif: { label: 'Zayıf', klima: 1.15, wattPerM2: 120 },
  },
});

export const DEFAULTS = Object.freeze({ oda: 20, daire: 110, cephe: 'guney', kat: 'ara', yalitim: 'orta' });

/** Parses a user-typed area ("22", "22,5") into a number inside the allowed range. */
export function cleanArea(raw, { min, max, fallback }) {
  const value = Number(String(raw ?? '').replace(',', '.').trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Returns a known option key, or the default when the value is unknown. */
export function cleanChoice(group, value) {
  return Object.hasOwn(FACTORS[group], value) ? value : DEFAULTS[group];
}

/** Normalises every input so the formulas never see a bad value. */
export function cleanInput(input = {}) {
  return {
    oda: cleanArea(input.oda, LIMITS.oda),
    daire: cleanArea(input.daire, LIMITS.daire),
    cephe: cleanChoice('cephe', input.cephe),
    kat: cleanChoice('kat', input.kat),
    yalitim: cleanChoice('yalitim', input.yalitim),
  };
}

/** Smallest standard size that covers the value (allowing the tolerance), or null when none does. */
export function pickSize(value, sizes, tolerance = 0) {
  return sizes.find((size) => size >= value * (1 - tolerance)) ?? null;
}

/** Air conditioner for one room. */
export function klima(rawInput) {
  const { oda, cephe, kat, yalitim } = cleanInput(rawInput);
  const fCephe = FACTORS.cephe[cephe].klima;
  const fKat = FACTORS.kat[kat].klima;
  const fYalitim = FACTORS.yalitim[yalitim].klima;
  const btu = Math.round((oda * KLIMA_BASE_BTU_PER_M2 * fCephe * fKat * fYalitim) / 10) * 10;
  const size = pickSize(btu, KLIMA_SIZES, KLIMA_TOLERANCE);
  return { oda, btu, size, factors: { cephe: fCephe, kat: fKat, yalitim: fYalitim } };
}

/** Combi boiler for the whole flat. */
export function kombi(rawInput) {
  const { daire, cephe, kat, yalitim } = cleanInput(rawInput);
  const watt = FACTORS.yalitim[yalitim].wattPerM2;
  const fKat = FACTORS.kat[kat].kombi;
  const fCephe = FACTORS.cephe[cephe].kombi;
  const loss = Math.round(((daire * watt * fKat * fCephe) / 1000) * 10) / 10;
  const needed = Math.max(loss * KOMBI_MARGIN, KOMBI_MIN_KW);
  const size = pickSize(needed, KOMBI_SIZES);
  return { daire, loss, needed, size, factors: { watt, kat: fKat, cephe: fCephe } };
}

const tr = (n, digits = 0) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatNumber = tr;

/** The message that opens in WhatsApp when the visitor asks for a survey with this result. */
export function whatsappText(rawInput) {
  const input = cleanInput(rawInput);
  const k = klima(input);
  const b = kombi(input);
  const room = `${input.oda} m², ${FACTORS.cephe[input.cephe].label.toLocaleLowerCase('tr')} cephe, ${FACTORS.kat[input.kat].label.toLocaleLowerCase('tr')}, ${FACTORS.yalitim[input.yalitim].label.toLocaleLowerCase('tr')} yalıtım`;
  const klimaLine = k.size
    ? `yaklaşık ${tr(k.size)} BTU klima (hesap ${tr(k.btu)} BTU)`
    : `hesap ${tr(k.btu)} BTU, tek cihazı aşıyor`;
  const kombiLine = b.size
    ? `ısı kaybı yaklaşık ${tr(b.loss, 1)} kW, önerilen kombi ${b.size} kW`
    : `ısı kaybı yaklaşık ${tr(b.loss, 1)} kW, kombi boyunu aşıyor`;
  return [
    'Merhaba, Hedef Isı sitesindeki hesaplayıcıyla baktım.',
    `Oda: ${room} → ${klimaLine}.`,
    `Daire: ${input.daire} m² → ${kombiLine}.`,
    'Bu sonuçla ücretsiz keşif istiyorum.',
  ].join('\n');
}
