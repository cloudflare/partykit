import {
  concat,
  defer,
  distinctUntilChanged,
  from,
  fromEvent,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  switchMap,
  throwError,
  share,
  ReplaySubject
} from "rxjs";

import { logger } from "./logging";
import { trackIsHealthy } from "./trackIsHealthy";

import type { Subscriber } from "rxjs";

export class DevicesExhaustedError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Using defer here so that this doesn't blow up if it ends
// up in a server js bundle since navigator is browser api
export const devices$ = defer(() =>
  merge(
    from(navigator.mediaDevices.enumerateDevices()),
    fromEvent(navigator.mediaDevices, "devicechange").pipe(
      switchMap(() => navigator.mediaDevices.enumerateDevices())
    ),
    navigator.permissions?.query
      ? from(navigator.permissions.query({ name: "camera" })).pipe(
          switchMap((permissionStatus) =>
            fromEvent(permissionStatus, "change")
          ),
          switchMap(() => navigator.mediaDevices.enumerateDevices())
        )
      : of([]),
    navigator.permissions?.query
      ? from(navigator.permissions.query({ name: "microphone" })).pipe(
          switchMap((permissionStatus) =>
            fromEvent(permissionStatus, "change")
          ),
          switchMap(() => navigator.mediaDevices.enumerateDevices())
        )
      : of([])
  ).pipe(
    distinctUntilChanged(
      (prev, current) => JSON.stringify(prev) === JSON.stringify(current)
    ),
    shareReplay({
      refCount: true,
      bufferSize: 1
    })
  )
);

export interface ResilientTrackOptions {
  kind: "audioinput" | "videoinput";
  /**
  An Observable of devices in prioritized order. Each device will be tried
  until a healthy track is acquired. Only provide this if you don't want
  to use the library's default device management API.
  */
  devicePriority$?: Observable<MediaDeviceInfo[]>;
  /**
  Constraints for the device. This is passed into
  navigator.mediaDevices.getUserMedia(). deviceId and groupId are excluded
  because _all_ devices will be tried eventually if the preferred device
  is not available.
  */
  constraints?: Omit<MediaTrackConstraints, "deviceId" | "groupId">;
  /**
  A callback to be notified when an individual device fails to produce
  a healthy track. Useful for potentially surfacing messages to the user, or
  for optionally deprioritizing the device in the future.
  */
  onDeviceFailure?: (device: MediaDeviceInfo) => void;
}

export const resilientTrack$ = ({
  kind,
  constraints = {},
  devicePriority$ = devices$,
  onDeviceFailure = () => {}
}: ResilientTrackOptions): Observable<MediaStreamTrack> =>
  devicePriority$
    .pipe(
      map((list) => list.filter((d) => d.kind === kind)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
    )
    .pipe(
      // switchMap on the outside here will cause the previous queue to stop
      // when the inputs change
      switchMap((deviceList) =>
        // concat here is going to make these be subscribed to sequentially
        concat(
          ...deviceList.map(
            (device) =>
              new Observable<MediaStreamTrack>((subscriber) => {
                acquireTrack(subscriber, device, constraints, onDeviceFailure);
              })
          ),
          throwError(() => new DevicesExhaustedError())
        )
      ),
      // We basically want shareReplay({refCount: true, bufferSize:1})
      // but that doesn't allow for resetting on complete/error, so we
      // do this instead
      share({
        resetOnComplete: true,
        resetOnError: true,
        connector: () => new ReplaySubject(1)
      })
    );

function acquireTrack(
  subscriber: Subscriber<MediaStreamTrack>,
  device: MediaDeviceInfo,
  constraints: MediaTrackConstraints,
  onDeviceFailure: (device: MediaDeviceInfo) => void
) {
  const { deviceId, groupId, label } = device;
  logger.log(`🙏🏻 Requesting ${label}`);
  navigator.mediaDevices
    .getUserMedia(
      device.kind === "videoinput"
        ? { video: { ...constraints, deviceId, groupId } }
        : { audio: { ...constraints, deviceId, groupId } }
    )
    .then(async (mediaStream) => {
      const track =
        device.kind === "videoinput"
          ? mediaStream.getVideoTracks()[0]
          : mediaStream.getAudioTracks()[0];
      if (await trackIsHealthy(track)) {
        const cleanup = () => {
          logger.log("🛑 Stopping track");
          track.stop();
          document.removeEventListener("visibilitychange", onVisibleHandler);
        };
        const onVisibleHandler = async () => {
          if (document.visibilityState !== "visible") return;
          logger.log("Tab is foregrounded, checking health...");
          if (await trackIsHealthy(track)) return;
          logger.log("Reacquiring track");
          cleanup();
          acquireTrack(subscriber, device, constraints, onDeviceFailure);
        };
        document.addEventListener("visibilitychange", onVisibleHandler);
        subscriber.add(cleanup);
        subscriber.next(track);
      } else {
        logger.log("☠️ track is not healthy, stopping");
        onDeviceFailure(device);
        track.stop();
        subscriber.complete();
      }
      track.addEventListener("ended", () => {
        logger.log("🔌 Track ended abrubptly");
        subscriber.complete();
      });
    })
    .catch((err) => {
      if (
        err instanceof Error &&
        // device not found, move on
        (err.name === "NotFoundError" ||
          // this device is in use already, probably on Windows
          // so we can just call this one complete and move on
          err.name === "NotReadableError")
      ) {
        subscriber.complete();
      } else {
        subscriber.error(err);
      }
    });
}
