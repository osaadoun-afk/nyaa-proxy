const TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce'
];

export async function handleSearch(req, res, baseUrl) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { query } = req.query;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const rssUrl = `${baseUrl}/?page=rss&q=${encodeURIComponent(query)}&s=seeders&o=desc`;
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Upstream error', status: response.status });
    }

    const xml = await response.text();
    const items = parseRSS(xml);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function parseRSS(xml) {
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
    const sizeStr = extractTag(itemXml, 'nyaa:size');

    if (!infoHash || !title) continue;

    const trackerParams = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
    const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&${trackerParams}`;

    items.push({
      Name: title,
      Magnet: magnet,
      Seeders: parseInt(seeders) || 0,
      Leechers: parseInt(leechers) || 0,
      Downloads: parseInt(downloads) || 0,
      Size: parseSize(sizeStr),
      DateUploaded: pubDate
    });
  }

  return items;
}

function parseSize(str) {
  if (!str) return 0;
  const match = str.match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const mult = {
    'b': 1,
    'kib': 1024, 'kb': 1000,
    'mib': 1024 ** 2, 'mb': 1000 ** 2,
    'gib': 1024 ** 3, 'gb': 1000 ** 3,
    'tib': 1024 ** 4, 'tb': 1000 ** 4
  };
  return Math.round(num * (mult[unit] || 0));
}

function extractTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cdata = new RegExp(`<${escaped}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${escaped}>`);
  const cdataMatch = xml.match(cdata);
  if (cdataMatch) return cdataMatch[1].trim();

  const plain = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`);
  const plainMatch = xml.match(plain);
  return plainMatch ? plainMatch[1].trim() : '';
}
