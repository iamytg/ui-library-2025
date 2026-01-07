import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/main.ts"),
      name: "LikelyUILab",
      // 적절한 확장자가 추가됩니다.
      fileName: "likely-ui-lib",
    },
    rollupOptions: {
      // 라이브러리에 포함하지 않을 디펜던시를 명시해주세요
      // external: ["vue"],
      // external: [
      //   /^(react|react-dom|@mui\/material|@emotion\/react|@emotion\/styled|axios|universal-cookie|tldts)/,
      // ],
      external: [
        new RegExp(
          `^(${[
            "react",
            "react-dom",
            "@mui/material",
            "@emotion/react",
            "@emotion/styled",
            "axios",
            "universal-cookie",
            "react-is",
            "tldts",
          ].join("|")})`
        ),
      ],
      output: {
        // 라이브러리 외부에 존재하는 디펜던시를 위해
        // UMD(Universal Module Definition) 번들링 시 사용될 전역 변수를 명시할 수도 있습니다.
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@mui/material": "MaterialUI",
          "@mui/material/styles": "MaterialUIStyles",
          "@emotion/react": "emotionReact",
          "@emotion/styled": "emotionStyled",
          axios: "axios",
          "universal-cookie": "universalCookie",
          "react-is": "ReactIs",
          tldts: "tldts",
        },
      },
    },
    emptyOutDir: true,
  },

  plugins: [
    react(),
    dts({
      entryRoot: "src/lib",
      insertTypesEntry: true, // package.json의 types 필드를 위한 엔트리 생성
      tsconfigPath: "./tsconfig.app.json",
    }),
  ],
});
