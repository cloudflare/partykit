import { routePartykitRequest, Server } from "partyserver";
import type { OutgoingMessage, Position } from "./types";
import type { Connection, ConnectionContext } from "partyserver";
import { env } from "cloudflare:workers";

// This is the state that we'll store on each connection
type ConnectionState = { position: Position };

export class Globe extends Server {
  // Let's use hibernation mode so we can scale to thousands of connections
  static options = { hibernate: true };

  onConnect(conn: Connection<ConnectionState>, ctx: ConnectionContext) {
    // Whenever a fresh connection is made, we'll
    // send the entire state to the new connection

    // First, let's extract the position from the Cloudflare headers
    const { request } = ctx;
    const lat = Number.parseFloat(request.cf!.latitude as string);
    const lng = Number.parseFloat(request.cf!.longitude as string);
    const id = conn.id;
    // And save this on the connection's state
    conn.setState({ position: { lat, lng, id } });

    // Now, let's send the entire state to the new connection
    for (const connection of this.getConnections<ConnectionState>()) {
      try {
        conn.send(
          JSON.stringify({
            type: "add-marker",
            position: connection.state!.position
          } satisfies OutgoingMessage)
        );

        // And let's send the new connection's position to all other connections
        if (connection.id !== conn.id) {
          connection.send(
            JSON.stringify({
              type: "add-marker",
              position: conn.state!.position
            } satisfies OutgoingMessage)
          );
        }
      } catch (_err) {
        this.onCloseOrError(conn);
      }
    }
  }

  // Whenever a connection closes (or errors),
  // we'll broadcast a message to all other connections
  // to remove the marker
  onCloseOrError(connection: Connection<unknown>) {
    this.broadcast(
      JSON.stringify({
        type: "remove-marker",
        id: connection.id
      } satisfies OutgoingMessage),
      [connection.id]
    );
  }

  onClose(connection: Connection<unknown>): void | Promise<void> {
    this.onCloseOrError(connection);
  }
  onError(
    connection: Connection<unknown>,
    _error: Error
  ): void | Promise<void> {
    this.onCloseOrError(connection);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
