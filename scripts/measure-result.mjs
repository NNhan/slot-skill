// The three small jobs around a measurement that must not trust what the measurement printed. Plain Node, no dependency.
//
//   plan <content> <measured> <engine package.json>
//       Which pack to measure. `PACK` (optional, env): that pack; otherwise, turning by GITHUB_RUN_NUMBER, one of the packs of
//       <content>/packs whose `engine` range holds the engine and that have no registry result for this engine minor under
//       <measured>/evals. Writes `pack`, `version`, `engine` to GITHUB_OUTPUT
//       (`pack` empty: nothing to measure). Reads JSON as text; runs nothing of a pack.
//   read <report file>
//       Narrows the report of `slot skill eval --runs --json`, which code of a pack may have written, to four values: `runs`,
//       `without`, `with` (small integers) and `stable` (a boolean). Nothing else of the report leaves the measure job: not an
//       id, not a path, not a message. Exit 1 when the report is not a finished measurement.
//   write <measured>
//       Writes <measured>/evals/<id>/<version>/<agent>.registry.json from the environment (ID, VERSION, AGENT, MODEL, ENGINE,
//       RUNS, WITHOUT, WITH, STABLE, AT). Every value is held to a narrow shape again: the job that calls this has a write
//       token, and its inputs are the outputs of a job that ran pack content.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const say = line => void process.stdout.write(`measure: ${line}\n`);
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,40})?$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** More runs per branch than this is not a measurement anyone asked for. */
export const MAX_RUNS = 50;

const minor = version => /^(\d+\.\d+)\./.exec(version)?.[1] ?? null;
const readJson = file => {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
};
const output = pairs => {
    const text = Object.entries(pairs)
        .map(([k, v]) => `${k}=${v}\n`)
        .join('');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
    else process.stdout.write(text);
};

const parts = v => v.split(/[-+]/)[0].split('.').map(Number);
const below = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
    return false;
};
/** The closed range of skill.json (`>=a.b.c <d.e.f`) holds the engine; a prerelease is of its release line. */
const inRange = (range, engine) => {
    const m = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(typeof range === 'string' ? range : '');
    return m !== null && !below(engine, m[1]) && below(engine, m[2]);
};

/**
 * The pack to measure and its version, or null. `asked`: a pack id, or '' for the schedule: of the packs whose `engine` range holds this
 * engine and that have no registry result for its minor, the one at `turn` (the run number) modulo their count. A pack whose
 * measurement never finishes leaves no result; turning through the candidates keeps it from taking every scheduled run.
 */
export function plan(content, measured, engineVersion, asked, turn = 0) {
    const packs = join(content, 'packs');
    const ids = (existsSync(packs) ? readdirSync(packs, { withFileTypes: true }) : []).filter(e => e.isDirectory() && ID.test(e.name)).map(e => e.name).sort();
    const candidates = [];
    for (const id of asked === '' ? ids : ids.filter(i => i === asked)) {
        const skill = readJson(join(packs, id, 'skill.json'));
        if (skill === null || skill.id !== id || typeof skill.version !== 'string' || !VERSION.test(skill.version)) continue;
        if (asked !== '') return { pack: id, version: skill.version };
        if (!inRange(skill.engine, engineVersion)) continue;
        const result = readJson(join(measured, 'evals', id, skill.version, 'claude.registry.json'));
        const have = result !== null && typeof result.engine === 'string' ? minor(result.engine) : null;
        if (have === null || have !== minor(engineVersion)) candidates.push({ pack: id, version: skill.version });
    }
    return candidates.length === 0 ? null : candidates[turn % candidates.length];
}

/** The four values of a finished measurement, or null: anything else the report holds is dropped here. */
export function narrow(report) {
    const m = report !== null && typeof report === 'object' && report.tool === 'slot skill' && report.command === 'eval' && report.code === 0 ? report.measure : null;
    if (m === null || typeof m !== 'object') return null;
    const count = v => (Number.isInteger(v) && v >= 0 && v <= MAX_RUNS ? v : null);
    const [runs, without, withSkill] = [count(m.runs), count(m.without?.passed), count(m.with?.passed)];
    if (runs === null || runs < 1 || without === null || withSkill === null || without > runs || withSkill > runs || typeof m.signatureStable !== 'boolean') return null;
    return { runs, without, with: withSkill, stable: m.signatureStable };
}

/** The result file as text, or the name of the first value that is not of its shape. */
export function resultFile(env) {
    const int = name => (/^(?:0|[1-9]\d?)$/.test(env[name] ?? '') ? Number(env[name]) : null);
    const [runs, without, withSkill] = [int('RUNS'), int('WITHOUT'), int('WITH')];
    const bad =
        (!ID.test(env.ID ?? '') && 'ID') ||
        (!VERSION.test(env.VERSION ?? '') && 'VERSION') ||
        (!ID.test(env.AGENT ?? '') && 'AGENT') ||
        (!MODEL.test(env.MODEL ?? '') && 'MODEL') ||
        (!VERSION.test(env.ENGINE ?? '') && 'ENGINE') ||
        ((runs === null || runs < 1 || runs > MAX_RUNS) && 'RUNS') ||
        ((without === null || without > runs) && 'WITHOUT') ||
        ((withSkill === null || withSkill > runs) && 'WITH') ||
        (!['true', 'false'].includes(env.STABLE ?? '') && 'STABLE') ||
        (!DATE.test(env.AT ?? '') && 'AT');
    if (bad) return { bad };
    const file = { $schema: 'slot://schema/skillEval@1', formatVersion: 1, id: env.ID, version: env.VERSION, agent: env.AGENT, model: env.MODEL, engine: env.ENGINE, source: 'registry', runs, without: { passed: without }, with: { passed: withSkill }, signatureStable: env.STABLE === 'true', at: env.AT };
    return { path: `evals/${env.ID}/${env.VERSION}/${env.AGENT}.registry.json`, text: `${JSON.stringify(file, null, 2)}\n` };
}

function main([mode, a, b, c]) {
    if (mode === 'plan' && c !== undefined) {
        const engine = readJson(c)?.version;
        const asked = process.env.PACK ?? '';
        if (typeof engine !== 'string' || !VERSION.test(engine) || (asked !== '' && !ID.test(asked))) {
            say('the engine version or the pack id is not of its shape');
            return 1;
        }
        const turn = /^\d{1,9}$/.test(process.env.GITHUB_RUN_NUMBER ?? '') ? Number(process.env.GITHUB_RUN_NUMBER) : 0;
        const next = plan(a, b, engine, asked, turn);
        if (next === null && asked !== '') {
            say('no such pack on main');
            return 1;
        }
        say(next === null ? 'every pack has a result for this engine: nothing to measure' : `${next.pack}@${next.version}`);
        output({ pack: next?.pack ?? '', version: next?.version ?? '', engine });
        return 0;
    }
    if (mode === 'read' && a !== undefined) {
        let report = null;
        try {
            report = JSON.parse(readFileSync(a, 'utf8').split('\n').filter(l => l.trim() !== '').at(-1));
        } catch {
            report = null;
        }
        const m = narrow(report);
        if (m === null) {
            say('no finished measurement (the run did not start, did not finish, or printed no report)');
            return 1;
        }
        say(`without the skill ${m.without}/${m.runs}, with it ${m.with}/${m.runs}, signature stable ${m.stable}`);
        output(m);
        return 0;
    }
    if (mode === 'write' && a !== undefined) {
        const r = resultFile(process.env);
        if (r.bad) {
            say(`${r.bad} is not of its shape: nothing written`);
            return 1;
        }
        mkdirSync(join(a, r.path, '..'), { recursive: true });
        writeFileSync(join(a, r.path), r.text);
        say(`wrote ${r.path}`);
        return 0;
    }
    say('usage: node scripts/measure-result.mjs plan <content> <measured> <engine package.json> | read <report> | write <measured>');
    return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
