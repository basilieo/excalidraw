import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { JobBook } from "./JobBook";
import { createStorage, readConfig } from "./storage";

import "./jobbook.css";

const config = readConfig();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JobBook config={config} storage={createStorage(config)} />
  </StrictMode>,
);
