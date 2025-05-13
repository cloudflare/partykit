import { BehaviorSubject, switchMap, shareReplay } from "rxjs";
import type { Observable } from "rxjs";

export const broadcastSwitch = (options: {
  contentTrack$: Observable<MediaStreamTrack>;
  fallbackTrack$: Observable<MediaStreamTrack>;
  broadcasting?: boolean;
}) => {
  const isBroadcasting$ = new BehaviorSubject(options.broadcasting ?? false);
  const startBroadcasting = () => isBroadcasting$.next(true);
  const stopBroadcasting = () => isBroadcasting$.next(false);
  const toggleBroadcasting = () => isBroadcasting$.next(!isBroadcasting$.value);
  const broadcastTrack$ = isBroadcasting$.pipe(
    switchMap((enabled) =>
      enabled ? options.contentTrack$ : options.fallbackTrack$
    ),
    shareReplay({
      refCount: true,
      bufferSize: 1
    })
  );

  return {
    isBroadcasting$: isBroadcasting$.asObservable(),
    startBroadcasting,
    stopBroadcasting,
    toggleBroadcasting,
    /**
      This is the track to push. It will send content
      while broadcasting, and send the fallback track
      when not broadcasting.
    */
    broadcastTrack$,
    /**
      Track for local use only. Useful for showing
      "talking while muted" notifications.
    */
    localMonitorTrack$: options.contentTrack$
  };
};
