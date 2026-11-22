import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const svg = await readFile('assets/icon.svg', 'utf8');
const renderer = new Resvg(svg, {
  fitTo: { mode: 'width', value: 256 },
  font: { loadSystemFonts: false },
});
const png = renderer.render().asPng();
await writeFile('assets/icon.png', png);
console.log(`Rendered assets/icon.png (${png.length} bytes)`);
