import { PartySocket } from "partysocket";

const id = crypto.randomUUID();

const socket = new PartySocket({
  host: "localhost:8787",
  party: "chat",
  room: "test"
});

socket.addEventListener("message", (event) => {
  console.log("message", event.data);
});

setInterval(() => {
  socket.send(`hello from ${id}`);
}, 1000);
