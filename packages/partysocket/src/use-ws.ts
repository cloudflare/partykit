import { useAttachWebSocketEventHandlers } from "./use-handlers";
import {
  getOptionsThatShouldCauseRestartWhenChanged,
  useStableSocket
} from "./use-socket";
import WebSocket from "./ws";

import type { EventHandlerOptions } from "./use-handlers";
import type { SocketOptions } from "./use-socket";
import type { ProtocolsProvider, UrlProvider } from "./ws";

type UseWebSocketOptions = SocketOptions & EventHandlerOptions;

// A React hook that wraps PartySocket
export default function useWebSocket(
  url: UrlProvider,
  protocols?: ProtocolsProvider,
  options: UseWebSocketOptions = {}
) {
  const socket = useStableSocket({
    options,
    createSocket: (options) => new WebSocket(url, protocols, options),
    createSocketMemoKey: (options) =>
      JSON.stringify([
        // will reconnect if url or protocols are specified as a string.
        // if they are functions, the WebSocket will handle reconnection
        url,
        protocols,
        ...getOptionsThatShouldCauseRestartWhenChanged(options)
      ]),
    // For a plain WebSocket the URL *is* the destination (credentials
    // can't be distinguished from it), so buffered messages only carry
    // over when the socket was replaced for non-URL reasons (e.g. a
    // retry/debug option changed).
    createSocketDestinationKey: () => JSON.stringify([url, protocols])
  });

  useAttachWebSocketEventHandlers(socket, options);

  return socket;
}
