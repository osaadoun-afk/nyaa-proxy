const TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { query } = req.query;
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query required' });
    return;
  }

  try {
    const rssUrl = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&s=seeders&o=desc`;
    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      res.status(502).json({ error: 'Nyaa upstream error', status: response.status });
      return;
    }

    const xml = await response.text();
    const items = parseNyaaRSS(xml);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function parseNyaaRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractTag(itemXml, 'title');
    const pubDate = extractTag(itemXml, 'pubDate');
    const seeders = extractTag(itemXml, 'nyaa:seeders');
    const leechers = extractTag(itemXml, 'nyaa:leechers');
    const downloads = extractTag(itemXml, 'nyaa:downloads');
    const infoHash = extractTag(itemXml, 'nyaa:infoHash');
    const size = extractTag(itemXml, 'nyaa:size');

    if (!infoHash || !title) continue;

    const trackerParams = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
    const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&${trackerParams}`;

    items.push({
      Name: title,
      Magnet: magnet,
      Seeders: parseInt(seeders) || 0,
      Leechers: parseInt(leechers) || 0,
      Downloads: parseInt(downloads) || 0,
      Size: size,
      DateUploaded: pubDate
    });
  }

  return items;
}

function extractTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cdataRegex = new RegExp(`<${escaped}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${escaped}>`);
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainRegex = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`);
  const plainMatch = xml.match(plainRegex);
  return plainMatch ? plainMatch[1].trim() : '';
}
