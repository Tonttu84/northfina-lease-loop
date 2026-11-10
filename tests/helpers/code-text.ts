// The code of a source file with its comments cut out, line by line, for the text-scanning meta
// tests (issue 17, re-review of PR 23): a comment may name a call it forbids, code may not.
// Pure; its tests are in tests/strict-body.test.ts.

type Mode = 'code' | 'block' | 'template' | "'" | '"';

/**
 * Each line of `source` with its `//` and `/* … *\/` comments cut out and everything else kept
 * as written, string contents included (so `db['$queryRaw']` still reads as code). A `//` or
 * `/*` inside a string or a template literal is part of the string, not a comment. Block
 * comments and template literals may span lines; a quoted string ends with its line.
 */
export function codeLines(source: string): string[] {
  let mode: Mode = 'code';
  return source.split(/\r?\n/).map((line) => {
    if (mode === "'" || mode === '"') mode = 'code';
    let code = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i] ?? '';
      const pair = line.slice(i, i + 2);
      if (mode === 'block') {
        if (pair === '*/') {
          mode = 'code';
          code += ' ';
          i++;
        }
        continue;
      }
      if (mode === 'code') {
        if (pair === '//') break;
        if (pair === '/*') {
          mode = 'block';
          i++;
          continue;
        }
        if (char === "'" || char === '"') mode = char;
        else if (char === '`') mode = 'template';
        code += char;
        continue;
      }
      code += char;
      if (char === '\\') {
        code += line[i + 1] ?? '';
        i++;
      } else if (char === (mode === 'template' ? '`' : mode)) {
        mode = 'code';
      }
    }
    return code;
  });
}
