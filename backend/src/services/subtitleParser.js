const zhRegex = /[\u4e00-\u9fff]/;
const enRegex = /[A-Za-z]/;

export function filterSubtitleLines(lines, mode) {
  if (mode === 'both') return lines;

  return lines.filter((line) => {
    if (mode === 'zh') return zhRegex.test(line);
    if (mode === 'en') return enRegex.test(line) && !zhRegex.test(line);
    return true;
  });
}

export function parseSrt(content) {
  return content.split(/\n\n+/).map((block) => {
    const lines = block.split('\n');
    if (lines.length < 3) return null;
    const [index, time, ...payload] = lines;
    return { index, time, lines: payload };
  }).filter(Boolean);
}

export function serializeSrt(blocks) {
  return blocks.map((block) => `${block.index}\n${block.time}\n${block.lines.join('\n')}`).join('\n\n');
}

export function filterSrtContent(content, mode) {
  const blocks = parseSrt(content);
  const filtered = blocks
    .map((block) => ({ ...block, lines: filterSubtitleLines(block.lines, mode) }))
    .filter((block) => block.lines.length > 0);
  return serializeSrt(filtered);
}

export function parseAss(content) {
  const lines = content.split('\n');
  const dialogue = [];
  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      const parts = line.split(',');
      const text = parts.slice(9).join(',');
      dialogue.push({ raw: line, text, parts });
    }
  }
  return dialogue;
}

export function filterAssContent(content, mode) {
  const lines = content.split('\n');
  return lines
    .map((line) => {
      if (!line.startsWith('Dialogue:')) return line;
      const parts = line.split(',');
      const payload = parts.slice(9).join(',');
      const linePayload = payload.split('\\N');
      const filtered = filterSubtitleLines(linePayload, mode);
      if (filtered.length === 0) return null;
      const rebuilt = [...parts.slice(0, 9), filtered.join('\\N')];
      return rebuilt.join(',');
    })
    .filter(Boolean)
    .join('\n');
}
