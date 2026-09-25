// Rights presets used by the curation manifest. Each preset cites the policy
// evidence captured in data/snapshots/policies/ (or states that none was found).
// "Publicly visible" is never treated as "free to republish".

export type RightsStatus = 'cleared' | 'attribution_required' | 'link_only' | 'restricted' | 'unknown';

export interface RightsInput {
  status: RightsStatus;
  license: string | null;
  attribution: string | null;
  policyUrl: string | null;
  metadataPublic: boolean;
  allowStoreOriginal: boolean;
  allowDownload: boolean;
  allowIndexText: boolean;
  allowQuote: boolean;
  allowAiProcessing: boolean;
  allowTransform: boolean;
  allowRepublishMedia: boolean;
  allowOffline: boolean;
  peopleIdentifiable: boolean;
  rationale: string;
  reviewDue: string | null; // ISO date
}

const REVIEW_DUE = '2027-03-31';

const none = {
  allowStoreOriginal: false, allowDownload: false, allowIndexText: false, allowQuote: false,
  allowAiProcessing: false, allowTransform: false, allowRepublishMedia: false, allowOffline: false,
};

/** Minimal source-link record: metadata only, nothing stored, quoted, transformed or cached. */
export function linkOnly(rationale: string, policyUrl: string | null, attribution: string | null = null): RightsInput {
  return {
    status: 'link_only', license: null, attribution, policyUrl, metadataPublic: true, ...none,
    peopleIdentifiable: false, rationale, reviewDue: REVIEW_DUE,
  };
}

export const NCPOR_LINK_ONLY = (what: string) =>
  linkOnly(
    `${what} NCPOR's copyright policy page (https://ncpor.res.in/pages/display/33-copyright-policy, captured ` +
      `2026-09-25) states "All Rights Reserved" and no reuse permission was found, so only the title, URL and ` +
      `retrieval date are recorded. Readers are sent to the official page. Deeper ingestion needs express permission from NCPOR.`,
    'https://ncpor.res.in/pages/display/33-copyright-policy',
    'National Centre for Polar and Ocean Research (NCPOR), Ministry of Earth Sciences, Government of India',
  );

export const NSIDC_DATA = (citation: string): RightsInput => ({
  status: 'attribution_required',
  license: 'NSIDC data use condition (citation required)',
  attribution: citation,
  policyUrl: 'https://nsidc.org/data/g02135/versions/4',
  metadataPublic: true,
  allowStoreOriginal: true,
  allowDownload: false, // original files are linked at NSIDC, not mirrored
  allowIndexText: true,
  allowQuote: true,
  allowAiProcessing: true,
  allowTransform: true, // charts / derived calculations with citation
  allowRepublishMedia: false,
  allowOffline: true, // derived rows with citation in offline packs
  peopleIdentifiable: false,
  rationale:
    'The G02135 v4 landing page (captured 2026-09-25) states: "As a condition of using these data, you must cite the use ' +
    'of this data set." Derived calculations and charts carry the citation and subset description. Original files are ' +
    'linked at NSIDC rather than re-hosted.',
  reviewDue: REVIEW_DUE,
});

export const CC_BY_3_PANGAEA: RightsInput = {
  status: 'attribution_required',
  license: 'CC-BY-3.0',
  attribution:
    'de Jong, E; Vichi, M; Saunders, CFW; Kotilainen, MJ; Luyt, H; Peel, SPM; Swart, DJ (2018): Sea ice conditions within the ' +
    'Antarctic Marginal Ice Zone in summer 2016, onboard the SA Agulhas II. PANGAEA, https://doi.org/10.1594/PANGAEA.885208',
  policyUrl: 'https://creativecommons.org/licenses/by/3.0/',
  metadataPublic: true,
  allowStoreOriginal: true,
  allowDownload: true,
  allowIndexText: true,
  allowQuote: true,
  allowAiProcessing: true,
  allowTransform: true,
  allowRepublishMedia: false,
  allowOffline: true,
  peopleIdentifiable: false,
  rationale: 'The dataset file header declares "License: Creative Commons Attribution 3.0 Unported (CC-BY-3.0)". CC-BY permits redistribution and adaptation with attribution.',
  reviewDue: REVIEW_DUE,
};

export const NASA_MEDIA = (credit: string, peopleIdentifiable = false): RightsInput => ({
  status: 'attribution_required',
  license: 'NASA media usage guidelines (generally not subject to US copyright)',
  attribution: credit,
  policyUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  metadataPublic: true,
  allowStoreOriginal: false, // served from images-assets.nasa.gov
  allowDownload: false,
  allowIndexText: true,
  allowQuote: true,
  allowAiProcessing: true,
  allowTransform: !peopleIdentifiable,
  allowRepublishMedia: !peopleIdentifiable,
  allowOffline: !peopleIdentifiable,
  peopleIdentifiable,
  rationale:
    'NASA guidelines (captured 2026-09-25): NASA content "generally are not subject to copyright in the United States. You may use ' +
    'this material for educational or informational purposes" and "NASA should be acknowledged as the source". Use must not imply ' +
    'endorsement. Third-party-marked items and identifiable persons need separate review.',
  reviewDue: REVIEW_DUE,
});

export const NASA_TEXT = (credit: string): RightsInput => ({
  ...NASA_MEDIA(credit),
  allowStoreOriginal: true,
  allowRepublishMedia: false,
  rationale:
    'NASA web text used under NASA media usage guidelines (educational/informational use with NASA acknowledged, no implied endorsement). ' +
    'Quoted with attribution; embedded third-party images are not reused.',
});

export const NOAA_ARC: RightsInput = {
  status: 'attribution_required',
  license: 'US Government publication (NOAA); cite as recommended',
  attribution: 'NOAA Arctic Report Card 2024 — Sea Ice (https://arctic.noaa.gov/report-card/report-card-2024/sea-ice-2024/)',
  policyUrl: 'https://arctic.noaa.gov/report-card/report-card-2024/',
  metadataPublic: true,
  allowStoreOriginal: true,
  allowDownload: false,
  allowIndexText: true,
  allowQuote: true,
  allowAiProcessing: false, // chapter authorship includes non-federal authors; not sent to AI providers
  allowTransform: false,
  allowRepublishMedia: false,
  allowOffline: false,
  peopleIdentifiable: false,
  rationale:
    'Published by NOAA. Chapters include non-federal co-authors and no explicit licence text was captured, so only short attributed ' +
    'quotation for evidence is enabled. AI processing, transformation and offline copies are disabled.',
  reviewDue: REVIEW_DUE,
};

export const WIKIPEDIA_TEXT = (title: string, url: string, revid: number): RightsInput => ({
  status: 'attribution_required',
  license: 'CC BY-SA 4.0',
  attribution: `Wikipedia contributors, "${title}", revision ${revid}, ${url} (CC BY-SA 4.0)`,
  policyUrl: 'https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content',
  metadataPublic: true,
  allowStoreOriginal: true,
  allowDownload: false,
  allowIndexText: true,
  allowQuote: true,
  allowAiProcessing: true,
  allowTransform: true, // adaptations of the text must remain CC BY-SA 4.0
  allowRepublishMedia: false,
  allowOffline: true,
  peopleIdentifiable: false,
  rationale:
    'Wikipedia text is licensed CC BY-SA 4.0 (policy page captured 2026-09-25). It is a tertiary reference: it is used for context ' +
    'and cross-checked against primary sources where possible. Adaptations of the text must keep the licence.',
  reviewDue: REVIEW_DUE,
});

export const COMMONS_MEDIA = (licenseShort: string, credit: string, peopleIdentifiable: boolean): RightsInput => {
  const l = licenseShort.toLowerCase();
  const known = /cc by(-sa)? [34]\.0|cc0|godl/.test(l);
  if (!known) {
    return linkOnly(
      `Wikimedia Commons declares "${licenseShort}" with author "${credit}". Rights could not be verified, so this is a link-only record.`,
      'https://commons.wikimedia.org/wiki/Commons:Licensing',
    );
  }
  const shareAlike = l.includes('sa');
  return {
    status: 'attribution_required',
    license: licenseShort,
    attribution: `${credit}, ${licenseShort}, via Wikimedia Commons`,
    policyUrl: l.includes('godl')
      ? 'https://www.data.gov.in/Godl'
      : l.includes('cc0')
        ? 'https://creativecommons.org/publicdomain/zero/1.0/'
        : `https://creativecommons.org/licenses/${l.includes('sa') ? 'by-sa' : 'by'}/${l.includes('3.0') ? '3.0' : '4.0'}/`,
    metadataPublic: true,
    allowStoreOriginal: false,
    allowDownload: false,
    allowIndexText: true,
    allowQuote: true,
    allowAiProcessing: true,
    allowTransform: !peopleIdentifiable,
    allowRepublishMedia: !peopleIdentifiable,
    allowOffline: !peopleIdentifiable,
    peopleIdentifiable,
    rationale:
      `Licence "${licenseShort}" is declared in the Wikimedia Commons file metadata (not independently verified with the author).` +
      (shareAlike ? ' Adaptations such as carousel slides must be shared under the same licence.' : '') +
      (peopleIdentifiable
        ? ' The image shows identifiable people (officials), so its use in outreach exports is blocked until consent or publicity rights are reviewed.'
        : ''),
    reviewDue: REVIEW_DUE,
  };
};

export const OPENALEX_METADATA = (doi: string | null): RightsInput =>
  linkOnly(
    'Bibliographic metadata from OpenAlex (title, authors, venue, year, DOI). Metadata access does not grant rights to the article ' +
      'text, so abstracts and full text are not stored. Readers are sent to the publisher via the DOI.',
    doi,
  );

export const CC_BY_ARTICLE = (citation: string, doi: string | null): RightsInput => ({
  status: 'attribution_required',
  license: 'CC-BY (as reported by OpenAlex best open-access location)',
  attribution: citation,
  policyUrl: doi,
  metadataPublic: true,
  allowStoreOriginal: true,
  allowDownload: false, // link to publisher's version of record
  allowIndexText: true,
  allowQuote: true,
  allowAiProcessing: true,
  allowTransform: true,
  allowRepublishMedia: false, // article figures may carry third-party rights
  allowOffline: false,
  peopleIdentifiable: false,
  rationale:
    'OpenAlex reports a CC-BY licence for the open-access PDF. Text is indexed and quoted with attribution. Figures are not reused ' +
    'because they can carry separate rights. The licence should be confirmed on the publisher page before any wider reuse.',
  reviewDue: REVIEW_DUE,
});
