/**
 * swaggerImport.js
 * Parses OpenAPI 3.0 / Swagger 2.0 specs and returns normalized endpoint list.
 */

/**
 * Fetch spec from a URL (uses Electron's fetch, no CORS issues)
 */
export async function fetchSpec(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — could not fetch spec from ${url}`);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error('Response is not valid JSON. Only JSON specs are supported (not YAML).'); }
}

/**
 * Parse OpenAPI 3.0 or Swagger 2.0 spec into normalized endpoints.
 * Returns: [{ method, path, description, headers, body, params, summary }]
 */
export function parseSpec(spec) {
    if (spec.openapi && spec.openapi.startsWith('3.')) return _parseOpenApi3(spec);
    if (spec.swagger && spec.swagger.startsWith('2.')) return _parseSwagger2(spec);
    throw new Error('Unrecognized spec format. Expected OpenAPI 3.x or Swagger 2.x.');
}

/* ── OpenAPI 3.x ─────────────────────────────────────────────── */
function _parseOpenApi3(spec) {
    const endpoints = [];
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
        const HTTP_METHODS = ['get','post','put','patch','delete','head','options'];
        for (const method of HTTP_METHODS) {
            const op = pathItem[method];
            if (!op) continue;

            const endpoint = {
                method: method.toUpperCase(),
                path,
                description: op.summary || op.description || '',
                summary: op.summary || '',
                headers: {},
                body: '',
                params: {},
            };

            // Query / header / path params
            const allParams = [...(pathItem.parameters || []), ...(op.parameters || [])];
            for (const p of allParams) {
                const val = p.example !== undefined ? String(p.example)
                          : p.default  !== undefined ? String(p.default)
                          : p.schema?.example !== undefined ? String(p.schema.example)
                          : '';
                if (p.in === 'query')  endpoint.params[p.name]  = val;
                if (p.in === 'header') endpoint.headers[p.name] = val;
                if (p.in === 'path')   endpoint.params[`{${p.name}}`] = val || `<${p.name}>`;
            }

            // Request body
            if (op.requestBody) {
                const content = op.requestBody.content || {};
                const jsonContent = content['application/json'];
                if (jsonContent) {
                    endpoint.headers['Content-Type'] = 'application/json';
                    const schema = jsonContent.schema;
                    if (schema) {
                        endpoint.body = JSON.stringify(_schemaToExample(schema, spec), null, 2);
                    }
                }
            }

            endpoints.push(endpoint);
        }
    }
    return endpoints;
}

/* ── Swagger 2.x ─────────────────────────────────────────────── */
function _parseSwagger2(spec) {
    const endpoints = [];
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
        const HTTP_METHODS = ['get','post','put','patch','delete','head','options'];
        for (const method of HTTP_METHODS) {
            const op = pathItem[method];
            if (!op) continue;

            const endpoint = {
                method: method.toUpperCase(),
                path,
                description: op.summary || op.description || '',
                summary: op.summary || '',
                headers: {},
                body: '',
                params: {},
            };

            const allParams = [...(pathItem.parameters || []), ...(op.parameters || [])];
            for (const p of allParams) {
                const val = p.example !== undefined ? String(p.example)
                          : p.default  !== undefined ? String(p.default)
                          : '';
                if (p.in === 'query')  endpoint.params[p.name]  = val;
                if (p.in === 'header') endpoint.headers[p.name] = val;
                if (p.in === 'path')   endpoint.params[`{${p.name}}`] = val || `<${p.name}>`;
                if (p.in === 'body' && p.schema) {
                    endpoint.headers['Content-Type'] = 'application/json';
                    endpoint.body = JSON.stringify(_schemaToExample(p.schema, spec), null, 2);
                }
            }

            endpoints.push(endpoint);
        }
    }
    return endpoints;
}

/* ── Schema → Example value ──────────────────────────────────── */
function _schemaToExample(schema, spec, _depth = 0) {
    if (!schema || _depth > 5) return null;

    // Resolve $ref
    if (schema.$ref) {
        const resolved = _resolveRef(schema.$ref, spec);
        return resolved ? _schemaToExample(resolved, spec, _depth + 1) : null;
    }

    if (schema.example !== undefined) return schema.example;

    switch (schema.type) {
        case 'object': {
            const obj = {};
            if (schema.properties) {
                for (const [k, v] of Object.entries(schema.properties)) {
                    obj[k] = _schemaToExample(v, spec, _depth + 1);
                }
            }
            return obj;
        }
        case 'array':
            return schema.items ? [_schemaToExample(schema.items, spec, _depth + 1)] : [];
        case 'string':
            return schema.enum ? schema.enum[0] : (schema.format === 'email' ? 'user@example.com' :
                   schema.format === 'date-time' ? new Date().toISOString() :
                   schema.format === 'uuid' ? '00000000-0000-0000-0000-000000000000' : 'string');
        case 'integer':
        case 'number':
            return schema.minimum !== undefined ? schema.minimum : 0;
        case 'boolean':
            return false;
        default:
            // No type — try properties
            if (schema.properties) {
                const obj = {};
                for (const [k, v] of Object.entries(schema.properties)) {
                    obj[k] = _schemaToExample(v, spec, _depth + 1);
                }
                return obj;
            }
            return null;
    }
}

function _resolveRef(ref, spec) {
    // e.g. "#/components/schemas/User" or "#/definitions/User"
    const parts = ref.replace(/^#\//, '').split('/');
    let cur = spec;
    for (const part of parts) {
        cur = cur?.[part];
        if (!cur) return null;
    }
    return cur;
}