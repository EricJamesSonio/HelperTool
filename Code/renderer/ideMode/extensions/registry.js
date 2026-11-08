export const EXTENSIONS = [
  {
    id: 'js',
    name: 'JavaScript / TypeScript',
    badge: 'JS',
    color: '--yellow',
    desc: 'Syntax errors in JS, JSX, TS and TSX, JSON validation, and basic lint: == vs ===, var, debugger, assignment in conditions, empty catch blocks.',
    langs: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    fileExts: ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json'],
  },
  {
    id: 'python',
    name: 'Python',
    badge: 'PY',
    color: '--blue',
    desc: 'Syntax and indentation errors, plus lint for bare except, mutable default arguments, == None, wildcard imports and mixed tabs and spaces.',
    langs: ['.py'],
    fileExts: ['py', 'pyw'],
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    badge: 'NS',
    color: '--red',
    desc: 'Decorators used without importing them, route decorators outside a controller, controller and service classes missing their decorators.',
    langs: ['.ts', '.js'],
    fileExts: ['ts', 'js'],
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    badge: 'NX',
    color: '--text-primary',
    desc: 'App Router checks: hooks and event handlers in server components, misplaced use client, next/router in app/, img and internal a tags.',
    langs: ['.tsx', '.ts', '.jsx', '.js'],
    fileExts: ['ts', 'tsx', 'js', 'jsx'],
  },
  {
    id: 'php',
    name: 'PHP',
    badge: 'PHP',
    color: '--purple',
    desc: 'Syntax errors and missing semicolons, plus lint for leftover var_dump, removed mysql_ functions, eval and unescaped echo of user input.',
    langs: ['.php'],
    fileExts: ['php'],
  },
  {
    id: 'laravel',
    name: 'Laravel',
    badge: 'LV',
    color: '--red',
    desc: 'Leftover dd and dump calls, env() outside config, raw SQL with variables, mass assignment, and unbalanced Blade directives.',
    langs: ['.php', '.blade.php'],
    fileExts: ['php'],
  },
  {
    id: 'cpp',
    name: 'C / C++',
    badge: 'C++',
    color: '--accent',
    desc: 'Unmatched brackets, unterminated strings, bad #include lines, #if without #endif, missing semicolon after a class, unsafe calls such as gets and strcpy.',
    langs: ['.c', '.cpp', '.cc', '.h', '.hpp'],
    fileExts: ['c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx'],
  },
];

export function extById(id) {
  return EXTENSIONS.find((e) => e.id === id) || null;
}