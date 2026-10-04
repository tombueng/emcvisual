/**
 * Search-engine and AI-crawler metadata, generated from branding.config.json and
 * seo.config.json so the project name and URL live in one place (docs/RENAMING.md):
 * head tags, JSON-LD, robots.txt, sitemap.xml and llms.txt.
 */
import type { Plugin } from 'vite';
import branding from '../../branding.config.json' with { type: 'json' };
import seo from '../../seo.config.json' with { type: 'json' };

const repoUrl = `https://github.com/${branding.repo}`;
const docs = (path: string) => `${repoUrl}/blob/main/${path}`;
const ogImage = `${branding.siteUrl}og-image.png`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** 0BSD (LICENSE in the repo). */
const LICENSE_URL = 'https://opensource.org/license/0bsd';

function jsonLd(): string {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: branding.displayName,
      url: branding.siteUrl,
      description: seo.description,
      applicationCategory: 'DesignApplication',
      applicationSubCategory: seo.applicationSubCategory,
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript and WebGL 2',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      inLanguage: ['en', 'de'],
      keywords: seo.keywords.join(', '),
      featureList: seo.features,
      image: ogImage,
      screenshot: ogImage,
      author: { '@type': 'Person', name: branding.author, url: branding.authorUrl },
      license: LICENSE_URL,
      sameAs: [repoUrl],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: branding.displayName,
      description: seo.description,
      codeRepository: repoUrl,
      programmingLanguage: ['TypeScript', 'Svelte'],
      runtimePlatform: 'Web browser',
      license: LICENSE_URL,
      keywords: seo.keywords.join(', '),
      author: { '@type': 'Person', name: branding.author, url: branding.authorUrl },
    },
  ];
  // keep "</script>" out of the inline JSON
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function llmsTxt(): string {
  return `# ${branding.displayName}

> ${seo.description}

${branding.displayName} is a free, open-source (0BSD) web app for electronics and PCB designers. It reads
a KiCad board file (.kicad_pcb, KiCad 6 to 10), lets you mark the noisy parts of the circuit (clock
and data lines, differential pairs such as USB, the hot loop of a switching regulator / buck
converter, storage inductors) and computes the magnetic and electric near field around the board.
The result is a 3D scene: the field glows above the copper or shows as isosurfaces, field lines
show where the current loops close, a virtual near-field probe shows a spectrum like a spectrum
analyzer, and every source can be heard (tones or a Geiger counter).

It is meant for EMC/EMI work before the lab (EMC pre-compliance), for PCB layout reviews and for
learning: you can see why a slot in a ground plane under a clock line, a layer change from a
GND to a VCC reference plane, or a large switching-regulator loop makes a board louder. Return
currents detour around plane slots and jump through the nearest stitching via or capacitor, and
the detours are drawn in 3D.

How it works: quasi-static Biot-Savart field of straight current filaments, return currents as
mirror images in the reference planes plus geodesic detours through plane copper, shielding by
planes, line and point charges for the electric field, trapezoid line spectra, and a far-field
estimate from the magnetic dipole moment against CISPR 32 class B. For resonances it exports an
openEMS (FDTD) job; the full-wave result loads back as a second field source, and both agree
within about 1 dB in the quasi-static range. It does not predict whether a product passes an EMC
test (no cables or enclosures). Everything runs in the browser; the board file is not uploaded.

More: a near-field scanner chain (3D printer with OctoPrint or USB G-code, tinySA receiver; a
virtual rig for trying it without hardware) with fitting of the source amplitudes to a scan, an
HTML EMC report, live reload when KiCad saves the board, a command-line field check for CI that
flags pull requests making the near field or far-field margin worse, and an experimental VR view.

German: EMV-Simulation für Leiterplatten im Browser. KiCad-Platine laden, Störquellen festlegen,
magnetisches Nahfeld in 3D sehen und hören, Rückstrompfade und CISPR 32 prüfen.

Keywords: ${seo.keywords.join(', ')}

## App
- [${branding.displayName} web app](${branding.siteUrl}): runs in the browser, includes a demo board with typical EMC mistakes

## Docs
- [README](${docs('README.md')}): overview, features, how to run it locally
- [Stage 1 plan](${docs('docs/stufe-1/PLAN.md')}): goals, milestones, measured numbers (German)
- [Physics model](${docs('docs/stufe-1/PHYSIK.md')}): formulas, assumptions, validity limits, literature (German)
- [Architecture](${docs('docs/stufe-1/ARCHITEKTUR.md')}): modules, compute and render pipeline (German)

## Optional
- [Roadmap](${docs('docs/ROADMAP.md')}): stages, measurement hardware, openEMS (German)
- [Field check for CI](${docs('docs/CI-FELDCHECK.md')}): command line, GitHub Actions example (German)
- [openEMS workflow](${docs('tools/openems/README.md')}): full-wave export, run, import (German)
- [License: 0BSD](${docs('LICENSE')})
- [Source code](${repoUrl})
`;
}

const robotsTxt = () => `User-agent: *\nAllow: /\n\nSitemap: ${branding.siteUrl}sitemap.xml\n`;

const sitemapXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${branding.siteUrl}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${branding.siteUrl}llms.txt</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>
`;

const files: Record<string, { type: string; body: () => string }> = {
  'robots.txt': { type: 'text/plain', body: robotsTxt },
  'sitemap.xml': { type: 'application/xml', body: sitemapXml },
  'llms.txt': { type: 'text/plain; charset=utf-8', body: llmsTxt },
};

export function seoPlugin(): Plugin {
  const vars: Record<string, string> = {
    APP_NAME: branding.displayName,
    APP_TAGLINE: branding.tagline,
    SEO_TITLE: `${branding.displayName} – ${seo.title}`,
    SEO_DESCRIPTION: seo.description,
    SEO_DESCRIPTION_DE: seo.descriptionDe,
    SEO_KEYWORDS: seo.keywords.join(', '),
    SITE_URL: branding.siteUrl,
    REPO_URL: repoUrl,
    OG_IMAGE: ogImage,
    OG_IMAGE_ALT: seo.ogImageAlt,
    AUTHOR: branding.author,
    AUTHOR_URL: branding.authorUrl,
  };
  return {
    name: 'seo',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        // optional search-console ownership tags (paste the token into seo.config.json)
        const verify = [
          seo.googleSiteVerification && `<meta name="google-site-verification" content="${esc(seo.googleSiteVerification)}" />`,
          seo.bingSiteVerification && `<meta name="msvalidate.01" content="${esc(seo.bingSiteVerification)}" />`,
        ].filter(Boolean).join('\n    ');
        let out = html.replace('%JSON_LD%', jsonLd()).replace('<!-- %SITE_VERIFICATION% -->', verify);
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`%${k}%`, esc(v));
        return out;
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0]?.split('/').pop() ?? '';
        const f = files[name];
        if (!f) return next();
        res.setHeader('Content-Type', f.type);
        res.end(f.body());
      });
    },
    generateBundle() {
      for (const [fileName, f] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: f.body() });
    },
  };
}
