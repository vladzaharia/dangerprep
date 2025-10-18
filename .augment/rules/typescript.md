---
type: "always_apply"
description: "Development guidelines for TypeScript based projects."
---

Do NOT use `npm` commands; use `yarn` commands whenever in a TS/JS project.

You MUST run `yarn build` and `yarn lint` and ensure all issues (of all severity levels) are fixed every time you make a change. You should also run `yarn dev` as well as `yarn build && yarn start` every so often to test that the changes haven't broken the dev or production server.

You must follow code conventions and best practices as done in the other files in the project.

You should research best practices for React 19 and Hono whenever you are working on a feature or fix. We must ALWAYS maintain best practices.

Whenever asked to do a task, check if there are any tools/libraries/packages that might help do the task. Use npm packages whenever possible instead of rolling your own solution.

You MUST follow ESLint rules while coding. Do not wait to lint and then fix, for instance, a `string | undefined` being passed in to a `string` parameter or other issues which are pretty trivial.

NEVER use `any`. Avoid using `unknown`. Figure out the appropriate type.
