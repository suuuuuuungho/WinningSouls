import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 프로젝트 페이지(https://<user>.github.io/<repo>/)로 배포한다면
// VITE_BASE_PATH="/<repo>/" 를 빌드 시 환경변수로 넘겨주세요.
// (username.github.io 형태의 유저 페이지라면 기본값 "/" 그대로 두면 됩니다.)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
});
