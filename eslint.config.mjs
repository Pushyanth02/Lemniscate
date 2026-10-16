import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    /* eslint-config-next no longer registers the react-hooks plugin for us,
       so register it here. The rule set below then resolves. */
    plugins: { "react-hooks": reactHooks },
    rules: {
      // TypeScript — keep strict, but allow pragmatic patterns
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",

      // React 19 compiler rules — legitimate patterns in this codebase
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/prop-types": "off",

      // Next.js — allow data: URIs for the favicon, client-only fonts
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-page-custom-font": "off",

      // General — pragmatic
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-build/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**",
      "skills/**",
      ".agents/**",
      "examples/**",
      "mini-services/**",
      "audit/**",
      "upload/**",
      "tool-results/**",
      "agent/**",
      "agent-ctx/**",
      "tests/**",
    ],
  },
];

export default eslintConfig;
