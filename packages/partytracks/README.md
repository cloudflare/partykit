# partytracks

Audio/video handling for realtime apps using Observables for WebRTC using [Cloudflare Realtime SFU](https://developers.cloudflare.com/realtime/introduction/).

## Installation

```shell
npm install partytracks
```

## Features

- **Observable-based API** - Better handling of WebRTC complexities
- **Automatic Recovery** - Handles disconnects, hardware changes, and network switches
- **Abstracted Complexity** - Application code doesn't need to handle WebRTC details

## Why Observables?

A promise-based API (push a track, get a promise of metadata) seems simpler but proved to be a leaky abstraction when things go wrong. Sometimes a webcam is unplugged, or your peer connection drops when switching networks. Observables allow all of the logic of replacing/repairing tracks and connections to be contained within the library, allowing your application code to not be concerned with the details of WebRTC.

## Usage

### Client code:

```js
// needed to smooth out cross browser behavior inconsistencies
import "webrtc-adapter";

import {
  PartyTracks,
  getMic,
  getCamera,
  getScreenshare,
  createAudioSink
} from "partytracks/client";
import invariant from "tiny-invariant";

const partyTracks = new PartyTracks();

// MIC SETUP
// =====================================================================

const audio = document.getElementById("audio");
const micBroadcastButton = document.getElementById("mic-broadcast-button");
const micEnabledButton = document.getElementById("mic-enabled-button");
const micSelect = document.getElementById("mic-select");
invariant(audio instanceof HTMLAudioElement);
invariant(micBroadcastButton instanceof HTMLButtonElement);
invariant(micEnabledButton instanceof HTMLButtonElement);
invariant(micSelect instanceof HTMLSelectElement);

const mic = getMic();
mic.error$.subscribe(console.error);

mic.permissionState$.subscribe((ps) => {
  console.log("Mic permissionState: ", ps);
});

micBroadcastButton.addEventListener("click", () => {
  mic.toggleBroadcasting();
});

mic.isBroadcasting$.subscribe((isBroadcasting) => {
  micBroadcastButton.innerText = isBroadcasting
    ? "mic is broadcasting"
    : "mic is not broadcasting";
});

micEnabledButton.addEventListener("click", () => {
  mic.toggleIsSourceEnabled();
});

mic.isSourceEnabled$.subscribe((isSourceEnabled) => {
  micEnabledButton.innerText = isSourceEnabled
    ? "mic is enabled"
    : "mic is disabled";
});

mic.devices$.subscribe((mics) => {
  micSelect.innerHTML = "";
  mics.forEach((mic) => {
    const option = document.createElement("option");
    option.value = mic.deviceId;
    option.innerText = mic.label;
    option.dataset.mediaDeviceInfo = JSON.stringify(mic);
    micSelect.appendChild(option);
  });
});

mic.activeDevice$.subscribe((d) => {
  micSelect.value = d?.deviceId ?? "default";
});

micSelect.onchange = (e) => {
  invariant(e.target instanceof HTMLSelectElement);
  const option = e.target.querySelector(`option[value="${e.target.value}"]`);
  invariant(option instanceof HTMLOptionElement);
  invariant(option.dataset.mediaDeviceInfo);
  mic.setPreferredDevice(JSON.parse(option.dataset.mediaDeviceInfo));
};

// Use localMonitorTrack$ to set up "talking while muted" notifications:
// mic.localMonitorTrack$.subscribe((track) => {
//   /* ... */
// });

const audioTrackMetadata$ = partyTracks.push(mic.broadcastTrack$);

// Send track metadata to other users. Something like:
// audioTrackMetadata$.subscribe((metadata) => {
//   websocket.send(
//     JSON.stringify({
//       type: "UserMicTrackUpdate",
//       userId: "user a",
//       metadata
//     })
//   );
// });

// CAMERA SETUP
// =====================================================================

const cameraBroadcastButton = document.getElementById(
  "camera-broadcast-button"
);
const cameraEnabledButton = document.getElementById("camera-enabled-button");
const cameraSelect = document.getElementById("camera-select");
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
invariant(localVideo instanceof HTMLVideoElement);
invariant(remoteVideo instanceof HTMLVideoElement);
invariant(cameraBroadcastButton instanceof HTMLButtonElement);
invariant(cameraEnabledButton instanceof HTMLButtonElement);
invariant(cameraSelect instanceof HTMLSelectElement);

const camera = getCamera();

cameraBroadcastButton.addEventListener("click", () => {
  camera.toggleBroadcasting();
});

camera.isBroadcasting$.subscribe((isBroadcasting) => {
  cameraBroadcastButton.innerText = isBroadcasting
    ? "camera is broadcasting"
    : "camera is not broadcasting";
});

cameraEnabledButton.addEventListener("click", () => {
  camera.toggleIsSourceEnabled();
});

camera.isSourceEnabled$.subscribe((enabled) => {
  cameraEnabledButton.innerText = enabled
    ? "camera is enabled"
    : "camera is disabled";
});

camera.devices$.subscribe((cameras) => {
  cameraSelect.innerHTML = "";
  cameras.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.deviceId;
    option.innerText = c.label;
    option.dataset.mediaDeviceInfo = JSON.stringify(c);
    cameraSelect.appendChild(option);
  });
});

camera.activeDevice$.subscribe((d) => {
  cameraSelect.value = d?.deviceId ?? "default";
});

cameraSelect.onchange = (e) => {
  invariant(e.target instanceof HTMLSelectElement);
  const option = e.target.querySelector(`option[value="${e.target.value}"]`);
  invariant(option instanceof HTMLOptionElement);
  invariant(option.dataset.mediaDeviceInfo);
  camera.setPreferredDevice(JSON.parse(option.dataset.mediaDeviceInfo));
};

const videoTrackMetadata$ = partyTracks.push(camera.broadcastTrack$);

// Screenshare Setup
// =====================================================================

const localScreenshareVideo = document.getElementById(
  "local-screenshare-video"
);
const remoteScreenshareVideo = document.getElementById(
  "remote-screenshare-video"
);
const screenshareBroadcastButton = document.getElementById(
  "screenshare-broadcast-button"
);
const screenshareSourceEnabledButton = document.getElementById(
  "screenshare-source-enabled-button"
);

invariant(localScreenshareVideo instanceof HTMLVideoElement);
invariant(remoteScreenshareVideo instanceof HTMLVideoElement);
invariant(screenshareBroadcastButton instanceof HTMLButtonElement);
invariant(screenshareSourceEnabledButton instanceof HTMLButtonElement);

const screenshare = getScreenshare();

screenshare.isBroadcasting$.subscribe((isBroadcasting) => {
  screenshareBroadcastButton.innerText = `screenshare is${isBroadcasting ? " " : " not "}broadcasting`;
});

screenshareBroadcastButton.onclick = () => {
  screenshare.toggleBroadcasting();
};

screenshare.isSourceEnabled$.subscribe((isSourceEnabled) => {
  screenshareSourceEnabledButton.innerText = `screenshare souce is${isSourceEnabled ? " " : " not "}enabled`;
});

screenshareSourceEnabledButton.onclick = () => {
  screenshare.toggleIsSourceEnabled();
};

const screenshareVideoTrackMetadata$ = partyTracks.push(
  screenshare.video.broadcastTrack$
);
const screenshareAudioTrackMetadata$ = partyTracks.push(
  screenshare.audio.broadcastTrack$
);

// Pulling tracks
// =====================================================================
// On another machine...
//
// The easiest way to create an observable is by wrapping in of()
// import { of } from "rxjs"
// const audioTrackMetadata$ = of({
//   "trackName": "...",
//   "sessionId": "...",
//   "location": "remote"
// })

audioTrackMetadata$.subscribe(console.log);

const pulledAudioTrack$ = partyTracks.pull(audioTrackMetadata$);
const pulledVideoTrack$ = partyTracks.pull(videoTrackMetadata$);
const pulledScreenshareVideoTrack$ = partyTracks.pull(
  screenshareVideoTrackMetadata$
);
const pulledScreenshareAudioTrack$ = partyTracks.pull(
  screenshareAudioTrackMetadata$
);

camera.broadcastTrack$.subscribe((track) => {
  const localMediaStream = new MediaStream();
  localMediaStream.addTrack(track);
  localVideo.srcObject = localMediaStream;
});

pulledVideoTrack$.subscribe((track) => {
  const remoteMediaStream = new MediaStream();
  remoteMediaStream.addTrack(track);
  remoteVideo.srcObject = remoteMediaStream;
});

pulledScreenshareVideoTrack$.subscribe((track) => {
  const remoteScreenshareVideoStream = new MediaStream();
  remoteScreenshareVideoStream.addTrack(track);
  remoteScreenshareVideo.srcObject = remoteScreenshareVideoStream;
});

const audioSink = createAudioSink({ audioElement: audio });
const pulledTrackSinkSubscription = audioSink.attach(pulledAudioTrack$);
const pulledScreenshareAudioTrackSinkSubscription = audioSink.attach(
  pulledScreenshareAudioTrack$
);

// Remove a pushed/pulled track by calling unsubscribe():
// videoTrackMetadata$.unsubscribe() stops pushing when all subscribers are gone
// pulledVideoTrack.unsubscribe() stops pulling when all subscribers are gone
// pulledTrackSinkSubscription.unsubscribe() stops pulling when all subscribers are gone
// and also removes the track from the audio attached audio sink
```

### Server code:

In your server, you need to have a path that proxies all requests over to
the Cloudflare Realtime SFU API and provides your app id and token. Create your SFU App in the [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/realtime/sfu/create). In a worker,
it will look something like this:

```ts
import { Hono } from "hono";
import { routePartyTracksRequest } from "partytracks/server";

type Bindings = {
  // SFU is required
  SFU_APP_ID: string;
  SFU_APP_TOKEN: string;
  // TURN is optional, but highly recommended. See the next section!
  TURN_SERVER_APP_ID?: string;
  TURN_SERVER_APP_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.all("/partytracks/*", (c) =>
  routePartyTracksRequest({
    appId: c.env.SFU_APP_ID,
    token: c.env.SFU_APP_TOKEN,
    turnServerAppId: c.env.TURN_SERVER_APP_ID,
    turnServerAppToken: c.env.TURN_SERVER_APP_TOKEN
    request: c.req.raw,
  })
);

export default app;
```

### TURN Server Configuration

For enhanced NAT traversal capabilities, you can configure a TURN server with your partytracks setup. TURN (Traversal Using Relays around NAT) helps establish connections when direct peer-to-peer connections aren't possible due to restrictive NAT or firewall configurations.

To enable TURN server support:

1. **Create TURN credentials** at the [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/realtime/turn/create)
2. **Add the optional TURN configuration** to your `routePartyTracksRequest` call:

```ts
routePartyTracksRequest({
  appId: c.env.CALLS_APP_ID,
  token: c.env.CALLS_APP_TOKEN,
  request: c.req.raw,
  // TURN server configuration
  turnServerAppId: c.env.TURN_SERVER_APP_ID,
  turnServerAppToken: c.env.TURN_SERVER_APP_TOKEN,
  turnServerCredentialTTL: 86400 // Optional: credential lifetime in seconds (default: 24 hours)
});
```

When TURN server credentials are provided, the `/partytracks/generate-ice-servers` endpoint will return TURN server configurations for improved connectivity. Without TURN credentials, only STUN servers are provided for basic NAT traversal.

Learn more about TURN and when you might need it in the [Cloudflare TURN documentation](https://developers.cloudflare.com/realtime/turn/what-is-turn/).

### React utils

If you're building using React, there are a few utilities you may find helpful.

By convention, Observables have a $ suffix to indicate that they're an Observable.

```ts
import {
  useObservableAsValue,
  useObservable,
  useValueAsObservable
} from "partytracks/react";

function SomeComponent({ value }) {
  // creates a stable observable that will
  // emit when a new value is passed in
  const value$ = useValueAsObservable(value);
  // subscribes and gives you the latest value
  // second arg is the default value if nothing
  // has been emitted yet
  const latestValue = useObservableAsValue(value$, "default value");
  // Allows for hooking into new values, errors, and completion.
  useObservable(value$, {
    next: (v) => console.log(v),
    error: (e) => console.error(e),
    complete: () => console.log("complete!")
  });
}
```

## API Reference

### PartyTracks

The `PartyTracks` class handles all WebRTC negotiations through `push` and `pull` methods.

```ts
class PartyTracks {
  constructor(config?: PartyTracksConfig);
  /**
     Pushes a track to the Realtime SFU. If the sourceTrack$ emits a new
     track after the initial one, the new track will replace the old one
     on the transceiver. Same with sendEncodings$, the initial values will
     be applied, and subsequent emissions will be applied.
  
     Additionally, if the peerConnection is disrupted and session$ emits
     a new peerConnection/sessionId combo, the track will be re-pushed,
     and will emit new TrackMetadata
     */
  push(
    sourceTrack$: Observable<MediaStreamTrack>,
    options?: {
      sendEncodings$?: Observable<RTCRtpEncodingParameters[]>;
    }
  ): Observable<TrackMetadata>;

  /**
     Pulls a track from the Realtime SFU. If trackData$ emits new TrackMetadata
     or if the peerConnection is disrupted and session$ emits a new
     peerConnection/sessionId combo, the track will be re-pulled, and will emit
     a new MediaStreamTrack.
    */
  pull(
    trackData$: Observable<TrackMetadata>,
    options?: {
      simulcast?: {
        preferredRid$: Observable<string | undefined>;
      };
    }
  ): Observable<MediaStreamTrack>;

  /**
     An observable of the active peerConnection. If the active peerConnection
     is disrupted, a new one will be created and emitted
     */
  peerConnection$: Observable<RTCPeerConnection>;

  /**
     An observable of the active peerConnection and its associated sessionId.
     This flows from the peerConnection$, and will emit with the new peerConnection
     and a new sessionId when the peerConnection changes.
     */
  session$: Observable<{
    peerConnection: RTCPeerConnection;
    sessionId: string;
  }>;

  /**
     Emits transceivers each time they are added  to the peerConnection.
     */
  transceiver$: Observable<RTCRtpTransceiver>;
  /**
     An observable of the peerConnection's connectionState.
     */
  peerConnectionState$: Observable<RTCPeerConnectionState>;
  /**
     Useful for logging/debugging purposes.
     */
  history: History<ApiHistoryEntry>;
}
```

### PartyTracksConfig

The optional configuration object for `PartyTracks`:

```ts
interface PartyTracksConfig {
  /**
   * Additional query parameters to append to all API requests.
   * For example, "userId=123&roomId=456"
   */
  apiExtraParams?: string;
  /**
   * Custom ICE servers to use for WebRTC connections.
   * If not provided, ICE servers will be fetched from the `/partytracks/generate-ice-servers` endpoint.
   */
  iceServers?: RTCIceServer[];
  /**
   * The part of the pathname in the original request URL that should be replaced.
   * For example, if your proxy path is /api/partytracks/*, the value should be "/api/partytracks"
   *
   * You can also provide a full URL to enable cross-domain connections:
   * For example, "https://api.example.com/partytracks" to connect to a different host.
   */
  prefix?: string;
  /**
   * Maximum number of API history entries to retain for debugging purposes.
   * Defaults to 100.
   */
  maxApiHistory?: number;
  /**
   * Custom headers to include in all API requests made by PartyTracks.
   * These headers will be appended to any existing headers for each request.
   */
  headers?: Headers;
}
```

#### Configuration Examples

```js
// Default configuration (same domain)
const partyTracks = new PartyTracks();

// Custom path prefix for same-domain deployment
const partyTracks = new PartyTracks({
  prefix: "/api/partytracks"
});

// Cross-domain configuration
const partyTracks = new PartyTracks({
  prefix: "https://api.example.com/partytracks"
});

// Custom ICE servers and additional parameters
const partyTracks = new PartyTracks({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  apiExtraParams: "userId=123&roomId=456",
  maxApiHistory: 50
});

// With custom headers (e.g., for authentication)
const partyTracks = new PartyTracks({
  prefix: "https://api.example.com/partytracks",
  headers: new Headers({
    Authorization: "Bearer your-token-here",
    "X-Custom-Header": "value"
  })
});
```

### `getMic` and `getCamera`

These both accept `MediaDeviceOptions`:

```ts
interface MediaDeviceOptions {
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
```

And they both return a `MediaDevice`:

```ts
interface MediaDevice {
  /**
   * The permission state of the device.
   */
  permissionState$: Observable<SafePermissionState>;
  /**
   A list of available devices. Use this to create your device
   selection options.
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
  /**
   Applies a transformation to the content track. Be sure to store
   a reference to the filter you've added if you want to remove it
   with removeTransform() and add cleanup logic when creating your
   Observable:
 
   track => new Observable<MediaStreamTrack>(subscriber => {
     // do your setup then emit...
     subscriber.next(transformedTrack)
     subscriber.add(() => {
       // add cleanup logic here
     })
   })
   */
  addTransform: (
    transform: (track: MediaStreamTrack) => Observable<MediaStreamTrack>
  ) => void;
  /**
   Removes a previously applied transformation.
   */
  removeTransform: (
    transform: (track: MediaStreamTrack) => Observable<MediaStreamTrack>
  ) => void;
  /**
   Whether or not the source is currently broadcasting content.
   */
  isBroadcasting$: Observable<boolean>;
  /**
   Starts sending content from the source. Will call enableSource()
   if it's not already enabled.
   */
  startBroadcasting: () => void;
  /**
   Stops sending content from the source.
   */
  stopBroadcasting: () => void;
  /**
   Toggles sending content from the source.
   */
  toggleBroadcasting: () => void;
  /**
   A monitor track that is "always on" for this source. You usually
   only want this for your mic so that you can show "talking while muted"
   notifications. Users have a STRONG sensitivity to the webcam light
   being on even when the content might not be broadcasting, so it
   is not recommended to use this for cameras unless your users have
   a solid understanding of whether or not the content is being sent.
   */
  localMonitorTrack$: Observable<MediaStreamTrack>;
  /**
   The track that is to be pushed with PartyTracks.push(). This track
   will switch from the content track to a fallback (empty) track when
   broadcasting is stopped.
   */
  broadcastTrack$: Observable<MediaStreamTrack>;
  /**
   Whether or not the source is enabled. If disabled, the content source
   will not be requested, regardless of whether isBroadcasting is true
   or not. This can flip to false if an error is encountering acquiring
   content source, or if the source completes (e.g. screenshare ended).
   Default value is `true`.
   */
  isSourceEnabled$: Observable<boolean>;
  /**
   Sets isSourceEnabled to true.
   */
  enableSource: () => void;
  /**
   Sets isSourceEnabled to false. Will also call stopBroadcasting() if
   it is broadcasting.
   */
  disableSource: () => void;
  /**
   Toggles isSourceEnabled.
   */
  toggleIsSourceEnabled: () => void;
  /**
   Emits errors encountered when acquiring source. Most likely to either be
   DevicesExhaustedError (a partytracks custom error) or NotAllowedError.
   */
  error$: Observable<Error>;
}
```

### getScreenshare

`getScreenshare` accepts `ScreenshareOptions`:

```ts
interface ScreenshareOptions {
  /**
  Whether isSourceEnabled should be initially true.
  Defaults to false.
  */
  activateSource?: boolean;
  /**
  Whether or not tracks should be retained even if there are no
  active subscribers to the content source. (For example, if isBroadcasting$
  is false, and localMonitorTrack$ has no subscribers)
  */
  retainIdleTracks?: boolean;
  audio?:
    | boolean
    | {
        constraints?: MediaTrackConstraints;
        options?: {
          /**
          Whether or not the track should be broadcasting to start
          */
          broadcasting?: boolean;
        };
      };
  video?:
    | boolean
    | {
        constraints?: MediaTrackConstraints;
        options?: {
          /**
          Whether or not the track should be broadcasting to start
          */
          broadcasting?: boolean;
        };
      };
}
```

It returns a `Screenshare` interface which is quite similar to the `MediaDevice` API above,
except that the tracks API's are split between `audio` and `video`, and the `isSourceEnabled`
related API's are on the top level since the source is shared between both tracks.

```ts
interface Screenshare {
  audio: {
    /**
    Applies a transformation to the content track. Be sure to store
    a reference to the filter you've added if you want to remove it
    with removeTransform() and add cleanup logic when creating your
    Observable:
  
    track => new Observable<MediaStreamTrack>(subscriber => {
      // do your setup then emit...
      subscriber.next(transformedTrack)
      subscriber.add(() => {
        // add cleanup logic here
      })
    })
    */
    addTransform: (
      transform: (track: MediaStreamTrack) => Observable<MediaStreamTrack>
    ) => void;
    /**
    Removes a previously applied transformation.
    */
    removeTransform: (
      transform: (track: MediaStreamTrack) => Observable<MediaStreamTrack>
    ) => void;
    /**
    Whether or not the source is currently broadcasting content.
    */
    isBroadcasting$: Observable<boolean>;
    /**
    Starts sending content from the source. Will call enableSource()
    if it's not already enabled.
    */
    startBroadcasting: () => void;
    /**
    Stops sending content from the source.
    */
    stopBroadcasting: () => void;
    /**
    Toggles sending content from the source.
    */
    toggleBroadcasting: () => void;
    /**
    A monitor track that is "always on" for this source. You usually
    only want this for your mic so that you can show "talking while muted"
    notifications. Users have a STRONG sensitivity to the webcam light
    being on even when the content might not be broadcasting, so it
    is not recommended to use this for cameras unless your users have
    a solid understanding of whether or not the content is being sent.
    */
    localMonitorTrack$: Observable<MediaStreamTrack>;
    /**
    The track that is to be pushed with PartyTracks.push(). This track
    will switch from the content track to a fallback (empty) track when
    broadcasting is stopped.
    */
    broadcastTrack$: Observable<MediaStreamTrack>;
    /**
    Emits errors encountered when acquiring source. Most likely to either be
    DevicesExhaustedError (a partytracks custom error) or NotAllowedError.
    */
    error$: Observable<Error>;
  };
  video: {
    /**
    Applies a transformation to the content track. Be sure to store
    a reference to the filter you've added if you want to remove it
    with removeTransform() and add cleanup logic when creating your
    Observable:
  
    track => new Observable<MediaStreamTrack>(subscriber => {
      // do your setup then emit...
      subscriber.next(transformedTrack)
      subscriber.add(() => {
        // add cleanup logic here
      })
    })
    */
    addTransform: (
      transform: (track: MediaStreamTrack) => Observable<MediaStreamTrack>
    ) => void;
    /**
    Removes a previously applied transformation.
    */
    removeTransform: (
      transform: (track: MediaStreamTrack) => Observable<MediaStreamTrack>
    ) => void;
    /**
    Whether or not the source is currently broadcasting content.
    */
    isBroadcasting$: Observable<boolean>;
    /**
    Starts sending content from the source. Will call enableSource()
    if it's not already enabled.
    */
    startBroadcasting: () => void;
    /**
    Stops sending content from the source.
    */
    stopBroadcasting: () => void;
    /**
    Toggles sending content from the source.
    */
    toggleBroadcasting: () => void;
    /**
    A monitor track that is "always on" for this source. You usually
    only want this for your mic so that you can show "talking while muted"
    notifications. Users have a STRONG sensitivity to the webcam light
    being on even when the content might not be broadcasting, so it
    is not recommended to use this for cameras unless your users have
    a solid understanding of whether or not the content is being sent.
    */
    localMonitorTrack$: Observable<MediaStreamTrack>;
    /**
    The track that is to be pushed with PartyTracks.push(). This track
    will switch from the content track to a fallback (empty) track when
    broadcasting is stopped.
    */
    broadcastTrack$: Observable<MediaStreamTrack>;
    /**
    Emits errors encountered when acquiring source. Most likely to either be
    DevicesExhaustedError (a partytracks custom error) or NotAllowedError.
    */
    error$: Observable<Error>;
  };

  /**
   Whether or not the source is enabled. If disabled, the content source
   will not be requested, regardless of whether isBroadcasting is true
   or not. This can flip to false if an error is encountering acquiring
   content source, or if the source completes (e.g. screenshare ended).
   Default value is `true`.
   */
  isSourceEnabled$: Observable<boolean>;
  /**
   Sets isSourceEnabled to true.
   */
  enableSource: () => void;
  /**
   Sets isSourceEnabled to false. Will also call stopBroadcasting() if
   it is broadcasting.
   */
  disableSource: () => void;
  /**
   Toggles isSourceEnabled.
   */
  toggleIsSourceEnabled: () => void;
  /**
   Starts broadcasting both video and audio tracks.
   */
  startBroadcasting: () => void;
  /**
   Stops broadcasting both video and audio tracks.
   */
  stopBroadcasting: () => void;
  /**
   Toggles broadcasting both video and audio tracks. If either is
   broadcasting, it will call stopBroadcasting on both.
   */
  toggleBroadcasting: () => void;
  /**
   True if either audio or video is broadcasting. For granular state
   check the individual tracks:
   screenshare.audio.isBroadcasting$
   screenshare.video.isBroadcasting$
   */
  isBroadcasting$: Observable<boolean>;
}
```

### createAudioSink

It's recommended to use `createAudioSink` for your pulled audio tracks
to play the audio. This utility handles certain edge-cases to ensure that
audio playback works as expected.

```ts
import { createAudioSink, PartyTracks } from "partytracks";
import { of } from "rxjs";

const audioElement = document.querySelector("audio");
const audioSink = createAudioSink({ audioElement });
const partyTracks = new PartyTracks();
const audioTrackMetadata$ = of({
  // track metadata...
});
const pulledAudioTrack$ = partyTracks.pull(audioTrackMetadata$);
// No need to "detatch", unsubscribing from pulledTrackSinkSubscription
// will do the appropriate cleanup.
const pulledTrackSinkSubscription = audioSink.attach(pulledAudioTrack$);
```
