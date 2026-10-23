'use strict';

function findCssRule(rootNode, target) {
    const norm = target.replace(/\s+/g, ' ').trim();
    let found = null;
    (function walk(node) {
        if (found) return;
        if (node.type === 'rule_set') {
            const block = node.children.find(c => c.type === 'block');
            const selText = node.children
                .filter(c => c !== block)
                .map(c => c.text)
                .join('')
                .replace(/\s+/g, ' ')
                .trim();
            if (selText === norm) { found = node; return; }
            // Support targets that are a single selector within a comma-separated rule
            // e.g. target ".a th:nth-child(1)" should match rule ".a th:nth-child(1), .a td:nth-child(1)"
            const selParts = selText.split(',').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
            if (selParts.includes(norm)) { found = node; return; }
        }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return found;
}

function findJsonPath(rootNode, target) {
    const parts = target.split('.');
    let cur = rootNode;
    if (cur.type === 'program' && cur.namedChildCount === 1) {
        const only = cur.namedChild(0);
        if (only.type === 'expression_statement') {
            const obj = only.childForFieldName('value') || only.namedChild(0);
            if (obj && obj.type === 'object') cur = obj;
        } else if (only.type === 'object') {
            cur = only;
        }
    }
    for (const key of parts) {
        let found = null;
        for (let i = 0; i < cur.childCount; i++) {
            const child = cur.child(i);
            if (child.type === 'pair') {
                const k = child.childForFieldName('key');
                if (k) {
                    const raw = k.text.replace(/^["']|["']$/g, '');
                    if (raw === key) { found = child; break; }
                }
            }
        }
        if (!found) return null;
        if (key === parts[parts.length - 1]) return found;
        const val = found.childForFieldName('value');
        if (!val || val.type !== 'object') return null;
        cur = val;
    }
    return null;
}

function findNamedNode(rootNode, target) {
    let found = null;
    (function walk(node) {
        if (found) return;
        if (node.type === 'export_statement') {
            for (let i = 0; i < node.namedChildCount; i++) {
                const child = node.namedChild(i);
                const nameNode = child.childForFieldName && child.childForFieldName('name');
                if (nameNode && nameNode.text === target) {
                    found = node;
                    return;
                }
            }
        }
        // PHP: "const MAX = 10;" — the name lives on the const element
        if (node.type === 'const_declaration' || node.type === 'const_element') {
            const el = node.type === 'const_element'
                ? node
                : node.children.find(c => c.type === 'const_element');
            if (el) {
                const nameNode = el.childForFieldName && el.childForFieldName('name');
                if (nameNode && nameNode.text === target) {
                    found = node.type === 'const_element' ? el : node;
                    return;
                }
            }
        }
        // PHP: "$protected $qty;" / "public string $name;"
        if (node.type === 'property_declaration') {
            const el = node.children.find(c => c.type === 'property_element');
            if (el) {
                const nameNode = el.childForFieldName && el.childForFieldName('name');
                if (nameNode && nameNode.text === target) {
                    found = node;
                    return;
                }
            }
        }
        const nameNode = node.childForFieldName && node.childForFieldName('name');
        if (nameNode && nameNode.text === target) {
            let n = node;
            if (n.type === 'variable_declarator') {
                const parent = n.parent;
                if (parent && (parent.type === 'lexical_declaration' || parent.type === 'variable_declaration')) {
                    const declarators = parent.namedChildren.filter(c => c.type === 'variable_declarator');
                    if (declarators.length === 1) n = parent;
                }
            }
            if ((n.type === 'lexical_declaration' || n.type === 'variable_declaration' || n.type === 'function_declaration' || n.type === 'class_declaration') && n.parent && n.parent.type === 'export_statement') {
                n = n.parent;
            }
            found = n;
            return;
        }
        if (node.type === 'pair') {
            const k = node.childForFieldName('key');
            if (k && k.text.replace(/^["']|["']$/g, '') === target) {
                found = node;
                return;
            }
        }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return found;
}

// --- PHP anchors ----------------------------------------------------------

// Top-level "use App\Models\Resort;" statements
function findPhpUses(rootNode) {
    const uses = [];
    (function walk(node) {
        if (node.type === 'namespace_use_declaration') uses.push(node);
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return uses;
}

function findPhpNamespace(rootNode) {
    let found = null;
    (function walk(node) {
        if (found) return;
        if (node.type === 'namespace_definition') { found = node; return; }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return found;
}

function findPhpOpenTag(rootNode) {
    let found = null;
    (function walk(node) {
        if (found) return;
        if (node.type === 'php_tag') { found = node; return; }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return found;
}

function findLastImport(rootNode) {
    let last = null;
    (function walk(node) {
        if (node.type === 'import_statement') last = node;
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return last;
}

/**
 * Regex fallback for languages/targets the grammar cannot resolve.
 *
 * The brace scan is BOUNDED: it stops at the end of the enclosing top-level
 * construct. Without that bound a `const x = ref([])` in a .vue file would
 * swallow everything up to the next `}` in the <style> block — deleting
 * `</script>` and the whole stylesheet.
 */
function findViaString(source, target) {
    const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        `function\\s+${esc}\\b`,
        `class\\s+${esc}\\b`,
        `(?:const|let|var)\\s+${esc}\\b`,
        `def\\s+${esc}\\b`,
        `<\\s*${esc}[\\s>]`,
        `\\$${esc}\\b`,
        `\\b${esc}\\s*\\(`,
    ];
    for (const pat of patterns) {
        const re = new RegExp(pat, 'm');
        const m = re.exec(source);
        if (m) {
            const start = m.index;
            let end = source.indexOf('\n', start);
            if (end === -1) end = source.length;
            const limit = findConstructLimit(source, start);
            const after = source.slice(start, limit);
            let depth = 0, foundBrace = false;
            for (let i = 0; i < after.length; i++) {
                if (after[i] === '{') { depth++; foundBrace = true; }
                else if (after[i] === '}') { depth--; if (foundBrace && depth === 0) { end = start + i + 1; break; } }
            }
            if (end <= start) end = start + m[0].length;
            if (end > limit) end = limit;
            return { startIndex: start, endIndex: end, text: source.slice(start, end) };
        }
    }
    return null;
}

/**
 * End offset of the top-level construct that contains `start`.
 * A construct ends at a column-0 "}", "<?php", "</script>" or "</style>".
 * Only column 0 counts — an indented "}" closes an inner block, not the
 * construct the target lives in.
 */
function findConstructLimit(source, start) {
    const limitRe = /^(?:\}|<\?php|<\/script\s*>|<\/style\s*>)/gm;
    limitRe.lastIndex = 0;
    let m;
    while ((m = limitRe.exec(source)) !== null) {
        if (m.index > start) return m.index;
    }
    return source.length;
}

module.exports = {
    findCssRule,
    findJsonPath,
    findNamedNode,
    findLastImport,
    findViaString,
    findPhpUses,
    findPhpNamespace,
    findPhpOpenTag,
    findConstructLimit,
};