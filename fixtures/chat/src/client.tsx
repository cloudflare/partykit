import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { nanoid } from "nanoid";
import { usePartySocket } from "partysocket/react";

import type { ChatMessage } from "./types";

import "./styles.css";

const randomNames = [
  "Alice",
  "Bob",
  "Charlie",
  "David",
  "Eve",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
  "Mallory",
  "Oscar",
  "Peggy",
  "Trent",
  "Wendy"
];

const me =
  sessionStorage.getItem("me") ??
  randomNames[Math.floor(Math.random() * randomNames.length)];

function App() {
  const [messages, setMessages] = useState<Array<ChatMessage>>([]);
  const [connected, setConnected] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const socket = usePartySocket({
    room: "abc",
    party: "chat",
    enabled: connected,
    onOpen() {
      console.log("Connected to the party!");
    },
    onMessage(evt) {
      console.log("Received a message:", evt.data);
      const message = JSON.parse(evt.data as string) as ChatMessage;
      setMessages((prevMessages) => [...prevMessages, message]);
    }
  });
  return (
    <>
      <h2 style={{ marginBottom: 10 }}>
        <b>Hi {me}!</b>
        <button
          type="button"
          onClick={() => setConnected((c) => !c)}
          style={{ marginLeft: 10 }}
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
      </h2>
      <div>
        {messages.map((message) => (
          <div className="message" key={message.id}>
            <b className="user">{message.sender}: &nbsp;</b>
            {message.content}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (inputRef.current) {
            socket.send(
              JSON.stringify({
                id: nanoid(),
                type: "chat-message",
                content: inputRef.current.value,
                sender: me
              } satisfies ChatMessage)
            );
            inputRef.current.value = "";
          }
        }}
      >
        <input type="text" ref={inputRef} />
      </form>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);

root.render(<App />);
