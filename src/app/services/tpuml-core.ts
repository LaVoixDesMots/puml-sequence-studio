/** Heuristique simple */
export function looksLikeTpuml(src: string): boolean {
  return (
    /@starttpuml\b/i.test(src) ||
    /^\s*type\s+\w+/m.test(src) ||
    /^\s*include\s+/m.test(src)
  );
}
/** Transpile un .tpuml (fichier inclus) en PlantUML SANS ajouter @startuml/@enduml. */
export function transpileTpuml(src: string): string {
  const TYPE_TEMPLATES: Record<string, (id: string, label?: string, stereo?: string) => string> = {
    Actor:    (id, label) => `actor ${label ? `"${label}" ` : ''}as ${id}`,
    Service:  (id, label, stereo) => `participant ${label ? `"${label}" ` : ''}as ${id}${stereo ? ` <<${stereo}>>` : ' <<service>>'}`,
    DB:       (id, label) => `database ${label ? `"${label}" ` : ''}as ${id}`,
    Queue:    (id, label) => `queue ${label ? `"${label}" ` : ''}as ${id}`,
    Boundary: (id, label) => `boundary ${label ? `"${label}" ` : ''}as ${id}`,
  };

  const stripGuards = (s: string) =>
    s.replace(/^\s*@start(?:t)?p?uml.*$/gmi, '')
     .replace(/^\s*@end(?:t)?p?uml.*$/gmi, '');

  const stripQuotes = (s?: string) => s?.replace(/^"(.*)"$/, '$1');

  const includeRe = /^(?:include|!include)\s+(.+)\s*$/;
  const typeRe = /^type\s+(\w+)\s+([A-Za-z_][\w]*)\s*(?:"([^"]*)")?\s*(?:<<\s*([A-Za-z0-9_+-]+)\s*>>)?\s*$/;

  const out: string[] = [];

  for (const raw of stripGuards(src).split(/\r?\n/)) {
    const line = raw.trim();

    // includes -> !include
    const inc = line.match(includeRe);
    if (inc) { out.push(`!include ${inc[1]}`); continue; }

    // type … -> déclaration UML
    const m = line.match(typeRe);
    if (m) {
      const [, t, id, quoted, stereo] = m;
      const tpl = TYPE_TEMPLATES[t];
      if (!tpl) throw new Error(`Type inconnu: ${t}`);
      out.push(tpl(id, stripQuotes(quoted), stereo));
      continue;
    }

    // lignes normales (y compris interactions)
    out.push(raw);
  }

  return out.join('\n');
}

/** Transpile un .starttpuml : transpile le contenu puis AJOUTE @startuml/@enduml. */
export function transpileStarterTpuml(src: string): string {
  const body = transpileTpuml(src)           // convertit include/type et strip toute garde éventuelle
                .trim();
  return `@startuml\n${body}\n@enduml\n`;
}


/** util path */
export function normalizePath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '.') continue;
    if (p === '..') { stack.pop(); continue; }
    stack.push(p);
  }
  return stack.join('/');
}
export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}
