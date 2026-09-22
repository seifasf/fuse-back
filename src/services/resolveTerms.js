/** Resolve event-specific or site-default terms for emails / public pages. */
import { SiteContent } from '../models/SiteContent.js';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../constants/terms.js';

let cachedSiteTerms = { value: null, expires: 0 };

export async function resolveTerms(eventTerms) {
  const custom = typeof eventTerms === 'string' ? eventTerms.trim() : '';
  if (custom) return custom;
  if (cachedSiteTerms.expires > Date.now() && cachedSiteTerms.value != null) {
    return cachedSiteTerms.value;
  }
  const content = await SiteContent.findOne({ key: 'home' }).select('termsAndConditions').lean();
  const siteTerms = content?.termsAndConditions?.trim() || DEFAULT_TERMS_AND_CONDITIONS;
  cachedSiteTerms = { value: siteTerms, expires: Date.now() + 60_000 };
  return siteTerms;
}
