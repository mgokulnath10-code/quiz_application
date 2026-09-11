// ESLint config for the backend only.
// It overrides the root config (which targets the
// React frontend) so CommonJS globals like
// `require` and `module` are recognized.

module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        // Node.js globals
        require: "readonly",
        module: "writable",
        exports: "writable",
        process: "readonly",
        console: "readonly",
        global: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        // Available in Node 18+
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        crypto: "readonly",
      },
    },
    rules: {
      // Mongoose schemas and Express handlers
      // commonly leave params unused.
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_|next", varsIgnorePattern: "^_" },
      ],
    },
  },
];
