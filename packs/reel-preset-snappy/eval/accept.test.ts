// Accept test of the sample pack `reel-preset-snappy` (ADR-067): the game's manifest carries a reel feel with the numbers task.md asks for.
// It judges the outcome only, never a file the pack installs, so it means the same in the run without the skill (ADR-067 Ghi nhận S5b).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const project = process.env['EVAL_PROJECT'] ?? '.';
const manifest = JSON.parse(readFileSync(join(project, 'manifest.json'), 'utf8')) as { reelFeel?: unknown };

it('reel-preset-snappy: manifest.reelFeel is a feel with the speeds, stop timing and landing the task asks for', () => {
    expect(typeof manifest.reelFeel, 'reel-preset-snappy: manifest.reelFeel is still a preset name, not a feel').toBe('object');
    expect(manifest.reelFeel, 'reel-preset-snappy: the feel has other numbers than the task').toMatchObject({
        speed: { normal: 5, turbo: 8 },
        stop: { staggerMs: [0, 120, 240, 360, 480], minSpinMs: 400 },
        land: { overshootPx: 12, settleMs: 110 },
    });
});
