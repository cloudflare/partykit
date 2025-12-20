import "./styles.css";

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
// biome-ignore lint/correctness/noUnusedVariables: it's fine
const pulledTrackSinkSubscription = audioSink.attach(pulledAudioTrack$);
// biome-ignore lint/correctness/noUnusedVariables: it's fine
const pulledScreenshareAudioTrackSinkSubscription = audioSink.attach(
  pulledScreenshareAudioTrack$
);

// Remove a pushed/pulled track by calling unsubscribe():
// videoTrackMetadata$.unsubscribe() stops pushing when all subscribers are gone
// pulledVideoTrack.unsubscribe() stops pulling when all subscribers are gone
// pulledTrackSinkSubscription.unsubscribe() stops pulling when all subscribers are gone
// and also removes the track from the audio attached audio sink
