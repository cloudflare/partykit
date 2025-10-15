import {
  devices$,
  resilientTrack$,
  type ResilientTrackOptions
} from "./resilientTrack$";
import { inaudibleAudioTrack$ } from "./inaudibleTrack$";
import { BehaviorSubject, map, tap } from "rxjs";
import type { Observable } from "rxjs";
import { blackCanvasTrack$ } from "./blackCanvasTrack$";
import { createDeviceManager } from "./deviceManager";
import { makeBroadcastTrack, type BroadcastTrack } from "./makeBroadcastTrack";
import type { SafePermissionState } from "./permission$";
import type { Prettify } from "../ts-utils";

interface GetDeviceOptions {
  kind: "audioinput" | "videoinput";
  fallbackTrack$: Observable<MediaStreamTrack>;
  retainIdleTrackDefaultValue: boolean;
  permissionName: "camera" | "microphone";
}

interface MediaOptions {
  /**
  Whether or not the track broadcast by default.

  Default: false
  */
  broadcasting?: boolean;
  /**
  Keeps the track source active regardless of whether there are any subscribers
  to either localMonitorTrack$ or broadcastTrack$.

  Defaults to true for mic and false for camera.
  */
  retainIdleTrack?: boolean;
  /**
  Initial transformations for the track.
  */
  transformations?: ((
    track: MediaStreamTrack
  ) => Observable<MediaStreamTrack>)[];
  /**
  Whether or not isSourceEnabled should be true initially. Defaults to true.
  */
  activateSource?: boolean;
}

export type MediaDeviceOptions = Prettify<
  MediaOptions & Omit<ResilientTrackOptions, "kind" | "devicePriority$">
>;

const getDevice = ({
  kind,
  fallbackTrack$,
  retainIdleTrackDefaultValue,
  permissionName
}: GetDeviceOptions) => {
  return ({
    activateSource = true,
    transformations,
    retainIdleTrack,
    onDeviceFailure,
    broadcasting,
    ...resilientTrackOptions
  }: MediaDeviceOptions = {}): MediaDevice => {
    const inputDevices$ = devices$.pipe(
      map((devices) => devices.filter((d) => d.kind === kind))
    );
    const activeDeviceId$ = new BehaviorSubject<string>("default");
    const { devicePriority$, deprioritizeDevice, ...deviceManagerPublicApi } =
      createDeviceManager({
        localStorageNamespace: `partytracks-${kind}`,
        devices$: inputDevices$,
        activeDeviceId$,
        permissionName
      });
    const sourceTrack$ = resilientTrack$({
      kind,
      devicePriority$,
      onDeviceFailure: (device) => {
        deprioritizeDevice(device);
        if (onDeviceFailure) onDeviceFailure(device);
      },
      onUnconstrainedDeviceSelection: (device) => {
        deviceManagerPublicApi.setPreferredDevice(device);
      },
      ...resilientTrackOptions
    }).pipe(
      tap((track) =>
        activeDeviceId$.next(track.getSettings().deviceId ?? "default")
      )
    );
    const isSourceEnabled$ = new BehaviorSubject(activateSource);
    const broadcastApi = makeBroadcastTrack({
      broadcasting,
      isSourceEnabled$,
      fallbackTrack$,
      contentTrack$: sourceTrack$,
      retainIdleTrack: retainIdleTrack ?? retainIdleTrackDefaultValue
    });

    return {
      ...broadcastApi,
      ...deviceManagerPublicApi
    };
  };
};

export interface MediaDevice extends BroadcastTrack {
  /**
   * The permission state of the device.
   */
  permissionState$: Observable<SafePermissionState>;
  /**
   A list of available devices. Use this to create your device
   selection options.
   ```
   */
  devices$: Observable<MediaDeviceInfo[]>;
  /**
   The active device, if one has been acquired, otherwise the preferred
   device, otherwise the default device. Use this to show your user which
   device is active in your device selection UI.
   */
  activeDevice$: Observable<MediaDeviceInfo>;
  /**
   Sets the user's preferred device. Once set, this is persisted to
   localStorage so that the preference can be remembered. When the
   preferred device is unavailable, all other availalble devices will
   be tried. If the preferred device *becomes* available, it will switch
   to the preferred device.
   */
  setPreferredDevice: (device: MediaDeviceInfo) => void;
}

export const getMic = getDevice({
  kind: "audioinput",
  fallbackTrack$: inaudibleAudioTrack$,
  retainIdleTrackDefaultValue: true,
  permissionName: "microphone"
});

export const getCamera = getDevice({
  kind: "videoinput",
  fallbackTrack$: blackCanvasTrack$,
  retainIdleTrackDefaultValue: false,
  permissionName: "camera"
});
