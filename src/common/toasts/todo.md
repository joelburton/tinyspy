# toasts — todo

## Bugs

## Soon

- **The `window.puptoast` install is behind a `typeof window` check** that
  cannot fail — SPA, no server render, and jsdom has a `window`
  (docs/code-conventions.md → Known gotchas). The guard goes; the question to
  answer with the file open is whether the dev helper should install
  unconditionally at all, or only under `import.meta.env.DEV`. `faults` has the
  identical line for `window.pupfault`.

## Someday

## Maybe
