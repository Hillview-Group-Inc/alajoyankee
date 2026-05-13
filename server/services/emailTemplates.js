/* ============================================
   server/services/emailTemplates.js
   Brand-styled HTML email shell for Alajo Yankee.

   Email clients are picky: layout uses tables (not flex/grid),
   styles are inlined (no <style>/CSS variables), web fonts are
   skipped in favor of common fallbacks, and the outer container
   is fixed at 600px which renders predictably on Gmail/Outlook/
   Apple Mail. Avoid background images and modern selectors.
   ============================================ */

'use strict';

/* ── Brand palette (literal hex; mirrors client/css/base.css) ── */
const C = {
  primary:        '#1a6b3c',
  primaryDark:    '#134f2d',
  primaryLight:   '#249152',
  primarySubtle:  '#e8f5ee',

  secondary:      '#d4a017',
  secondaryDark:  '#b8880e',
  secondaryLight: '#f0c040',
  secondarySubtle:'#fdf6e3',

  accent:         '#8b3a1e',

  text:           '#1c1c1c',
  textMuted:      '#6b7280',
  border:         '#e5e7eb',
  bgPage:         '#f4f4f0',
  bgCard:         '#ffffff',

  success:        '#16a34a',
  error:          '#dc2626',
  warning:        '#d97706',
};

const FONT_DISPLAY = `'Playfair Display', Georgia, 'Times New Roman', serif`;
const FONT_BODY    = `'DM Sans', 'Helvetica Neue', Arial, sans-serif`;

/* ── Tiny HTML escape for safety ── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Optional named accent palette for the hero band ── */
const ACCENTS = {
  primary:  { bg: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,    fallback: C.primary },
  gold:     { bg: `linear-gradient(135deg, ${C.secondaryDark}, ${C.secondary})`, fallback: C.secondary },
  success:  { bg: `linear-gradient(135deg, ${C.primaryDark}, ${C.success})`,    fallback: C.success },
  warning:  { bg: `linear-gradient(135deg, ${C.warning}, #f59e0b)`,              fallback: C.warning },
  error:    { bg: `linear-gradient(135deg, #991b1b, ${C.error})`,                fallback: C.error },
};

/* ── Render the rows of a key/value table ── */
function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const body = rows.map(([label, value], i) => {
    const isLast = i === rows.length - 1;
    const borderBottom = isLast ? 'none' : `1px solid ${C.border}`;
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:${borderBottom};font-family:${FONT_BODY};font-size:13px;color:${C.textMuted};text-transform:uppercase;letter-spacing:.06em;font-weight:600;width:42%;vertical-align:top;">
          ${esc(label)}
        </td>
        <td style="padding:12px 16px;border-bottom:${borderBottom};font-family:${FONT_BODY};font-size:15px;color:${C.text};font-weight:500;vertical-align:top;">
          ${value /* allow caller to pass safe HTML for emphasis */}
        </td>
      </tr>`;
  }).join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.bgCard};border:1px solid ${C.border};border-radius:12px;border-collapse:separate;margin:0 0 24px;">
      ${body}
    </table>`;
}

/* ── CTA button ── */
function renderCta(label, url, accent = 'gold') {
  if (!label || !url) return '';
  const colors = ACCENTS[accent] || ACCENTS.gold;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
      <tr>
        <td style="border-radius:10px;background:${colors.fallback};">
          <a href="${esc(url)}" target="_blank"
             style="display:inline-block;padding:13px 26px;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;background:${colors.bg};">
            ${esc(label)} &rarr;
          </a>
        </td>
      </tr>
    </table>`;
}

/* ── Highlight callout (used for the password-reset link, etc.) ── */
function renderHighlight(html) {
  if (!html) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.primarySubtle};border-left:4px solid ${C.primary};border-radius:8px;margin:0 0 24px;">
      <tr>
        <td style="padding:14px 18px;font-family:${FONT_BODY};font-size:14px;color:${C.text};line-height:1.6;word-break:break-all;">
          ${html}
        </td>
      </tr>
    </table>`;
}

/* ──────────────────────────────────────────────
   Main render — returns the full HTML email
   ────────────────────────────────────────────── */
function renderEmail({
  preheader = '',
  accent = 'primary',
  heading,
  greeting = '',
  intro = [],
  rows = [],
  highlight = '',
  ctaLabel = '',
  ctaUrl = '',
  closing = '',
}) {
  const hero = ACCENTS[accent] || ACCENTS.primary;

  const introHtml = (Array.isArray(intro) ? intro : [intro])
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${C.text};">${p}</p>`)
    .join('');

  const closingHtml = closing
    ? `<p style="margin:24px 0 0;font-family:${FONT_BODY};font-size:14px;line-height:1.65;color:${C.textMuted};">${closing}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${esc(heading || 'Alajo Yankee')}</title>
</head>
<body style="margin:0;padding:0;background:${C.bgPage};font-family:${FONT_BODY};color:${C.text};">
  <!-- Hidden preheader (shown in inbox previews) -->
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.bgPage};">${esc(preheader)}</div>` : ''}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:${C.bgPage};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- ── Container ── -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
               style="max-width:600px;width:100%;background:${C.bgCard};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

          <!-- ── Hero band ── -->
          <tr>
            <td style="padding:28px 32px;background:${hero.fallback};background-image:${hero.bg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:rgba(255,255,255,.18);border-radius:10px;width:42px;height:42px;text-align:center;font-family:${FONT_DISPLAY};font-size:22px;font-weight:800;color:#ffffff;">
                          A
                        </td>
                        <td style="padding-left:12px;font-family:${FONT_DISPLAY};font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.02em;">
                          Alajo Yankee
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="text-align:right;font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:.12em;color:rgba(255,255,255,.8);text-transform:uppercase;vertical-align:middle;">
                    Community Savings
                  </td>
                </tr>
              </table>

              <h1 style="margin:24px 0 0;font-family:${FONT_DISPLAY};font-size:26px;line-height:1.2;font-weight:800;color:#ffffff;">
                ${esc(heading || '')}
              </h1>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:28px 32px 8px;">
              ${greeting ? `<p style="margin:0 0 14px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:${C.text};">${esc(greeting)}</p>` : ''}
              ${introHtml}
              ${renderTable(rows)}
              ${renderHighlight(highlight)}
              ${renderCta(ctaLabel, ctaUrl, accent === 'primary' ? 'gold' : 'primary')}
              ${closingHtml}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid ${C.border};background:${C.primarySubtle};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT_BODY};font-size:13px;color:${C.textMuted};line-height:1.6;">
                    <strong style="color:${C.primary};">Alajo Yankee</strong> &middot; Building wealth, together &middot; Rooted in African wisdom
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:8px;font-family:${FONT_BODY};font-size:11px;color:${C.textMuted};line-height:1.5;">
                    You're receiving this email because you have an account on Alajo Yankee.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── Convenience: also produce a sensible plain-text fallback ──
   Renders the same data in a simple text layout so clients with
   HTML disabled still see something useful. */
function renderText({ heading, greeting, intro = [], rows = [], highlight = '', closing = '' }) {
  const lines = [];
  if (heading)  lines.push(heading.toUpperCase(), '═'.repeat(Math.min(heading.length, 60)), '');
  if (greeting) lines.push(greeting, '');
  (Array.isArray(intro) ? intro : [intro]).filter(Boolean).forEach(p => lines.push(stripTags(p), ''));
  if (rows.length) {
    rows.forEach(([label, value]) => lines.push(`• ${label}: ${stripTags(value)}`));
    lines.push('');
  }
  if (highlight) lines.push(stripTags(highlight), '');
  if (closing)   lines.push(stripTags(closing));
  lines.push('', '— Alajo Yankee');
  return lines.join('\n');
}

function stripTags(s) {
  return String(s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

module.exports = { renderEmail, renderText, esc, COLORS: C };
