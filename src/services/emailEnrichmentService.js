const DEFAULT_CONTACT_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us'];
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BLOCKED_DOMAINS = new Set([
  'example.com',
  'sentry.io',
  'wixpress.com',
  'wordpress.com',
  'squarespace.com'
]);

export default class EmailEnrichmentService {
  constructor({ logger, fetchImpl = globalThis.fetch, timeoutMs = 8000, maxPagesPerSite = 4 } = {}) {
    this.logger = logger;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxPagesPerSite = maxPagesPerSite;
  }

  async enrichLeads(leads) {
    const enriched = [];
    let found = 0;

    for (const lead of leads) {
      if (lead.email || !lead.website) {
        enriched.push(lead);
        continue;
      }

      const email = await this.findEmailForWebsite(lead.website);
      if (email) {
        found += 1;
        enriched.push({ ...lead, email, email_source: 'website' });
      } else {
        enriched.push(lead);
      }
    }

    this.logger?.info(`Website email enrichment found ${found} email${found === 1 ? '' : 's'}.`);
    return enriched;
  }

  async findEmailForWebsite(website) {
    const baseUrl = normalizeWebsiteUrl(website);
    if (!baseUrl) return null;

    const urls = buildCandidateUrls(baseUrl).slice(0, this.maxPagesPerSite);
    for (const url of urls) {
      try {
        const html = await this.fetchText(url);
        const email = pickBestEmail(extractEmails(html), baseUrl.hostname);
        if (email) return email;
      } catch (error) {
        this.logger?.debug?.(`Email enrichment failed for ${url}: ${error.message}`);
      }
    }

    return null;
  }

  async fetchText(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'accept': 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (compatible; GleamLeadBot/1.0)'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.includes('text/html')) return '';
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeWebsiteUrl(website) {
  if (!website || typeof website !== 'string') return null;
  try {
    const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function buildCandidateUrls(baseUrl) {
  return DEFAULT_CONTACT_PATHS.map((pathname) => new URL(pathname, baseUrl));
}

function extractEmails(html) {
  return decodeHtmlEntities(html)
    .replace(/\s*\[at\]\s*/gi, '@')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\[dot\]\s*/gi, '.')
    .replace(/\s*\(dot\)\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.')
    .match(EMAIL_RE) || [];
}

function pickBestEmail(emails, websiteHost) {
  const siteDomain = rootDomain(websiteHost);
  const unique = [...new Set(emails.map(email => email.toLowerCase()))]
    .filter(email => !isAssetEmail(email))
    .filter(email => !BLOCKED_DOMAINS.has(rootDomain(email.split('@')[1])));

  return unique.find(email => rootDomain(email.split('@')[1]) === siteDomain)
    || unique.find(email => /^(info|hello|contact|admin|office|sales)@/i.test(email))
    || unique[0]
    || null;
}

function isAssetEmail(email) {
  return /\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email);
}

function rootDomain(hostname) {
  const parts = String(hostname || '').replace(/^www\./i, '').split('.').filter(Boolean);
  return parts.slice(-2).join('.');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#64;/g, '@')
    .replace(/&#x40;/gi, '@')
    .replace(/&commat;/gi, '@')
    .replace(/&#46;/g, '.')
    .replace(/&#x2e;/gi, '.')
    .replace(/&period;/gi, '.');
}
