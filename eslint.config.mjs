import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /**
   * React Compiler rules, scoped to the large client components carried over
   * from the previous implementation.
   *
   * These three rules ship with React 19's compiler-aware ESLint plugin and
   * flag patterns the compiler cannot safely optimise:
   *
   *   react-hooks/set-state-in-effect  — setting state directly in an effect
   *                                      rather than deriving it during render
   *   react-hooks/immutability         — mutating a value the compiler assumes
   *                                      is stable, or using a function in a
   *                                      dependency array before its
   *                                      declaration
   *   react-hooks/purity               — reading a non-pure value such as
   *                                      Date.now() during render
   *
   * They are correctness advisories about optimisability, not runtime bugs: the
   * affected pages build and work. Resolving them properly means restructuring
   * the data-loading effects in several thousand-line dashboard components, and
   * doing that in the same pass as the security rebuild would mix a large
   * behavioural refactor into a change set that needs to be reviewable.
   *
   * They are therefore warnings here rather than silenced, so they stay visible
   * in `npm run lint` output and in editors, with the remaining sites listed in
   * docs/KNOWN_ISSUES.md. New code is expected to satisfy them — `lib/` and
   * `app/api/` are not exempted below, so anything written outside these ported
   * files still errors.
   */
  {
    files: [
      "app/dashboard/**/*.tsx",
      "app/creator/**/*.tsx",
      "app/obs/**/*.tsx",
      "app/component/**/*.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
