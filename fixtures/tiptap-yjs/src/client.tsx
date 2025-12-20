import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import Collaboration from "@tiptap/extension-collaboration";
// import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import useYProvider from "y-partyserver/react";

import "./styles.css";

// 5 pastel colors
// const colours = ["#FFC0CB", "#FFD700", "#98FB98", "#87CEFA", "#FFA07A"];

// Pick a random color from the list
// This is just for demonstration purposes
// const MY_COLOR = colours[Math.floor(Math.random() * colours.length)];

function Tiptap() {
  const provider = useYProvider({
    party: "document",
    room: "y-partyserver-text-editor-example" // replace with your own document name
  });

  const [messages, setMessages] = useState<Array<{ id: string; text: string }>>(
    []
  );

  useEffect(() => {
    // Listen for custom messages from the server
    const handleCustomMessage = (message: string) => {
      try {
        const data = JSON.parse(message);
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            text: `${new Date().toLocaleTimeString()}: ${JSON.stringify(data)}`
          }
        ]);
      } catch (error) {
        console.error("Failed to parse custom message:", error);
      }
    };

    provider.on("custom-message", handleCustomMessage);

    return () => {
      provider.off("custom-message", handleCustomMessage);
    };
  }, [provider]);

  const sendPing = () => {
    provider.sendMessage(JSON.stringify({ action: "ping" }));
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // The Collaboration extension comes with its own history handling
        // history: false
      }),
      Collaboration.configure({
        document: provider.doc
      })
      // Register the collaboration cursor extension
      // CollaborationCursor.configure({
      //   provider: provider,
      //   user: {
      //     name: provider.id,
      //     color: MY_COLOR
      //   }
      // })
    ]
  });

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}> A text editor </h1>
      <EditorContent style={{ border: "solid" }} editor={editor} />

      <div style={{ marginTop: 20 }}>
        <h2>Custom Messages Demo</h2>
        <button
          type="button"
          onClick={sendPing}
          style={{ padding: "10px 20px" }}
        >
          Send Ping
        </button>
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #ccc",
            maxHeight: 200,
            overflowY: "auto"
          }}
        >
          <h3>Messages:</h3>
          {messages.length === 0 ? (
            <p>No messages yet</p>
          ) : (
            messages.map((msg) => <div key={msg.id}>{msg.text}</div>)
          )}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Tiptap />);
