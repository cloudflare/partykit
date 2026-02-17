import { useEffect, useMemo, useRef, useState } from "react";

import type WebSocket from "./ws";
import type { Options } from "./ws";

export type SocketOptions = Options & {
  /** Whether the socket should be connected. Defaults to true. */
  enabled?: boolean;
};

/** When any of the option values are changed, we should reinitialize the socket */
export const getOptionsThatShouldCauseRestartWhenChanged = (
  options: SocketOptions
) => [
  // Note: enabled is handled separately to avoid creating a new socket on toggle
  options.startClosed,
  options.minUptime,
  options.maxRetries,
  options.connectionTimeout,
  options.maxEnqueuedMessages,
  options.maxReconnectionDelay,
  options.minReconnectionDelay,
  options.reconnectionDelayGrowFactor,
  options.debug
];

/**
 * Initializes a PartySocket (or WebSocket) and keeps it stable across renders,
 * but reconnects and updates the reference when any of the connection args change.
 */
export function useStableSocket<
  T extends WebSocket,
  TOpts extends SocketOptions
>({
  options,
  createSocket,
  createSocketMemoKey: createOptionsMemoKey
}: {
  options: TOpts;
  createSocket: (options: TOpts) => T;
  createSocketMemoKey: (options: TOpts) => string;
}) {
  // extract enabled with default value of true
  const { enabled = true } = options;

  // ensure we only reconnect when necessary
  const shouldReconnect = createOptionsMemoKey(options);
  const socketOptions = useMemo(() => {
    return options;
  }, [shouldReconnect]);

  // this is the socket we return
  const [socket, setSocket] = useState<T>(() =>
    // only connect on first mount
    createSocket({ ...socketOptions, startClosed: true })
  );

  // keep track of the socket we initialized
  const socketInitializedRef = useRef<T | null>(null);

  // allow changing the socket factory without reconnecting
  const createSocketRef = useRef(createSocket);
  createSocketRef.current = createSocket;

  // track the previous enabled state to detect changes
  const prevEnabledRef = useRef(enabled);

  // track the previous socketOptions reference to distinguish option changes
  // from HMR/StrictMode effect re-runs. useMemo returns the same reference
  // when the memo key hasn't changed, so referential equality tells us
  // whether the connection options actually changed.
  const prevSocketOptionsRef = useRef(socketOptions);

  // tracks whether options changed at any point while the socket was disabled.
  // The disabled path early-returns without creating a new socket, so we need
  // to remember that options drifted and create a new socket on re-enable.
  const optionsChangedWhileDisabledRef = useRef(false);

  // finally, initialize the socket
  useEffect(() => {
    const optionsChanged = prevSocketOptionsRef.current !== socketOptions;
    prevSocketOptionsRef.current = socketOptions;

    // if disabled, close the socket and don't proceed with connection logic
    if (!enabled) {
      socket.close();
      prevEnabledRef.current = enabled;
      if (optionsChanged) {
        optionsChangedWhileDisabledRef.current = true;
      }
      return () => {
        socket.close();
      };
    }

    // if enabled just changed from false to true...
    if (!prevEnabledRef.current && enabled) {
      prevEnabledRef.current = enabled;
      const needsNewSocket =
        optionsChanged || optionsChangedWhileDisabledRef.current;
      optionsChangedWhileDisabledRef.current = false;

      if (!needsNewSocket) {
        // options unchanged — reconnect existing socket
        socket.reconnect();
        return () => {
          socket.close();
        };
      }

      // options changed while disabled — create new socket with current config
      const newSocket = createSocketRef.current({
        ...socketOptions,
        startClosed: true
      });
      setSocket(newSocket);
      return () => {
        newSocket.close();
      };
    }

    prevEnabledRef.current = enabled;

    // we haven't yet restarted the socket
    if (socketInitializedRef.current === socket) {
      if (optionsChanged) {
        // connection options changed — create new socket with new config.
        // startClosed: true so it's inert until the else branch below
        // connects it on the next render. This ensures the socket is safe
        // to clean up if the component unmounts before that re-render.
        const newSocket = createSocketRef.current({
          ...socketOptions,
          startClosed: true
        });

        // update socket reference (this will cause the effect to run again)
        setSocket(newSocket);
        return () => {
          newSocket.close();
        };
      } else {
        // HMR or React Strict Mode effect re-run — reconnect the existing
        // socket instead of creating a new instance. This preserves the
        // socket identity (event listeners, _pk, etc.) across Hot Module
        // Replacement, preventing downstream code from losing its reference
        // to the live socket.
        if (socketOptions.startClosed !== true) {
          socket.reconnect();
        }
        return () => {
          socket.close();
        };
      }
    } else {
      if (!socketInitializedRef.current) {
        // first mount — respect the caller's startClosed preference
        if (socketOptions.startClosed !== true) {
          socket.reconnect();
        }
      } else if (socketInitializedRef.current !== socket) {
        // replacement socket from an options change — always connect
        socket.reconnect();
      }
      // track initialized socket so we know not to do it again
      socketInitializedRef.current = socket;
      // close the old socket the next time the socket changes or we unmount
      return () => {
        socket.close();
      };
    }
  }, [socket, socketOptions, enabled]);

  return socket;
}
