import { readFile } from 'node:fs/promises';
import { compile } from '@js-ox/compiler';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsox')) {
    const { code } = compile(await readFile(new URL(url), 'utf8'));
    return { format: 'module', source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
