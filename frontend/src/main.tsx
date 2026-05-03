
  import { ThemeProvider } from "next-themes";
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import faviconUrl from "./assets/corner-logo.svg?url";
  import "./styles/index.css";

  function setFavicon(href: string) {
    const apply = (rel: string) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.type = "image/svg+xml";
      link.href = href;
    };
    apply("icon");
    apply("shortcut icon");
  }

  setFavicon(faviconUrl);

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>,
  );
  