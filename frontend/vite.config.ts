import path from "path";
import { readFileSync, writeFileSync } from "fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { buildContentSecurityPolicy } from "./lib/content-security-policy";

const SEO_FILES = ["robots.txt", "sitemap.xml"] as const;

const SITE_META = {
  name: "Chile Devs Map",
  description:
    "An interactive map of Chilean developers on GitHub. Browse by city and region, explore public contribution stats, and search by language or location.",
  tagline: "Discover Chilean developers on GitHub — mapped by city and region.",
  locale: "en_US",
  twitterCard: "summary_large_image",
} as const;

const CSP_META_TAG =
  /^\s*<meta http-equiv="Content-Security-Policy"[^>]*\/>\s*$/m;

function siteMetaPlugin(
  siteUrl: string,
  backendUrl?: string,
  isDev = false,
): Plugin {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const contentSecurityPolicy = isDev
    ? null
    : buildContentSecurityPolicy({
        backendUrl,
        includeFrameAncestors: false,
      });

  const injectSiteMeta = (contents: string) => {
    const html = contents
      .replaceAll("%SITE_URL%", normalizedSiteUrl)
      .replaceAll("%SITE_NAME%", SITE_META.name)
      .replaceAll("%SITE_DESCRIPTION%", SITE_META.description)
      .replaceAll("%SITE_TAGLINE%", SITE_META.tagline)
      .replaceAll("%SITE_LOCALE%", SITE_META.locale)
      .replaceAll("%TWITTER_CARD%", SITE_META.twitterCard);

    if (contentSecurityPolicy === null) {
      return html.replace(CSP_META_TAG, "");
    }

    return html.replaceAll("%CONTENT_SECURITY_POLICY%", contentSecurityPolicy);
  };

  const readSeoTemplate = (fileName: (typeof SEO_FILES)[number]) =>
    readFileSync(path.resolve(__dirname, "seo", fileName), "utf8");

  return {
    name: "site-meta",
    transformIndexHtml(html) {
      return injectSiteMeta(html);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/robots.txt" && req.url !== "/sitemap.xml") {
          next();
          return;
        }

        const fileName = req.url.slice(1) as (typeof SEO_FILES)[number];
        const body = injectSiteMeta(readSeoTemplate(fileName));
        res.setHeader(
          "Content-Type",
          fileName.endsWith(".xml") ? "application/xml" : "text/plain",
        );
        res.end(body);
      });

      if (!isDev) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader(
            "Content-Security-Policy",
            buildContentSecurityPolicy({ backendUrl }),
          );
          next();
        });
      }
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      for (const fileName of SEO_FILES) {
        writeFileSync(
          path.join(distDir, fileName),
          injectSiteMeta(readSeoTemplate(fileName)),
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const isDev = command === "serve";
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_URL ?? "http://localhost:3000";
  const siteUrl = env.VITE_SITE_URL ?? "http://localhost:5173";

  return {
    plugins: [
      react(),
      tailwindcss(),
      siteMetaPlugin(siteUrl, backendUrl, isDev),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
