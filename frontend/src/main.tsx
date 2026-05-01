import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { AiSubscriptionProvider } from "@/ai/AiSubscriptionProvider";
import { I18nProvider } from "@/i18n";
import { appTheme } from "@/theme/theme";
import App from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <I18nProvider>
        <AiSubscriptionProvider>
          <App />
        </AiSubscriptionProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
