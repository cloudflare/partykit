import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Demo } from "./Demo";

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <Demo />
  </StrictMode>
);
