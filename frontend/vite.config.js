import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import tailwindConfig from "./tailwind.config.cjs";

// GitHub Pages 프로젝트 페이지(https://<user>.github.io/<repo>/)로 배포한다면
// VITE_BASE_PATH="/<repo>/" 를 빌드 시 환경변수로 넘겨주세요.
// (username.github.io 형태의 유저 페이지라면 기본값 "/" 그대로 두면 됩니다.)
//
// postcss.config.cjs 파일 기반 탐색을 Vite가 제대로 못 읽는 문제가 있어서
// (content가 비어있다는 경고가 계속 남) css.postcss에 직접 플러그인을 지정함.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  css: {
    postcss: {
      plugins: [tailwindcss(tailwindConfig), autoprefixer()],
    },
  },
});
