// The one way out of the measure container. Plain Node, no dependency.
//
// The agent being measured needs the model API, and it runs next to the engine's source on content of a pack. So the container
// keeps `--network none`, and this script is the only door:
//
//   serve <socket>         on the runner, outside the container. Listens on a unix socket, takes the API key from MEASURE_API_KEY,
//                          and forwards ONLY `POST /v1/messages` and `POST /v1/messages/count_tokens` to the one upstream host,
//                          with the key put in by this process. The key never enters the container, and a caller cannot choose
//                          the host, the method, another API, or another account's key (its own auth headers are dropped).
//                          The body is read in full and refused when it asks the provider to reach anything itself (an MCP
//                          connector, a server tool, a container): see bodyProblem.
//   relay <socket> <port>  inside the container. A byte pipe from 127.0.0.1:<port> to the socket, because the agent's CLI
//                          speaks HTTP to a URL, not to a socket. It holds nothing.
//
// What stays open, by design: whatever the agent reads can be sent to the model under the registry's own key, and it can spend
// that key's money. The caps below, the harness budget and the spend limit of the key's workspace bound the second; the first
// is what using a hosted model means.
import { Buffer } from 'node:buffer';
import { createServer as createHttpServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect, createServer as createTcpServer } from 'node:net';
import { pathToFileURL } from 'node:url';

const say = line => void process.stdout.write(`${line}\n`);

export const UPSTREAM_HOST = 'api.anthropic.com';
/** The Messages API and its token count, with a query string of plain characters (`?beta=true`). Nothing else exists here. */
export const ALLOWED_PATH = /^\/v1\/messages(?:\/count_tokens)?(?:\?[A-Za-z0-9=&_.-]{0,200})?$/;
/** Request headers passed on. Anything that names an account (`x-api-key`, `authorization`) is never one of them. */
export const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'anthropic-version', 'anthropic-beta', 'user-agent'];
/**
 * The Messages API can itself reach out, and then carries what the agent read (the engine's source) to a host of the caller's choice,
 * which is what `--network none` is for: an MCP connector (`mcp_servers`), server tools (web fetch and search, code execution), a
 * `container`, and an image or document whose source is a URL or an uploaded file, fetched by the provider. So the check is an
 * allow-list over the WHOLE body, not a list of known dangers:
 *   - top level: none of REFUSED_BODY_FIELDS;
 *   - `tools`: untyped or `custom` tools, and Anthropic's client-side tools (they run on the caller's side, fetch nothing);
 *   - every object anywhere with a `source`: an inline source only (`base64`, `text`, `content`);
 *   - every object anywhere with a `type`: not a block the provider acts on (MCP, server tool use or result, container upload).
 * A beta flag that turns such a feature on is dropped.
 */
export const REFUSED_BODY_FIELDS = ['mcp_servers', 'container'];
export const REFUSED_BETA = /mcp|web-fetch|web-search|code-execution|files-api|skills|container/i;
const CLIENT_TOOL_TYPE = /^(?:custom|(?:bash|text_editor|str_replace_editor|str_replace_based_edit_tool|computer|memory)_\d{8})$/;
const INLINE_SOURCE = ['base64', 'text', 'content'];
const PROVIDER_BLOCK = /^(?:mcp_|server_tool_use$|container_|.+_tool_result$)/;
/** Why a request body asks the provider to reach anything itself, or null when it is plain Messages. */
export function bodyProblem(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'not a JSON object';
    for (const field of REFUSED_BODY_FIELDS) if (field in body) return `"${field}" is not allowed`;
    if (body.tools !== undefined) {
        if (!Array.isArray(body.tools)) return '"tools" is not a list';
        for (const tool of body.tools) {
            if (tool === null || typeof tool !== 'object') return 'a tool is not an object';
            if (tool.type !== undefined && !CLIENT_TOOL_TYPE.test(String(tool.type))) return 'a tool the provider runs is not allowed';
        }
    }
    // Every object of the body, without recursion (a deep body cannot overflow the stack).
    const stack = [body.messages, body.system];
    while (stack.length) {
        const value = stack.pop();
        if (value === null || typeof value !== 'object') continue;
        if (Array.isArray(value)) {
            stack.push(...value);
            continue;
        }
        if (value.source !== undefined && (value.source === null || typeof value.source !== 'object' || !INLINE_SOURCE.includes(value.source.type))) return 'a source that is not inline (a URL or a file) is not allowed';
        if (typeof value.type === 'string' && value.type !== 'tool_result' && PROVIDER_BLOCK.test(value.type)) return 'a block the provider acts on is not allowed';
        // The input of a client tool call is the caller's own data, which the provider never acts on: not walked (no false refusals).
        stack.push(...Object.entries(value).filter(([k]) => !(value.type === 'tool_use' && k === 'input')).map(([, v]) => v));
    }
    return null;
}
const DROPPED_RESPONSE_HEADERS = ['connection', 'keep-alive', 'transfer-encoding', 'set-cookie'];
export const MAX_BODY_BYTES = 32 * 1024 * 1024;
/** A hard stop that does not depend on anything inside the container behaving: a run that needs more is not a measurement. */
export const MAX_REQUESTS = 5000;

const refuse = (res, status, type) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(`${JSON.stringify({ type: 'error', error: { type, message: `model proxy: ${type}` } })}\n`);
};

/**
 * The request handler of `serve`. `upstream(options)` opens the request to the model API; the default is https to UPSTREAM_HOST,
 * and nothing a caller sends can change where it goes. `log` gets one line per request (method, path without query, status).
 */
export function proxyHandler(key, { upstream = options => httpsRequest({ host: UPSTREAM_HOST, port: 443, ...options }), log = () => {}, maxRequests = MAX_REQUESTS, maxBodyBytes = MAX_BODY_BYTES } = {}) {
    let served = 0;
    return (req, res) => {
        const path = (req.url ?? '').split('?')[0];
        const done = status => log(`${req.method} ${ALLOWED_PATH.test(req.url ?? '') ? path : '(refused path)'} ${status}`);
        if (req.method !== 'POST' || !ALLOWED_PATH.test(req.url ?? '')) {
            req.resume();
            done(404);
            return refuse(res, 404, 'not_found_error');
        }
        if (served >= maxRequests) {
            req.resume();
            done(429);
            return refuse(res, 429, 'request_cap_reached');
        }
        served += 1;
        // A caller that goes away (the harness ends a run at its budget or deadline) ends the upstream call too, or stops it from starting.
        let out = null;
        let gone = false;
        res.on('close', () => {
            if (res.writableFinished) return;
            gone = true;
            out?.destroy();
        });
        // The whole body first (it is capped): what it asks for is checked before a byte goes out.
        const chunks = [];
        let bytes = 0;
        let over = false;
        req.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > maxBodyBytes) over = true;
            else chunks.push(chunk);
        });
        req.on('error', () => void (res.headersSent || (done(400), refuse(res, 400, 'invalid_request_error'))));
        req.on('end', () => {
            if (over) {
                done(413);
                return refuse(res, 413, 'request_too_large');
            }
            const raw = Buffer.concat(chunks);
            let body;
            try {
                body = JSON.parse(raw.toString('utf8'));
            } catch {
                body = undefined;
            }
            const problem = bodyProblem(body);
            if (problem !== null) {
                done(400);
                return refuse(res, 400, 'refused_by_model_proxy');
            }
            if (gone) return done(499);
            // What goes out is what was checked: a body with a key twice passes the check with its last value, so it is sent as parsed.
            const checked = Buffer.from(JSON.stringify(body), 'utf8');
            const headers = { host: UPSTREAM_HOST, 'x-api-key': key, 'content-length': String(checked.length) };
            for (const name of FORWARDED_REQUEST_HEADERS) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
            if (typeof headers['anthropic-beta'] === 'string') {
                const kept = headers['anthropic-beta'].split(',').map(b => b.trim()).filter(b => b !== '' && !REFUSED_BETA.test(b));
                if (kept.length) headers['anthropic-beta'] = kept.join(',');
                else delete headers['anthropic-beta'];
            }
            out = upstream({ method: 'POST', path: req.url, headers });
            out.on('error', () => {
                done(gone ? 499 : 502);
                if (!res.headersSent) refuse(res, 502, 'upstream_error');
                else res.destroy();
            });
            out.on('response', up => {
                const passed = Object.fromEntries(Object.entries(up.headers).filter(([name]) => !DROPPED_RESPONSE_HEADERS.includes(name)));
                res.writeHead(up.statusCode ?? 502, passed);
                up.pipe(res);
                up.on('error', () => res.destroy());
                done(up.statusCode ?? 502);
            });
            out.end(checked);
        });
    };
}

function main(argv) {
    const [mode, socket, port] = argv;
    if (mode === 'serve' && socket !== undefined && port === undefined) {
        const key = process.env.MEASURE_API_KEY ?? '';
        // Not kept where a child or a dump of the environment would find it.
        delete process.env.MEASURE_API_KEY;
        if (key.trim() === '') {
            say('model proxy: MEASURE_API_KEY is not set');
            return 1;
        }
        createHttpServer(proxyHandler(key.trim(), { log: line => say(line) })).listen(socket, () => say('model proxy: listening'));
        return null;
    }
    if (mode === 'relay' && socket !== undefined && /^[1-9]\d{3,4}$/.test(port ?? '')) {
        createTcpServer(client => {
            const up = connect(socket);
            const close = () => {
                client.destroy();
                up.destroy();
            };
            client.on('error', close);
            up.on('error', close);
            client.pipe(up);
            up.pipe(client);
        }).listen(Number(port), '127.0.0.1', () => say('model relay: listening'));
        return null;
    }
    say('usage: node scripts/model-proxy.mjs serve <socket> | relay <socket> <port>');
    return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const code = main(process.argv.slice(2));
    if (code !== null) process.exit(code);
}
