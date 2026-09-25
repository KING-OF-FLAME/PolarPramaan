import type { Queryable } from '../db/core';

// Bilingual scientific glossary used by the adaptation invariant checks.
// The Hindi terms were drafted by the project team and are stored as
// NOT reviewed (reviewed_at = null) until a competent Hindi reviewer signs off
// in the workspace. The UI shows that status next to every Hindi variant.
export const GLOSSARY: { en: string; hi: string; note?: string }[] = [
  { en: 'sea ice', hi: 'समुद्री बर्फ' },
  { en: 'sea-ice extent', hi: 'समुद्री बर्फ का विस्तार', note: 'Area of ocean with at least 15% ice concentration; not the same as sea-ice area.' },
  { en: 'sea-ice area', hi: 'समुद्री बर्फ का क्षेत्रफल', note: 'Concentration-weighted area; always smaller than or equal to extent.' },
  { en: 'ice concentration', hi: 'बर्फ की सांद्रता' },
  { en: 'Arctic', hi: 'आर्कटिक' },
  { en: 'Antarctic', hi: 'अंटार्कटिक' },
  { en: 'Antarctica', hi: 'अंटार्कटिका' },
  { en: 'Northern Hemisphere', hi: 'उत्तरी गोलार्ध' },
  { en: 'Southern Hemisphere', hi: 'दक्षिणी गोलार्ध' },
  { en: 'Southern Ocean', hi: 'दक्षिणी महासागर' },
  { en: 'million square kilometres', hi: 'मिलियन वर्ग किलोमीटर' },
  { en: 'glacier', hi: 'हिमनद' },
  { en: 'ice sheet', hi: 'हिम चादर' },
  { en: 'ice shelf', hi: 'हिम शेल्फ़' },
  { en: 'satellite record', hi: 'उपग्रह रिकॉर्ड' },
  { en: 'climate', hi: 'जलवायु' },
  { en: 'weather', hi: 'मौसम' },
  { en: 'trend', hi: 'प्रवृत्ति' },
  { en: 'average', hi: 'औसत' },
  { en: 'minimum', hi: 'न्यूनतम' },
  { en: 'maximum', hi: 'अधिकतम' },
  { en: 'research station', hi: 'अनुसंधान केंद्र' },
  { en: 'Maitri', hi: 'मैत्री' },
  { en: 'Bharati', hi: 'भारती' },
  { en: 'Himadri', hi: 'हिमाद्रि' },
  { en: 'Dakshin Gangotri', hi: 'दक्षिण गंगोत्री' },
  { en: 'NCPOR', hi: 'एनसीपीओआर' },
  { en: 'NSIDC', hi: 'एनएसआईडीसी' },
  { en: 'NASA', hi: 'नासा' },
  { en: 'expedition', hi: 'अभियान' },
  { en: 'dataset', hi: 'डेटासेट' },
  { en: 'uncertainty', hi: 'अनिश्चितता' },
];

export async function seedGlossary(q: Queryable) {
  for (const g of GLOSSARY) {
    await q.query(
      `insert into glossary_terms (term_en, term_hi, note) values ($1, $2, $3)
       on conflict (term_en) do update set note = excluded.note,
         term_hi = case when glossary_terms.reviewed_at is null then excluded.term_hi else glossary_terms.term_hi end`,
      [g.en, g.hi, g.note ?? null],
    );
  }
}
