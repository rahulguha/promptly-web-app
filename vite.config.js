import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load env file for the current mode
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [sveltekit()],
    define: {
      "import.meta.env.PUBLIC_BACKEND_API_BASE_URL": JSON.stringify(
        env.PUBLIC_BACKEND_API_BASE_URL
      ),
    },
    server: {
      proxy: {
        // Proxy all API requests to the backend server
        "/v1": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:8082",
          changeOrigin: true,
        },
      },
    },
  };
});
