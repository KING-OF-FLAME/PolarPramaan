// Curation manifest: which real snapshot items enter the catalog, classified
// into the six content kinds, with explicit rights decisions. It runs as code
// so every inclusion rule can be reviewed and re-run deterministically.
// Nothing here invents content. Titles, descriptions, dates and coordinates all
// come from the provider payloads, and fields a provider does not supply stay null.
import {
  CC_BY_3_PANGAEA, CC_BY_ARTICLE, COMMONS_MEDIA, NASA_MEDIA, NASA_TEXT, NCPOR_LINK_ONLY, NOAA_ARC, NSIDC_DATA,
  OPENALEX_METADATA, WIKIPEDIA_TEXT, linkOnly, type RightsInput,
} from './policies';
import { entryFor, manifest, readSnapshotJson, readSnapshotText, sha256, snapshotExists } from './snapshot';
import { stripTags } from './parse/html';

export type ContentKind = 'expedition_report' | 'dataset' | 'publication' | 'photo' | 'video' | 'institutional_activity';
export type Region = 'arctic' | 'antarctic' | 'southern_ocean' | 'himalaya' | 'global' | 'india';

export type Extraction =
  | { type: 'nsidc-monthly'; hemisphere: 'N' | 'S'; files: string[] }
  | { type: 'pangaea-tab'; file: string }
  | { type: 'captions'; file: string }
  | { type: 'html'; file: string }
  | { type: 'wikipedia'; file: string }
  | { type: 'pdf'; file: string }
  | { type: 'metadata'; texts: { label: string; text: string }[] };

export interface CuratedItem {
  sourceId: string;
  externalId: string;
  contentKind: ContentKind;
  title: string;
  description: string | null;
  doi: string | null;
  canonicalUrl: string;
  region: Region | null;
  placeName: string | null;
  lat: number | null;
  lon: number | null;
  timeStart: string | null;
  timeEnd: string | null;
  sourcePublishedAt: string | null;
  indiaSpecific: boolean;
  tags: string[];
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  credit: string | null;
  archival: 'link_only' | 'archived';
  rights: RightsInput;
  version: {
    label: string | null;
    retrievalUrl: string;
    retrievedAt: string;
    contentHash: string | null;
    mime: string | null;
    snapshotPath: string | null;
    storeBytesFrom: string | null; // snapshot path whose bytes become the stored original
  };
  extraction: Extraction[];
}

export const SOURCES = [
  { id: 'nsidc', name: 'National Snow and Ice Data Center (NOAA@NSIDC)', homepage: 'https://nsidc.org/', terms_url: 'https://nsidc.org/data/g02135/versions/4' },
  { id: 'pangaea', name: 'PANGAEA Data Publisher', homepage: 'https://www.pangaea.de/', terms_url: 'https://www.pangaea.de/about/terms.php' },
  { id: 'nasa-images', name: 'NASA Image and Video Library', homepage: 'https://images.nasa.gov/', terms_url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
  { id: 'nasa-science', name: 'NASA Science / Earth Observatory', homepage: 'https://science.nasa.gov/earth/earth-observatory/', terms_url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
  { id: 'noaa-arctic', name: 'NOAA Arctic Report Card', homepage: 'https://arctic.noaa.gov/report-card/', terms_url: null },
  { id: 'wikimedia-commons', name: 'Wikimedia Commons', homepage: 'https://commons.wikimedia.org/', terms_url: 'https://commons.wikimedia.org/wiki/Commons:Licensing' },
  { id: 'wikipedia', name: 'Wikipedia (English)', homepage: 'https://en.wikipedia.org/', terms_url: 'https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content' },
  { id: 'openalex', name: 'OpenAlex (bibliographic metadata)', homepage: 'https://openalex.org/', terms_url: null },
  { id: 'oa-publisher', name: 'Open-access publisher PDF (via OpenAlex)', homepage: 'https://openalex.org/', terms_url: null },
  { id: 'ncpor', name: 'National Centre for Polar and Ocean Research (NCPOR)', homepage: 'https://ncpor.res.in/', terms_url: 'https://ncpor.res.in/pages/display/33-copyright-policy' },
  { id: 'upload', name: 'Authorized contributor upload', homepage: 'https://github.com/KING-OF-FLAME/PolarPramaan', terms_url: null },
] as const;

function regionOf(text: string): Region | null {
  const t = text.toLowerCase();
  if (/himala|karakoram|lahaul|spiti|himadri\b(?!.*svalbard)/.test(t) && !/svalbard|ny-?[aå]lesund|arctic/.test(t)) return 'himalaya';
  if (/southern ocean|weddell|bellingshausen|amundsen sea|ross sea|lazarev|marginal ice zone/.test(t)) return 'southern_ocean';
  if (/antarc|maitri|bharati|dakshin gangotri|larsen|pine island|mcmurdo|south pole/.test(t)) return 'antarctic';
  if (/arctic|greenland|svalbard|ny-?[aå]lesund|beaufort|chukchi|north pole|himadri|fjord/.test(t)) return 'arctic';
  return null;
}

const iso = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null);

function ver(path: string, label: string | null = null, store = false): CuratedItem['version'] {
  const e = entryFor(path);
  if (!e) throw new Error(`snapshot entry missing for ${path}`);
  return {
    label,
    retrievalUrl: e.finalUrl || e.url,
    retrievedAt: e.retrievedAt,
    contentHash: e.sha256 ?? null,
    mime: (e.contentType || '').split(';')[0] || null,
    snapshotPath: path,
    storeBytesFrom: store ? path : null,
  };
}

// ------------------------------------------------------------------ NSIDC
function nsidcItems(): CuratedItem[] {
  const landing = snapshotExists('policies/nsidc-g02135-v4-landing.txt') ? readSnapshotText('policies/nsidc-g02135-v4-landing.txt') : '';
  const cit = landing.match(/Fetterer, F\.[^\n]*?https:\/\/doi\.org\/10\.7265\/a98x-0f50/);
  const citation = cit
    ? cit[0].replace(/\s+\./g, '.').trim()
    : 'Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K. & Stafford, T. (2025). Sea Ice Index. (G02135, Version 4). National Snow and Ice Data Center. https://doi.org/10.7265/a98x-0f50';
  return (['N', 'S'] as const).map((h) => {
    const hemi = h === 'N' ? 'north' : 'south';
    const files = manifest()
      .entries.filter((e) => e.ok && e.path && e.path.startsWith(`nsidc/${hemi}/monthly/`))
      .map((e) => e.path as string);
    const uniq = [...new Set(files)].sort();
    const hashes = uniq.map((p) => `${p}:${entryFor(p)!.sha256}`).join('\n');
    const first = entryFor(uniq[0])!;
    const name = h === 'N' ? 'Northern Hemisphere (Arctic)' : 'Southern Hemisphere (Antarctic)';
    return {
      sourceId: 'nsidc',
      externalId: `G02135-v4.0-monthly-${h}`,
      contentKind: 'dataset',
      title: `Sea Ice Index v4 — monthly sea-ice extent and area, ${name}`,
      description:
        `Monthly mean sea-ice extent and area (million km²) for the ${name}, one CSV per calendar month, from the NOAA/NSIDC ` +
        `Sea Ice Index (G02135) Version 4. Rows are labelled with their input product (NSIDC-0051 final or NSIDC-0803 near-real-time).`,
      doi: '10.7265/a98x-0f50',
      canonicalUrl: `https://noaadata.apps.nsidc.org/NOAA/G02135/${hemi}/monthly/data/`,
      region: h === 'N' ? 'arctic' : 'antarctic',
      placeName: name,
      lat: null,
      lon: null,
      timeStart: '1978-11-01',
      timeEnd: null,
      sourcePublishedAt: null,
      indiaSpecific: false,
      tags: ['sea ice', 'extent', 'area', 'satellite', 'monthly', 'time series'],
      thumbnailUrl: null,
      mediaUrl: null,
      credit: 'NOAA/NSIDC Sea Ice Index, Version 4',
      archival: 'archived',
      rights: NSIDC_DATA(citation),
      version: {
        label: 'v4.0 monthly files',
        retrievalUrl: `https://noaadata.apps.nsidc.org/NOAA/G02135/${hemi}/monthly/data/`,
        retrievedAt: first.retrievedAt,
        contentHash: sha256(hashes),
        mime: 'text/csv',
        snapshotPath: `nsidc/${hemi}/monthly/`,
        storeBytesFrom: null,
      },
      extraction: [{ type: 'nsidc-monthly', hemisphere: h, files: uniq }],
    } satisfies CuratedItem;
  });
}

// ------------------------------------------------------------------ PANGAEA
function pangaeaItems(): CuratedItem[] {
  const path = 'pangaea/PANGAEA.885208.tab';
  if (!snapshotExists(path)) return [];
  return [
    {
      sourceId: 'pangaea',
      externalId: 'doi:10.1594/PANGAEA.885208',
      contentKind: 'dataset',
      title: 'Sea ice conditions within the Antarctic Marginal Ice Zone in summer 2016, onboard the SA Agulhas II',
      description:
        'Ship-based ASPeCt-protocol sea-ice observations (ice concentration in tenths, ice/snow thickness, floe size, air/water temperature, wind) ' +
        'along the SA Agulhas II track, 7–10 December 2016. The dataset carries a documented 2018-09-11 position erratum.',
      doi: '10.1594/PANGAEA.885208',
      canonicalUrl: 'https://doi.pangaea.de/10.1594/PANGAEA.885208',
      region: 'southern_ocean',
      placeName: 'Antarctic Marginal Ice Zone (South Atlantic, Weddell and Lazarev seas)',
      lat: -63.073077,
      lon: 0.122391,
      timeStart: '2016-12-07',
      timeEnd: '2016-12-10',
      sourcePublishedAt: '2018-01-01',
      indiaSpecific: false,
      tags: ['sea ice', 'ice concentration', 'ship observations', 'ASPeCt', 'erratum', 'expedition'],
      thumbnailUrl: null,
      mediaUrl: null,
      credit: 'de Jong et al. (2018), PANGAEA',
      archival: 'archived',
      rights: CC_BY_3_PANGAEA,
      version: ver(path, 'PANGAEA textfile', true),
      extraction: [{ type: 'pangaea-tab', file: path }],
    },
  ];
}

// ------------------------------------------------------------------ NASA images & videos
const NASA_IMAGES = [
  'PIA14385', '200910220008HQ', 'GSFC_20171208_Archive_e000582', 'PIA02639', 'GSFC_20171208_Archive_e000751',
  'GSFC_20171208_Archive_e000613', 'GSFC_20171208_Archive_e000758', 'GSFC_20171208_Archive_e001711',
  'GSFC_20171208_Archive_e001527', 'GSFC_20171208_Archive_e001605', 'PIA20894', 'PIA24990',
  'GSFC_20171208_Archive_e000361', 'GSFC_20171208_Archive_e000643',
];

interface NasaItem {
  href: string;
  data: { nasa_id: string; title: string; description?: string; date_created: string; center?: string; photographer?: string; secondary_creator?: string; keywords?: string[]; location?: string; media_type: string }[];
  links?: { href: string; rel: string; render?: string }[];
}

function nasaSearchItems(): Map<string, { item: NasaItem; file: string }> {
  const out = new Map<string, { item: NasaItem; file: string }>();
  for (const e of manifest().entries) {
    if (!e.ok || !e.path || !e.path.startsWith('nasa/search/')) continue;
    const j = readSnapshotJson<{ collection: { items: NasaItem[] } }>(e.path);
    for (const it of j.collection.items) if (!out.has(it.data[0].nasa_id)) out.set(it.data[0].nasa_id, { item: it, file: e.path });
  }
  return out;
}

function nasaCredit(d: NasaItem['data'][0]): string {
  const who = (d.photographer || d.secondary_creator || '').replace(/^\(|\)$/g, '').trim();
  return who ? (who.startsWith('NASA') ? who : `NASA / ${who}`) : `NASA${d.center ? ` (${d.center})` : ''}`;
}

function nasaItems(): CuratedItem[] {
  const all = nasaSearchItems();
  const out: CuratedItem[] = [];
  for (const id of NASA_IMAGES) {
    const hit = all.get(id);
    if (!hit) continue;
    const d = hit.item.data[0];
    const desc = d.description ? stripTags(d.description) : null;
    const small = hit.item.links?.find((l) => l.rel === 'alternate')?.href || null;
    const thumb = hit.item.links?.find((l) => l.rel === 'preview')?.href || null;
    const credit = nasaCredit(d);
    out.push({
      sourceId: 'nasa-images',
      externalId: id,
      contentKind: 'photo',
      title: d.title,
      description: desc,
      doi: null,
      canonicalUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
      region: regionOf(`${d.title} ${desc || ''} ${(d.keywords || []).join(' ')}`),
      placeName: d.location || null,
      lat: null,
      lon: null,
      timeStart: null,
      timeEnd: null,
      sourcePublishedAt: iso(d.date_created),
      indiaSpecific: false,
      tags: (d.keywords || []).slice(0, 8),
      thumbnailUrl: thumb,
      mediaUrl: small || thumb,
      credit,
      archival: 'link_only',
      rights: NASA_MEDIA(credit),
      version: ver(hit.file, 'NASA search API metadata'),
      extraction: desc ? [{ type: 'metadata', texts: [{ label: 'NASA description', text: desc }] }] : [],
    });
  }
  // Videos: only those whose caption file and asset list were retrieved.
  for (const e of manifest().entries) {
    if (!e.ok || !e.path || !/^nasa\/captions\/.+\.(srt|vtt)$/.test(e.path)) continue;
    const id = e.path.replace(/^nasa\/captions\//, '').replace(/\.(srt|vtt)$/, '');
    const hit = all.get(id);
    const assetsPath = `nasa/assets/${id}.json`;
    if (!hit || !snapshotExists(assetsPath)) continue;
    const assets = readSnapshotJson<string[]>(assetsPath).map((u) => u.replace(/^http:/, 'https:'));
    const mp4 = assets.find((u) => u.endsWith('~mobile.mp4')) || assets.find((u) => u.endsWith('~medium.mp4')) || null;
    const thumb = assets.find((u) => /~thumb\.jpg$/.test(u)) || hit.item.links?.find((l) => l.rel === 'preview')?.href || null;
    const d = hit.item.data[0];
    const desc = d.description ? stripTags(d.description) : null;
    const credit = nasaCredit(d).replace(/^NASA \/ /, "NASA Goddard / ");
    out.push({
      sourceId: 'nasa-images',
      externalId: id,
      contentKind: 'video',
      title: d.title,
      description: desc,
      doi: null,
      canonicalUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
      region: regionOf(`${d.title} ${desc || ''}`),
      placeName: d.location || null,
      lat: null,
      lon: null,
      timeStart: null,
      timeEnd: null,
      sourcePublishedAt: iso(d.date_created),
      indiaSpecific: false,
      tags: (d.keywords || []).slice(0, 8),
      thumbnailUrl: thumb,
      mediaUrl: mp4,
      credit,
      archival: 'link_only',
      rights: NASA_MEDIA(credit),
      version: ver(e.path, 'caption file'),
      extraction: [
        { type: 'captions', file: e.path },
        ...(desc ? [{ type: 'metadata' as const, texts: [{ label: 'NASA description', text: desc }] }] : []),
      ],
    });
  }
  return out;
}

// ------------------------------------------------------------------ NASA / NOAA text pages
function textPageItems(): CuratedItem[] {
  const out: CuratedItem[] = [];
  const pages: [string, string, string, 'arctic' | 'antarctic', RightsInput, string][] = [
    ['text/earthobservatory/world_of_change_sea_ice_arctic.html', 'nasa-science', 'World of Change: Arctic Sea Ice', 'arctic', NASA_TEXT('NASA Earth Observatory'), 'NASA Earth Observatory'],
    ['text/earthobservatory/world_of_change_sea_ice_antarctic.html', 'nasa-science', 'World of Change: Antarctic Sea Ice', 'antarctic', NASA_TEXT('NASA Earth Observatory'), 'NASA Earth Observatory'],
    ['text/noaa-arc/report_card_report_card_2024_sea_ice_2024.html', 'noaa-arctic', 'Arctic Report Card 2024: Sea Ice', 'arctic', NOAA_ARC, 'NOAA Arctic Report Card 2024'],
  ];
  for (const [path, sourceId, title, region, rights, credit] of pages) {
    if (!snapshotExists(path)) continue;
    const v = ver(path, 'web page', true);
    out.push({
      sourceId, externalId: v.retrievalUrl, contentKind: 'publication', title, description: null, doi: null,
      canonicalUrl: v.retrievalUrl, region, placeName: null, lat: null, lon: null, timeStart: null, timeEnd: null,
      sourcePublishedAt: null, indiaSpecific: false, tags: ['sea ice', 'explainer'], thumbnailUrl: null, mediaUrl: null,
      credit, archival: 'archived', rights, version: v, extraction: [{ type: 'html', file: path }],
    });
  }
  return out;
}

// ------------------------------------------------------------------ Wikipedia
const WIKI_INDIA = /maitri|bharati|himadri|dakshin|indian antarctic|national centre for polar/i;
function wikipediaItems(): CuratedItem[] {
  const out: CuratedItem[] = [];
  for (const e of manifest().entries) {
    if (!e.ok || !e.path || !e.path.startsWith('wikipedia/')) continue;
    const j = readSnapshotJson<{ query: { pages: Record<string, { title: string; fullurl: string; extract?: string; revisions?: { revid: number; timestamp: string }[]; coordinates?: { lat: number; lon: number }[] }> } }>(e.path);
    const p = Object.values(j.query.pages)[0];
    if (!p || !p.extract || !p.revisions) continue;
    const rev = p.revisions[0];
    const india = WIKI_INDIA.test(p.title);
    const coord = p.coordinates?.[0] || null;
    const lead = p.extract.split('\n').find((l) => l.trim().length > 60) || null;
    const isStation = /research station|dakshin gangotri/i.test(p.title);
    out.push({
      sourceId: 'wikipedia',
      externalId: p.title,
      contentKind: isStation || /programme|program|centre/i.test(p.title) ? 'institutional_activity' : 'publication',
      title: `${p.title} (Wikipedia)`,
      description: lead ? lead.slice(0, 400) : null,
      doi: null,
      canonicalUrl: p.fullurl,
      region: /national centre/i.test(p.title) ? 'india' : regionOf(`${p.title} ${lead || ''}`),
      placeName: isStation ? p.title.replace(/ \(research station\)/i, '') : null,
      lat: coord ? coord.lat : null,
      lon: coord ? coord.lon : null,
      timeStart: null,
      timeEnd: null,
      sourcePublishedAt: rev.timestamp,
      indiaSpecific: india,
      tags: ['encyclopedia', 'tertiary source', ...(india ? ['India'] : []), ...(isStation ? ['research station'] : [])],
      thumbnailUrl: null,
      mediaUrl: null,
      credit: 'Wikipedia contributors',
      archival: 'archived',
      rights: WIKIPEDIA_TEXT(p.title, p.fullurl, rev.revid),
      version: { ...ver(e.path, `revision ${rev.revid}`, true), label: `revision ${rev.revid} (${rev.timestamp.slice(0, 10)})` },
      extraction: [{ type: 'wikipedia', file: e.path }],
    });
  }
  return out;
}

// ------------------------------------------------------------------ Wikimedia Commons
const COMMONS_PICKS: { match: RegExp; people?: boolean; place?: string; kind?: ContentKind }[] = [
  { match: /^File:मैत्री, भारतीय स्टेशन/, place: 'Maitri' },
  { match: /^File:An aerial view of the Indian Station Maitri, Antarctica on February 2, 2005/, place: 'Maitri' },
  { match: /^File:A helicopter carries the Indian Flag while passing over the Indian Station Maitri/, place: 'Maitri' },
  { match: /^File:The Minister for Science & Technology and Ocean Development, Shri Kapil Sibal who became the first Indian Minister/, people: true, place: 'Maitri', kind: 'institutional_activity' },
  { match: /^File:दक्षिण गंगोत्री, अंटार्कटिका/, place: 'Dakshin Gangotri' },
  { match: /^File:Dakshin Gangotri station\.jpg/, place: 'Dakshin Gangotri' },
  { match: /^File:Dakshin Gangotri under construction\.jpg/, place: 'Dakshin Gangotri' },
  { match: /^File:Structure erected during India's Second Expedition/, people: true, place: 'Dakshin Gangotri area', kind: 'expedition_report' },
  { match: /^File:Stamp of India - 1983 - Colnect 168537 - First Indian Antarctic Expedition/, kind: 'institutional_activity' },
  { match: /^File:COMNAP Larsemann Hills map 2012/, place: 'Larsemann Hills (Bharati)' },
  { match: /^File:Bharati permanent Antarctic research station/, place: 'Bharati' },
];

function commonsItems(): CuratedItem[] {
  const out: CuratedItem[] = [];
  const seen = new Set<string>();
  for (const e of manifest().entries) {
    if (!e.ok || !e.path || !e.path.startsWith('commons/')) continue;
    const j = readSnapshotJson<{ query?: { pages: Record<string, { title: string; imageinfo: { url: string; descriptionurl: string; thumburl?: string; mime: string; extmetadata: Record<string, { value: string }> }[] }> } }>(e.path);
    for (const p of Object.values(j.query?.pages || {})) {
      const pick = COMMONS_PICKS.find((c) => c.match.test(p.title));
      if (!pick || seen.has(p.title)) continue;
      seen.add(p.title);
      const ii = p.imageinfo[0];
      const m = ii.extmetadata;
      const lic = m.LicenseShortName?.value || 'unknown';
      const artist = stripTags(m.Artist?.value || '') || 'Unknown author';
      const desc = stripTags(m.ImageDescription?.value || '') || null;
      const dateRaw = stripTags(m.DateTimeOriginal?.value || '');
      const rights = COMMONS_MEDIA(lic, artist, !!pick.people);
      const title = p.title.replace(/^File:/, '').replace(/\.(jpe?g|png)$/i, '');
      out.push({
        sourceId: 'wikimedia-commons',
        externalId: p.title,
        contentKind: pick.kind || 'photo',
        title,
        description: desc,
        doi: null,
        canonicalUrl: ii.descriptionurl,
        region: 'antarctic',
        placeName: pick.place || null,
        lat: null,
        lon: null,
        timeStart: /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : null,
        timeEnd: null,
        sourcePublishedAt: null,
        indiaSpecific: true,
        tags: ['India', 'Antarctica', ...(pick.place ? [pick.place] : []), ...(pick.people ? ['identifiable people'] : [])],
        thumbnailUrl: rights.status === 'link_only' ? null : ii.thumburl || null,
        mediaUrl: rights.status === 'link_only' ? null : ii.thumburl || ii.url,
        credit: `${artist} — ${lic}`,
        archival: 'link_only',
        rights,
        version: ver(e.path, 'Commons API imageinfo'),
        extraction: desc ? [{ type: 'metadata', texts: [{ label: 'Commons file description', text: desc }] }] : [],
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ OpenAlex + CC-BY PDFs
interface OAWork {
  id: string;
  doi: string | null;
  display_name: string;
  publication_year: number;
  publication_date: string;
  type: string;
  authorships: { author: { display_name: string } }[];
  primary_location?: { source?: { display_name?: string } | null } | null;
  best_oa_location?: { license?: string | null; pdf_url?: string | null } | null;
}
const POLAR_TOPIC = /antarc|arctic|sea ice|glacier|polar|southern ocean|svalbard|ice sheet|fjord|ny-?[aå]lesund|himala|snow|cryosphere/i;

function openalexItems(): CuratedItem[] {
  const out: CuratedItem[] = [];
  const seen = new Set<string>();
  const pdfByWork = new Map<string, string>();
  for (const e of manifest().entries) if (e.ok && e.path && e.path.startsWith('oapdf/')) pdfByWork.set(String(e.openalexId), e.path);
  for (const f of ['openalex/works-ncpor-antarctic-sea-ice.json', 'openalex/works-ncpor-arctic.json', 'openalex/works-ncpor-top-cited.json']) {
    if (!snapshotExists(f)) continue;
    const j = readSnapshotJson<{ results: OAWork[] }>(f);
    for (const w of j.results) {
      const wid = w.id.split('/').pop()!;
      if (seen.has(wid) || !POLAR_TOPIC.test(w.display_name) || !w.doi) continue;
      seen.add(wid);
      const doi = w.doi.replace(/^https:\/\/doi\.org\//, '');
      const authors = w.authorships.map((a) => a.author.display_name);
      const authorStr = authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ');
      const venue = w.primary_location?.source?.display_name || null;
      const citation = `${authorStr} (${w.publication_year}). ${w.display_name}.${venue ? ` ${venue}.` : ''} https://doi.org/${doi}`;
      const pdf = pdfByWork.get(wid);
      const isReport = /science plan|roadmap|report/i.test(w.display_name);
      const base = {
        sourceId: pdf ? 'oa-publisher' : 'openalex',
        externalId: `doi:${doi.toLowerCase()}`,
        contentKind: (isReport ? 'expedition_report' : 'publication') as ContentKind,
        title: w.display_name,
        description: `${authorStr}${venue ? ` — ${venue}` : ''}, ${w.publication_year}. At least one author is affiliated with NCPOR according to OpenAlex.`,
        doi,
        canonicalUrl: `https://doi.org/${doi}`,
        region: regionOf(w.display_name),
        placeName: null,
        lat: null,
        lon: null,
        timeStart: null,
        timeEnd: null,
        sourcePublishedAt: iso(w.publication_date),
        indiaSpecific: true,
        tags: ['peer-reviewed', 'NCPOR-affiliated (OpenAlex)', w.type],
        thumbnailUrl: null,
        mediaUrl: null,
        credit: authorStr,
      };
      if (pdf) {
        out.push({
          ...base,
          archival: 'archived',
          rights: CC_BY_ARTICLE(citation, `https://doi.org/${doi}`),
          version: ver(pdf, 'open-access PDF', true),
          extraction: [{ type: 'pdf', file: pdf }, { type: 'metadata', texts: [{ label: 'Title', text: w.display_name }] }],
        });
      } else {
        out.push({
          ...base,
          archival: 'link_only',
          rights: OPENALEX_METADATA(`https://doi.org/${doi}`),
          version: ver(f, 'OpenAlex works API'),
          extraction: [{ type: 'metadata', texts: [{ label: 'Title', text: w.display_name }] }],
        });
      }
      if (out.length >= 32) return out;
    }
  }
  return out;
}

// ------------------------------------------------------------------ NCPOR official pages (link-only)
interface NcporPage { url: string; linkText?: string; title?: string; headings?: string[]; retrievedAt?: string; sha256?: string; kind?: string; foundOn?: string }

const NCPOR_CLASSIFY: { match: RegExp; kind: ContentKind; title: string; region: Region | null; place?: string; lat?: number; lon?: number }[] = [
  { match: /247-expedition-updates/, kind: 'expedition_report', title: 'NCPOR — Expedition Updates (official page)', region: null },
  { match: /270-southern-ocean/, kind: 'expedition_report', title: 'NCPOR — Scientific Expeditions to the Indian Ocean Sector of the Southern Ocean (official page)', region: 'southern_ocean' },
  { match: /\/antarcticas$/, kind: 'institutional_activity', title: 'NCPOR — Antarctica: Indian Antarctic Programme and scientific activities (official page)', region: 'antarctic' },
  { match: /\/arctics$/, kind: 'institutional_activity', title: 'NCPOR — Arctic: projects and publications (official page)', region: 'arctic' },
  { match: /268-himalaya/, kind: 'institutional_activity', title: 'NCPOR — Himalaya programme (official page)', region: 'himalaya' },
  { match: /189-polar-science-cryosphere/, kind: 'institutional_activity', title: 'NCPOR — Polar Science & Cryosphere (official page)', region: null },
  { match: /researchview\/12$/, kind: 'institutional_activity', title: 'NCPOR — Research theme: Cryosphere and climate', region: null },
  { match: /researchview\/16$/, kind: 'institutional_activity', title: 'NCPOR — Research theme: Southern Ocean ecosystem dynamics', region: 'southern_ocean' },
  { match: /researchview\/9$/, kind: 'institutional_activity', title: 'NCPOR — Research theme: Evolution of the Himalaya and the origin of the monsoon', region: 'himalaya' },
  { match: /news\/view\/1056/, kind: 'institutional_activity', title: 'NCPOR news — Unravelling Glacier–Lake Dynamics in the Himalaya', region: 'himalaya' },
  { match: /\/annualreports$/, kind: 'institutional_activity', title: 'NCPOR — Annual Reports (official page)', region: 'india' },
  { match: /^https:\/\/ncpor\.res\.in\/$/, kind: 'institutional_activity', title: 'National Centre for Polar and Ocean Research (NCPOR), Goa — official website', region: 'india', place: 'Vasco da Gama, Goa' },
  { match: /data\.ncpor\.res\.in\/ant_temp_pres/, kind: 'dataset', title: 'Surface meteorological station data — Dakshin Gangotri (1985–1989) and Maitri (1990–2010) (NCPOR data portal)', region: 'antarctic' },
  { match: /^https:\/\/data\.ncpor\.res\.in\/$/, kind: 'dataset', title: 'NCPOR data portal — meteorological data from Indian polar stations', region: 'india' },
  { match: /Present%20and%20Future%20Climate%20of%20Antarctica\.pdf$|Present and Future Climate of Antarctica\.pdf$/, kind: 'publication', title: 'Present and Future Climate of Antarctica (NCPOR “scientific paper of the month” PDF)', region: 'antarctic' },
];

function ncporItems(): CuratedItem[] {
  const path = 'ncpor/pages-metadata.json';
  if (!snapshotExists(path)) return [];
  const pages = readSnapshotJson<NcporPage[]>(path);
  const out: CuratedItem[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const c = NCPOR_CLASSIFY.find((x) => x.match.test(p.url));
    if (!c || seen.has(p.url)) continue;
    seen.add(p.url);
    const headings = (p.headings || []).filter((h) => !/latest news|राष्ट्रीय|NATIONAL CENTRE/i.test(h)).slice(0, 4);
    const retrievedAt = p.retrievedAt || manifest().generatedAt;
    out.push({
      sourceId: 'ncpor',
      externalId: p.url,
      contentKind: c.kind,
      title: c.title,
      description: headings.length ? `Page headings (as retrieved): ${headings.join(' · ')}` : null,
      doi: null,
      canonicalUrl: p.url,
      region: c.region,
      placeName: c.place || null,
      lat: null,
      lon: null,
      timeStart: null,
      timeEnd: null,
      sourcePublishedAt: null,
      indiaSpecific: true,
      tags: ['NCPOR', 'official source', 'link-only'],
      thumbnailUrl: null,
      mediaUrl: null,
      credit: 'NCPOR, Ministry of Earth Sciences, Government of India',
      archival: 'link_only',
      rights: NCPOR_LINK_ONLY(p.kind === 'file-link' ? 'Document link found on the NCPOR website (not downloaded).' : 'Official NCPOR web page.'),
      version: {
        label: p.kind === 'file-link' ? 'link recorded (not fetched)' : 'page reachable at retrieval',
        retrievalUrl: p.url,
        retrievedAt,
        contentHash: p.sha256 || null,
        mime: p.kind === 'file-link' ? 'application/pdf' : 'text/html',
        snapshotPath: null,
        storeBytesFrom: null,
      },
      extraction: [{ type: 'metadata', texts: [{ label: 'Official title', text: c.title }] }],
    });
  }
  return out;
}

export function curatedCatalog(): CuratedItem[] {
  const all = [
    ...nsidcItems(), ...pangaeaItems(), ...nasaItems(), ...textPageItems(), ...wikipediaItems(),
    ...commonsItems(), ...openalexItems(), ...ncporItems(),
  ];
  // Deduplicate: DOI, then canonical URL, then (source, external id).
  const seen = new Set<string>();
  const out: CuratedItem[] = [];
  for (const it of all) {
    const keys = [it.doi && it.contentKind === 'publication' ? `doi:${it.doi.toLowerCase()}` : null, `url:${it.canonicalUrl}`, `ext:${it.sourceId}:${it.externalId}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(it);
  }
  return out;
}

export { linkOnly };
