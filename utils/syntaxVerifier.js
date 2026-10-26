// Config / data / template files: no grammar, and the bracket + quote fallback
// gives false positives (apostrophes in comments, "%(name)s", "${x}").
// An empty ext (Dockerfile, Makefile) is unknown, so it is skipped too.
const UNVERIFIED_EXTS = new Set([
    '', 'toml', 'ini', 'cfg', 'conf', 'mako', 'lock', 'properties',
    'env', 'example', 'sample', 'gitignore', 'gitattributes', 'dockerignore',
    'editorconfig', 'prettierrc', 'prettierignore', 'eslintrc', 'eslintignore',
    'npmrc', 'nvmrc',
]);