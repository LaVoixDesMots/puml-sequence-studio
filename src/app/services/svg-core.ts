/** Supprime BOM, XML prolog, DOCTYPE, commentaires et coupe avant/après <svg> */
export function cleanSvg(svgText: string): string {
  if (!svgText) return svgText;

  // 1) BOM éventuel
  svgText = svgText.replace(/^\uFEFF/, '');

  // 2) En-têtes optionnels au début
  svgText = svgText
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, '')      // <?xml ...?>
    .replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '')     // <!DOCTYPE ...>
    .replace(/^\s*<!--[\s\S]*?-->\s*/i, '');    // <!-- comments -->

  // 3) Ne garder que le fragment depuis <svg …> jusqu’à </svg>
  const start = svgText.search(/<svg[\s>]/i);
  if (start === -1) throw new Error('SVG introuvable dans la sortie.');

  const endMatch = svgText.match(/<\/svg>/i);
  const end = endMatch ? endMatch.index! + 6 : svgText.length;

  return svgText.slice(start, end);
}
