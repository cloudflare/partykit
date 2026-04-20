import "./styles.css";

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import createGlobe from "cobe";
import usePartySocket from "partysocket/react";

// The type of messages we'll be receiving from the server
import type { OutgoingMessage } from "./types";

function App() {
  // A reference to the canvas element where we'll render the globe
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The number of markers we're currently displaying
  const [counter, setCounter] = useState(0);
  // A map of marker IDs to their positions.
  // We use a ref because the globe's requestAnimationFrame loop reads
  // this on every frame, and we don't want to re-render the component
  // every time the set changes.
  const positions = useRef<
    Map<string, { location: [number, number]; size: number }>
  >(new Map());
  // Connect to the PartyServer server
  const socket = usePartySocket({
    room: "default",
    party: "globe",
    onMessage(evt) {
      const message = JSON.parse(evt.data as string) as OutgoingMessage;
      if (message.type === "add-marker") {
        // Add the marker to our map
        positions.current.set(message.position.id, {
          location: [message.position.lat, message.position.lng],
          size: message.position.id === socket.id ? 0.1 : 0.05
        });
        // Update the counter
        setCounter((c) => c + 1);
      } else if (message.type === "remove-marker") {
        // Remove the marker from our map
        positions.current.delete(message.id);
        // Update the counter
        setCounter((c) => c - 1);
      }
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The angle of rotation of the globe; updated every frame to make it spin
    let phi = 0;
    let raf = 0;

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: 400 * 2,
      height: 400 * 2,
      phi: 0,
      theta: 0,
      dark: 1,
      diffuse: 0.8,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.3],
      markerColor: [0.8, 0.1, 0.1],
      glowColor: [0.2, 0.2, 0.2],
      markers: [],
      opacity: 0.7
    });

    // cobe v2 removed the `onRender` callback; drive updates from our own
    // requestAnimationFrame loop instead.
    const animate = () => {
      globe.update({
        phi,
        markers: [...positions.current.values()]
      });
      phi += 0.01;
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
    };
  }, []);

  return (
    <div className="App">
      <h1>Where's everyone at?</h1>
      {counter !== 0 ? (
        <p>
          <b>{counter}</b> {counter === 1 ? "person" : "people"} connected.
        </p>
      ) : (
        <p>&nbsp;</p>
      )}

      {/* The canvas where we'll render the globe */}
      <canvas
        ref={canvasRef}
        style={{ width: 400, height: 400, maxWidth: "100%", aspectRatio: 1 }}
      />

      {/* Let's give some credit */}
      <p>
        Powered by <a href="https://cobe.vercel.app/">🌏 Cobe</a>,{" "}
        <a href="https://www.npmjs.com/package/phenomenon">Phenomenon</a> and{" "}
        <a href="https://npmjs.com/package/partyserver/">🎈 PartyServer</a>
      </p>
      <p>
        Code:{" "}
        <a href="https://github.com/cloudflare/partykit/tree/main/fixtures/globe">
          https://github.com/cloudflare/partykit/tree/main/fixtures/globe
        </a>
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
