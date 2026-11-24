// Prints what a public log may show of a `slot ... --json` report: the exit code and, for at most MAX findings, the rule, the
// file and the line. Messages, subjects and the tool's stderr stay off the log: they can quote file content and paths of the runner.
// In tier 3 the report itself may be written by code of the pull request, so every field is held to a narrow shape and the count
// is capped: the log is a small way out, not a wide one.
//
// usage: node scripts/public-findings.mjs <report file>     (exit code: the report's `code`, or 3 when there is no report)
import { readFileSync } from 'node:fs';

const MAX = 50;
const TOOLS = ['slot skill', 'slot new game', 'slot check'];
const say = line => void process.stdout.write(`report: ${line}\n`);

let report;
try {
    const lines = readFileSync(process.argv[2], 'utf8')
        .split('\n')
        .filter(l => l.trim() !== '');
    report = JSON.parse(lines.at(-1));
} catch {
    report = null;
}
if (report === null || typeof report !== 'object' || ![0, 1, 2, 3].includes(report.code)) {
    say('none: the tool did not print one (ask a maintainer for the details)');
    process.exit(3);
}
const shaped = (value, shape) => (typeof value === 'string' && shape.test(value) ? value : '?');
const level = [0, 1, 2, 3].includes(report.level) ? `, level ${report.level}` : '';
say(`${TOOLS.includes(report.tool) ? report.tool : 'slot'}: code ${report.code}${level}`);
const findings = Array.isArray(report.findings) ? report.findings : [];
for (const f of findings.slice(0, MAX)) {
    if (f === null || typeof f !== 'object') continue;
    const line = Number.isInteger(f.line) && f.line >= 0 && f.line < 1e6 ? f.line : '?';
    say(`  ${f.severity === 'warning' ? 'warning' : 'error'} [${shaped(f.rule, /^[a-z][a-z0-9-]{0,39}$/)}] ${shaped(f.file, /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,99}$/)}:${line}`);
}
if (findings.length > MAX) say(`  and ${findings.length > 1000 ? 'many' : findings.length - MAX} more, not shown`);
const errors = Array.isArray(report.errors) ? Math.min(report.errors.length, 99) : 0;
if (errors > 0) say(`  ${errors} error line(s), not shown here`);
process.exit(report.code);
