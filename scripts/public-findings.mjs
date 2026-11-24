// Prints what a public log may show of a `slot ... --json` report: the exit code and, for each finding, its rule, file and line.
// Messages, subjects and the tool's stderr stay off the log: they can quote file content and paths of the runner.
//
// usage: node scripts/public-findings.mjs <report file>     (exit code: the report's `code`, or 3 when there is no report)
import { readFileSync } from 'node:fs';

const say = line => void process.stdout.write(`${line}
`);

let report;
try {
    const lines = readFileSync(process.argv[2], 'utf8').split('\n').filter(l => l.trim() !== '');
    report = JSON.parse(lines.at(-1));
} catch {
    report = null;
}
if (report === null || typeof report !== 'object' || !Number.isInteger(report.code)) {
    say('no report: the tool did not print one (ask a maintainer for the details)');
    process.exit(3);
}
const safe = value => String(value).replace(/[^A-Za-z0-9_./@: -]/g, '?').slice(0, 200);
say(`${safe(report.tool ?? 'slot')}: code ${report.code}${report.level === undefined ? '' : `, level ${safe(report.level)}`}`);
for (const f of Array.isArray(report.findings) ? report.findings : []) say(`  ${f.severity === 'warning' ? 'warning' : 'error'} [${safe(f.rule)}] ${safe(f.file)}:${safe(f.line)}`);
const errors = Array.isArray(report.errors) ? report.errors.length : 0;
if (errors > 0) say(`  ${errors} error line(s), not shown here`);
process.exit(report.code);
