import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Norma de la casa (28-oct-2026): TODOS los QR llevan el logo de Camberas.
    // El único fichero que habla con la librería es src/lib/qrConLogo.ts; en
    // los correos lo hace la edge function qr-dorsal.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/qrConLogo.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "qrcode",
              message: "Los QR llevan el logo de Camberas: usa qrConLogo (src/lib/qrConLogo.ts).",
            },
          ],
          patterns: [
            {
              group: ["qrcode/*"],
              message: "Los QR llevan el logo de Camberas: usa qrConLogo (src/lib/qrConLogo.ts).",
            },
          ],
        },
      ],
      // import("qrcode") dinámico: no-restricted-imports no lo mira
      "no-restricted-syntax": [
        "error",
        {
          // (esquery no admite "/" dentro del regex: "qrcode" solo o seguido de "/")
          selector: "ImportExpression > Literal[value=/^qrcode(?![\\w-])/]",
          message: "Los QR llevan el logo de Camberas: usa qrConLogo (src/lib/qrConLogo.ts).",
        },
      ],
    },
  },
);
