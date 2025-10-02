import { useAttachWebSocketEventHandlers } from "./use-handlers";
import {
  getOptionsThatShouldCauseRestartWhenChanged,
  useStableSocket
} from "./use-socket";
import WebSocket from "./ws";

import type { EventHandlerOptions } from "./use-handlers";
import type { Options, ProtocolsProvider, UrlProvider } from "./ws";

type UseWebSocketOptions = Options &
  EventHandlerOptions & {
    /**
     * Whether to enable WebSocket connection (if `false`, connection won't be established. Defaults to `true`)
     */
    enabled?: boolean;
  };

// A React hook that wraps PartySocket
export default function useWebSocket(
  url: UrlProvider,
  protocols?: ProtocolsProvider,
  options: UseWebSocketOptions = {}
) {
  const { enabled = true, ...restOptions } = options;

  const socket = useStableSocket({
    options: restOptions,
    createSocket: (options) => {
      if (!enabled) {
        return null;
      }

      return new WebSocket(url, protocols, options);
    },
    createSocketMemoKey: (options) =>
      JSON.stringify([
        // will reconnect if url or protocols are specified as a string.
        // if they are functions, the WebSocket will handle reconnection
        url,
        protocols,
        ...getOptionsThatShouldCauseRestartWhenChanged(options)
      ])
  });

  useAttachWebSocketEventHandlers(socket!, restOptions);

  return socket;
}
