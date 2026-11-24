// Accept test of the pack `reel-preset-snappy`: the game's manifest carries the feel of presets/reel/snappy.json.
// Run by the eval harness on the project of a run (EVAL_PROJECT).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const project = process.env['EVAL_PROJECT'] ?? '.';
const read = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(project, rel), 'utf8')) as Record<string, unknown>;

it('reel-preset-snappy: manifest.reelFeel is the feel of presets/reel/snappy.json', () => {
    const feel = read('presets/reel/snappy.json');
    // The two header keys belong to the file, not to the feel.
    delete feel['$schema'];
    delete feel['formatVersion'];
    expect(read('manifest.json')['reelFeel'], 'reel-preset-snappy: manifest.reelFeel is not the preset').toEqual(feel);
});
