---
type: "always_apply"
description: "Development guidelines for TypeScript based projects."
---

You MUST run `yarn build` and `yarn lint` and ensure all issues (of all severity levels) are fixed every time you make a change. You should also run `yarn dev` as well as `yarn build && yarn start` every so often to test that the changes haven't broken the dev or production server.

You must follow code conventions and best practices as done in the other files in the project.

You should research best practices for React 19 and Hono whenever you are working on a feature or fix. We must ALWAYS maintain best practices.

You MUST follow ESLint rules while coding. Do not wait to lint and then fix, for instance, a `string | undefined` being passed in to a `string` parameter or other issues which are pretty trivial.

NEVER use `any`. Avoid using `unknown`. Figure out the appropriate type.

Always use `yarn`. Do NOT use `npm` whenever possible.

Use WebAwesome components whenever possible. You can find the documentation directly at https://webawesome.com/. Do NOT use Context7 or any other tools for WebAwesome documentation as it changes rapidly. 
- You can find components (like card, input, etc) at https://webawesome.com/docs/components/{component name, all lowercase, separated by dashes} like https://webawesome.com/docs/components/animated-image and https://webawesome.com/docs/components/avatar
- You can find layout primitives (like stack, grid, cluster, etc) at https://webawesome.com/docs/utilities/{primitive name, all lowercase, separated by dashes} like https://webawesome.com/docs/utilities/cluster or https://webawesome.com/docs/utilities/align-items
- Color utilities are found at https://webawesome.com/docs/utilities/color and should be used whenever possible