// ==========================================================================
// Aegis Drive — SVG Icon Helper
// ==========================================================================

/**
 * Returns an inline SVG element referencing the icon sprite sheet.
 * @param {string} name - Icon name (matches id in /icons.svg without 'icon-' prefix)
 * @param {number} [size=20] - Width and height in pixels
 * @param {string} [className=''] - Additional CSS class names
 * @returns {string} HTML string for the SVG icon
 */
export function icon(name, size = 20, className = '') {
  const classes = `icon ${className}`.trim();
  return `<svg width="${size}" height="${size}" class="${classes}" aria-hidden="true"><use href="/icons.svg#icon-${name}"/></svg>`;
}

/**
 * Creates a DOM element for the icon (instead of HTML string).
 * @param {string} name - Icon name
 * @param {number} [size=20] - Size in pixels
 * @param {string} [className=''] - Additional CSS class names
 * @returns {SVGElement} The SVG DOM node
 */
export function iconElement(name, size = 20, className = '') {
  const svgNS = 'http://www.w3.org/2000/svg';
  const xlinkNS = 'http://www.w3.org/1999/xlink';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svgNS, 'use');
  use.setAttributeNS(xlinkNS, 'href', `/icons.svg#icon-${name}`);
  svg.appendChild(use);
  return svg;
}
