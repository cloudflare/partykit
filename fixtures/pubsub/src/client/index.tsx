import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { nanoid } from "nanoid";
import { PartySocket } from "partysocket";
import { usePartySocket } from "partysocket/react";

function App() {
  const [messages, setMessages] = useState<
    {
      topic: string;
      data: string;
    }[]
  >([]);

  const [id] = useState<string>(() => nanoid(8));

  const socket = usePartySocket({
    party: "pub-sub",
    room: "default",
    id,
    onMessage: (evt) => {
      setMessages((messages) => [
        ...messages,
        JSON.parse(evt.data as string) as {
          topic: string;
          data: string;
        }
      ]);
    }
  });

  useEffect(() => {
    setInterval(() => {
      socket.send(
        JSON.stringify({
          topic: "example",
          data: `${socket.id} says hello!`
        })
      );

      PartySocket.fetch(
        {
          host: window.location.host,
          party: "pub-sub", // the name of the party, use the binding's lowercase form
          room: "default" // the name of the room/channel
        },
        {
          method: "POST",
          body: JSON.stringify({
            topic: "topic-abc",
            data: "hello from a post!"
          })
        }
      ).catch(console.error);
    }, 2000);
  }, [socket]);

  return (
    <div>
      Messages:
      {messages.map((message, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: it's fine
        <div key={i}>{JSON.stringify(message)}</div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
