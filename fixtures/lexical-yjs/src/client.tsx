import { createRoot } from "react-dom/client";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import useYProvider from "y-partyserver/react";

function Editor() {
  const initialConfig = {
    editorState: null,
    namespace: "oops",
    nodes: [],
    onError(error: Error) {
      throw error;
    }
  };

  const docName = "yjs";

  const yProvider = useYProvider({
    room: docName,
    prefix: `/parties/lexical-document/${docName}`
  });

  return (
    <LexicalCollaboration>
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={<ContentEditable />}
          placeholder={<div>Enter some text...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <CollaborationPlugin
          id={docName}
          // TODO: we should fix it sometime
          // @ts-expect-error TODO: we need to align with lexical's definitions here
          providerFactory={(id, yjsDocMap) => {
            yjsDocMap.set(id, yProvider.doc);
            return yProvider;
          }}
          shouldBootstrap={true}
        />
      </LexicalComposer>
    </LexicalCollaboration>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Editor />);
