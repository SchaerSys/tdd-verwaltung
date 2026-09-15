import js from "@eslint/js";
import ts from "typescript-eslint";

// Nicht wegen Stil – wegen no-floating-promises: bei der Menge an await db()-Aufrufen
// findet die Regel vergessene awaits auf Schreiboperationen, also echte Fehler.
export default [
  { ignores: ["**/.next/**", "**/node_modules/**", "**/dist/**", "apps/web/public/**", "**/*.mjs", "**/*.js", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      // React-Handler und useEffect duerfen async sein; die Regel greift dann nur noch
      // dort, wo ein Promise wirklich falsch benutzt wird (Bedingungen, Spread).
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false, arguments: false } }],
      // Drizzles sql-Tag stringifiziert seine Parameter selbst; die Regel meldet dort
      // 75 Scheinfunde und keinen einzigen echten.
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-assignment": "off", // rohe SQL-Ergebnisse sind bewusst `unknown`
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  // Tests und Werkzeug-Konfigurationen liegen ausserhalb der tsconfig-Projekte:
  // ohne Typinformation pruefen, sonst gar nicht.
  {
    files: ["**/test/**/*.ts", "**/*.config.ts", "scripts/**/*.ts"],
    ...ts.configs.disableTypeChecked,
  },
];
