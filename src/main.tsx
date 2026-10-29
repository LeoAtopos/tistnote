import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Startup } from "./Startup";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Startup><App /></Startup>
  </React.StrictMode>,
);
