import * as monaco from "monaco-editor";
import { WebSocket as BetterWebSocket } from "partysocket";
import { MonacoBinding } from "y-monaco";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker.js?worker";

window.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  }
};

window.addEventListener("load", () => {
  const ydoc = new Y.Doc();
  const provider = new YProvider(window.location.origin, "monaco-demo", ydoc, {
    party: "monaco",
    // @ts-expect-error I don't know typescript
    WebSocketPolyfill: BetterWebSocket
  });

  provider.ws?.send("do-the-thing");

  const type = ydoc.getText("monaco");

  const editor = monaco.editor.create(
    /** @type {HTMLElement} */ document.getElementById("monaco-editor")!,
    {
      value: "",
      language: "javascript",
      theme: "vs-dark"
    }
  );
  new MonacoBinding(
    type,
    /** @type {monaco.editor.ITextModel} */ editor.getModel()!,
    new Set([editor]),
    provider.awareness
  );

  const connectBtn =
    /** @type {HTMLElement} */ document.getElementById("y-connect-btn")!;
  connectBtn.addEventListener("click", () => {
    if (provider.shouldConnect) {
      provider.disconnect();
      connectBtn.textContent = "Connect";
    } else {
      provider.connect().catch(console.error);
      connectBtn.textContent = "Disconnect";
    }
  });
});
