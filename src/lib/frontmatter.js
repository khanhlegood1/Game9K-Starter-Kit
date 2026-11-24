/**
 * frontmatter.js
 *
 * Minimal, dependency-free YAML-subset parser for the ADR frontmatter contract
 * used by Game9K (MADR v4 + hve-core overlay). It intentionally supports only
 * the shapes an ADR needs — scalars, quoted strings, inline arrays, block lists,
 * list-of-objects and `null` — so a malformed decision record fails loudly
 * instead of being silently coerced.
 */

const NULLISH = new Set(["null", "~", ""]);

function unquote(raw) {
  const value = String(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function parseScalar(raw) {
  const value = String(raw).trim();
  if (NULLISH.has(value)) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item));
  }
  return unquote(value);
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function parseBlock(lines, startIndex, indent) {
  const result = {};
  const list = [];
  let isList = false;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const currentIndent = indentOf(line);
    if (currentIndent < indent) break;

    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      isList = true;
      const itemRaw = trimmed.slice(2);
      const keyMatch = itemRaw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (keyMatch) {
        const item = {};
        item[keyMatch[1]] = parseScalar(keyMatch[2]);
        i += 1;
        // nested keys belonging to this list item
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            i += 1;
            continue;
          }
          const nextIndent = indentOf(next);
          if (nextIndent <= currentIndent || next.trim().startsWith("- ")) break;
          const nestedKey = next.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
          if (!nestedKey) break;
          item[nestedKey[1]] = parseScalar(nestedKey[2]);
          i += 1;
        }
        list.push(item);
      } else {
        list.push(parseScalar(itemRaw));
        i += 1;
      }
      continue;
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      i += 1;
      continue;
    }
    const key = keyMatch[1];
    const rawValue = keyMatch[2];
    if (rawValue && rawValue.trim().length > 0) {
      result[key] = parseScalar(rawValue);
      i += 1;
      continue;
    }
    // Empty value → either a nested block or a block list on the next lines.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j < lines.length && lines[j].trim().startsWith("- ")) {
      const [items, next] = parseListBlock(lines, j, indentOf(lines[j]));
      result[key] = items;
      i = next;
      continue;
    }
    if (j < lines.length && indentOf(lines[j]) > indent) {
      const [nested, next] = parseBlock(lines, j, indentOf(lines[j]));
      result[key] = nested;
      i = next;
      continue;
    }
    result[key] = null;
    i += 1;
  }

  return [isList && Object.keys(result).length === 0 ? list : result, i];
}

function parseListBlock(lines, startIndex, indent) {
  const items = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (indentOf(line) < indent || !line.trim().startsWith("- ")) break;
    const itemRaw = line.trim().slice(2);
    const keyMatch = itemRaw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      const item = { [keyMatch[1]]: parseScalar(keyMatch[2]) };
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          i += 1;
          continue;
        }
        if (indentOf(next) <= indent || next.trim().startsWith("- ")) break;
        const nestedKey = next.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!nestedKey) break;
        item[nestedKey[1]] = parseScalar(nestedKey[2]);
        i += 1;
      }
      items.push(item);
    } else {
      items.push(parseScalar(itemRaw));
      i += 1;
    }
  }
  return [items, i];
}

/** Parse a YAML subset. Exported for tests and for `.adr-config.yml`. */
export function parseYamlSubset(text) {
  const content = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = content.split("\n").filter((line) => !line.startsWith("---"));
  const [value] = parseBlock(lines, 0, 0);
  return value;
}

/**
 * Split a Markdown document into `{ data, body, hasFrontmatter }`.
 * Missing frontmatter is not an error here; the ADR validator decides.
 */
export function parseFrontmatter(text) {
  const content = String(text ?? "").replace(/\r\n/g, "\n");
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { data: {}, body: content, hasFrontmatter: false, raw: null };
  }
  return {
    data: parseYamlSubset(match[1]),
    body: content.slice(match[0].length),
    hasFrontmatter: true,
    raw: match[1],
  };
}

/** Extract `## Heading` sections from a Markdown body (level-2 only). */
export function extractSections(body) {
  const sections = {};
  const lines = String(body ?? "").split("\n");
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim();
      sections[current] = [];
      continue;
    }
    if (/^#\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()])
  );
}

/** Extract `- item` bullets from a body section, keeping `→`/`:` split intact. */
export function extractBullets(sectionBody) {
  return String(sectionBody ?? "")
    .split("\n")
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/))
    .filter(Boolean)
    .map((match) => match[1].trim());
}
