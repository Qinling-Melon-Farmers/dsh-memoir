/**
 * /api/dsh-memoir/* route layer for the web panel: a JSON envelope (ok /
 * error) over the structured store. Reads are GET with query params; writes
 * require an explicit application/json content-type (blocks form-based CSRF,
 * same stance as the sibling aionui-panel routes).
 */
import { SECTIONS, SECTION_KEYS, projectKey, projectTitle } from './store.js';
const BAD_REQUEST = { code: 'bad-request', message: 'malformed request' };
const NOT_FOUND = { code: 'not-found', message: 'unknown route' };
const METHOD = { code: 'method', message: 'method not allowed' };
const CONTENT_TYPE = { code: 'content-type', message: 'application/json content-type required' };
const OK = (value) => ({ ok: true, value });
const FAIL = (error) => ({ ok: false, error });
/** Write one JSON envelope response. */
export function json(res, envelope, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(envelope));
}
/** Read a bounded JSON request body; null when unparseable or oversized. */
export async function readJsonBody(req, limit = 1 << 20) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        chunks.push(buffer);
        total += buffer.length;
        if (total > limit)
            return null;
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text === '')
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/** Extract a string field; null when missing/empty or not a string. */
function strField(payload, key, allowEmpty = false) {
    if (typeof payload !== 'object' || payload === null)
        return null;
    const value = payload[key];
    if (typeof value !== 'string')
        return null;
    if (!allowEmpty && value === '')
        return null;
    return value;
}
/** Validate a workspace path field for writes (absolute on win32/posix). */
function validPath(value) {
    return /^[A-Za-z]:[\\/]|[\\/]/.test(value);
}
/** Filter one entry by optional section + query. */
function entryFilter(section, query) {
    const q = query.toLowerCase();
    return (entry) => (section === undefined || entry.section === section) &&
        (q === '' || `${entry.title ?? ''} ${entry.content}`.toLowerCase().includes(q));
}
/** Project one project record into the wire shape. */
function wireProject(key, project, filter) {
    return {
        key,
        path: project.path,
        title: project.title || projectTitle(project.path),
        updatedAt: project.updatedAt,
        entries: project.entries.filter(filter),
    };
}
/**
 * Build the /api/dsh-memoir prefix route.
 * @param store - the structured MemoirStore.
 * @param diagnostics - optional runtime diagnostics provider.
 * @returns route definitions for ctx.webServer.register.
 */
export function makeRoutes(store, diagnostics) {
    const handler = async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const pathname = url.pathname;
        const method = (req.method ?? 'GET').toUpperCase();
        // ------------------------------------------------------------ reads
        if (method === 'GET') {
            if (pathname === '/api/dsh-memoir/diagnostics') {
                if (diagnostics === undefined) {
                    json(res, FAIL(NOT_FOUND), 404);
                    return;
                }
                const path = url.searchParams.get('path') ?? undefined;
                json(res, OK(diagnostics(path)));
                return;
            }
            if (pathname === '/api/dsh-memoir/project') {
                const path = url.searchParams.get('path');
                if (path === null || path === '') {
                    json(res, FAIL(BAD_REQUEST), 400);
                    return;
                }
                const section = url.searchParams.get('section') ?? undefined;
                if (section !== undefined && !SECTION_KEYS.includes(section)) {
                    json(res, FAIL(BAD_REQUEST), 400);
                    return;
                }
                const query = url.searchParams.get('query') ?? '';
                const key = projectKey(path);
                const project = store.project(path);
                const filter = entryFilter(section, query);
                const value = project === undefined
                    ? { project: { key, path, title: projectTitle(path), updatedAt: 0, entries: [] } }
                    : { project: wireProject(key, project, filter) };
                json(res, OK(value));
                return;
            }
            if (pathname === '/api/dsh-memoir/global') {
                const section = url.searchParams.get('section') ?? undefined;
                if (section !== undefined && !SECTION_KEYS.includes(section)) {
                    json(res, FAIL(BAD_REQUEST), 400);
                    return;
                }
                const query = url.searchParams.get('query') ?? '';
                const filter = entryFilter(section, query);
                const storeFile = store.load();
                const projects = Object.entries(storeFile.projects)
                    .map(([key, project]) => wireProject(key, project, filter))
                    .filter((project) => project.entries.length > 0)
                    // Newest first; deterministic tiebreak when times collide (same ms).
                    .sort((a, b) => b.updatedAt - a.updatedAt || a.path.localeCompare(b.path));
                json(res, OK({ projects }));
                return;
            }
            json(res, FAIL(NOT_FOUND), 404);
            return;
        }
        // ----------------------------------------------------------- writes
        if (method !== 'POST' && method !== 'DELETE') {
            json(res, FAIL(METHOD), 405);
            return;
        }
        const contentType = req.headers['content-type'] ?? '';
        if (!contentType.toLowerCase().startsWith('application/json')) {
            json(res, FAIL(CONTENT_TYPE), 415);
            return;
        }
        const payload = await readJsonBody(req);
        if (payload === null) {
            json(res, FAIL(BAD_REQUEST), 400);
            return;
        }
        if (pathname !== '/api/dsh-memoir/entries') {
            json(res, FAIL(NOT_FOUND), 404);
            return;
        }
        const path = strField(payload, 'path');
        if (path === null || !validPath(path)) {
            json(res, FAIL({ code: 'bad-request', message: 'path must be an absolute workspace path' }), 400);
            return;
        }
        if (method === 'POST') {
            const section = strField(payload, 'section');
            const content = strField(payload, 'content');
            if (section === null || content === null) {
                json(res, FAIL(BAD_REQUEST), 400);
                return;
            }
            if (!Object.prototype.hasOwnProperty.call(SECTIONS, section)) {
                json(res, FAIL({ code: 'bad-request', message: `section must be one of ${SECTION_KEYS.join('/')}` }), 400);
                return;
            }
            const title = strField(payload, 'title', true) ?? undefined;
            const sessionId = strField(payload, 'sessionId', true) ?? undefined;
            const entry = store.record(path, { section: section, title, content }, sessionId);
            json(res, OK({ entry }));
            return;
        }
        // DELETE
        const id = strField(payload, 'id');
        if (id === null) {
            json(res, FAIL(BAD_REQUEST), 400);
            return;
        }
        const removed = store.remove(path, id);
        json(res, OK({ removed }));
    };
    return [{ kind: 'prefix', path: '/api/dsh-memoir', handler }];
}
