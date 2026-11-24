// The scope gate of a registry pull request. Plain Node, no dependency, no install: it runs before anything else is trusted.
//
// A contribution may change exactly one of:
//   - files under packs/<one id>/, plus one new CODEOWNERS line for that pack on its first pull request;
//   - result files evals/<id>/<version>/<agent>.self.<reporter>.json.
// Anything else (workflows, scripts, the generated index and bundles, reserved.json, yanked.json, another pack, an existing
// CODEOWNERS line, a registry result file) is the maintainers' to change, in a pull request of their own.
// A symlink (mode 120000) or a submodule (mode 160000) is refused wherever it is.
//
// usage: node scripts/scope.mjs --base <sha> --head <sha>
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const say = line => void process.stdout.write(`${line}
`);

const ID = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
const PACK_FILE = new RegExp(`^packs/(${ID})/.+$`);
const SELF_REPORT = new RegExp(`^evals/${ID}/[^/]+/${ID}\\.self\\.${ID}\\.json$`);
const FORBIDDEN_MODES = { 120000: 'a symlink', 160000: 'a submodule' };

/**
 * @param {{ entries: { path: string, oldMode: string, newMode: string }[],
 *           codeowners: { added: string[], removed: string[] },
 *           basePacks: string[] }} diff  `basePacks`: the pack ids that exist on the base branch.
 * @returns {{ problems: string[], pack: string | null }}
 */
export function scopeProblems({ entries, codeowners, basePacks }) {
    const problems = [];
    for (const e of entries) {
        for (const mode of [e.oldMode, e.newMode]) {
            const what = FORBIDDEN_MODES[mode];
            if (what !== undefined) problems.push(`${e.path}: ${what} (mode ${mode}); a registry holds plain files only`);
        }
    }
    if (entries.length === 0) problems.push('the pull request changes no file');
    const paths = entries.map(e => e.path);
    if (paths.length > 0 && paths.every(p => SELF_REPORT.test(p))) return { problems, pack: null };

    const packs = new Set();
    for (const path of paths) {
        const id = PACK_FILE.exec(path)?.[1];
        // A dot name is not part of a pack, and `.gitattributes` can hide files from the export a later gate reads.
        if (id !== undefined && path.split('/').some(segment => segment.startsWith('.'))) problems.push(`${path}: a name that starts with a dot is not part of a pack`);
        if (id !== undefined) packs.add(id);
        else if (path !== 'CODEOWNERS') problems.push(`${path}: outside the scope of a contribution (packs/<one id>/, or evals/<id>/<version>/<agent>.self.<you>.json)`);
    }
    if (packs.size > 1) problems.push(`more than one pack: ${[...packs].sort().join(', ')}; one pull request, one pack`);
    const pack = packs.size === 1 ? [...packs][0] : null;
    const isNew = pack !== null && !basePacks.includes(pack);
    const touched = paths.includes('CODEOWNERS');
    if (touched || isNew) {
        const line = pack === null ? null : new RegExp(`^/packs/${pack}/( +@[A-Za-z0-9][A-Za-z0-9-]*)+$`);
        if (codeowners.removed.length > 0) problems.push('CODEOWNERS: an existing line is removed or changed');
        if (!isNew) problems.push('CODEOWNERS: only the first pull request of a pack adds a line');
        else if (codeowners.added.length !== 1 || !line.test(codeowners.added[0])) problems.push(`CODEOWNERS: the first pull request of a pack adds exactly one line, \`/packs/${pack}/ @<your GitHub login>\``);
    }
    return { problems, pack };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function readDiff(base, head) {
    // -z: paths arrive verbatim, whatever bytes they hold. `:<old mode> <new mode> <old sha> <new sha> <status>\0<path>\0`.
    const fields = git('diff', '--raw', '--no-renames', '-z', base, head).split('\0');
    const entries = [];
    for (let i = 0; i + 1 < fields.length; i += 2) {
        const [oldMode, newMode, , , status] = fields[i].replace(/^:/, '').split(' ');
        entries.push({ path: fields[i + 1], oldMode, newMode, status });
    }
    const lines = git('diff', '-U0', '--no-renames', base, head, '--', 'CODEOWNERS').split('\n');
    // Only the two header lines of the one file are skipped: a content line that itself starts with `++` still counts.
    const body = lines.slice(lines.findIndex(l => l.startsWith('@@')) === -1 ? lines.length : lines.findIndex(l => l.startsWith('@@')));
    const changed = sign => body.filter(l => l.startsWith(sign)).map(l => l.slice(1).replace(/\r$/, ''));
    // No packs/ on the base yet (an empty registry) is the one expected failure of ls-tree.
    let basePacks = [];
    try {
        basePacks = git('ls-tree', '-d', '--name-only', `${base}:packs/`).split('\n').filter(Boolean);
    } catch {
        basePacks = [];
    }
    return { entries, codeowners: { added: changed('+'), removed: changed('-') }, basePacks };
}

/** JSON a later gate will read must at least parse; where it fails is said, never what it holds. */
function jsonProblems(entries, head) {
    const problems = [];
    for (const e of entries) {
        if (e.status === 'D' || !e.path.endsWith('.json') || FORBIDDEN_MODES[e.newMode] !== undefined) continue;
        try {
            JSON.parse(git('show', `${head}:${e.path}`));
        } catch {
            problems.push(`${e.path}: not JSON`);
        }
    }
    return problems;
}

function main(argv) {
    const arg = name => argv[argv.indexOf(`--${name}`) + 1];
    const [base, head] = [arg('base'), arg('head')];
    if (!/^[0-9a-f]{40}$/.test(base ?? '') || !/^[0-9a-f]{40}$/.test(head ?? '')) {
        say('usage: node scripts/scope.mjs --base <sha> --head <sha>');
        return 2;
    }
    let diff;
    try {
        diff = readDiff(base, head);
    } catch {
        say('scope: the diff could not be read');
        return 1;
    }
    const { problems, pack } = scopeProblems(diff);
    problems.push(...jsonProblems(diff.entries, head));
    for (const p of problems) say(`scope: ${p}`);
    if (problems.length > 0) return 1;
    say(pack === null ? 'scope: ok (self-reported results)' : `scope: ok (pack ${pack})`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pack=${pack ?? ''}\n`);
    return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
