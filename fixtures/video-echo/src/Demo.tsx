import { useMemo, useRef, useState } from "react";
import { devices$, PartyTracks, resilientTrack$ } from "partytracks/client";
import { useObservableAsValue, useObservable } from "partytracks/react";
import { map } from "rxjs";

import type { ComponentProps, ComponentRef } from "react";
import type { Observable } from "rxjs";

export function Demo() {
  const [localFeedOn, setLocalFeedOn] = useState(true);
  const [remoteFeedOn, setRemoteFeedOn] = useState(false);
  const [preferredWebcamDeviceId, setPreferredWebcamDeviceId] = useState("");
  const devices = useObservableAsValue(devices$);
  const client = useMemo(() => new PartyTracks(), []);

  const peerConnectionState = useObservableAsValue(
    client.peerConnectionState$,
    "new"
  );

  const sessionId = useObservableAsValue(
    useMemo(
      () => client.session$.pipe(map((x) => x.sessionId)),
      [client.session$]
    ),
    null
  );

  const localVideoTrack$ = useWebcamTrack$(localFeedOn);
  const localMicTrack$ = useMicTrack$(localFeedOn);
  const remoteVideoTrack$ = useMemo(() => {
    if (!localVideoTrack$ || !remoteFeedOn) return null;
    return client.pull(client.push(localVideoTrack$));
  }, [client, remoteFeedOn, localVideoTrack$]);
  const remoteAudioTrack$ = useMemo(() => {
    if (!localMicTrack$ || !remoteFeedOn) return null;
    return client.pull(client.push(localMicTrack$));
  }, [client, remoteFeedOn, localMicTrack$]);

  return (
    <div className="p-2 flex flex-col gap-3">
      <div className="flex gap-2">
        <Button onClick={() => setLocalFeedOn(!localFeedOn)}>
          Turn Local {localFeedOn ? "Off" : "On"}
        </Button>
        <Button onClick={() => setRemoteFeedOn(!remoteFeedOn)}>
          Turn Remote {remoteFeedOn ? "Off" : "On"}
        </Button>
      </div>
      <div className="grid xl:grid-cols-2">
        {localVideoTrack$ && localFeedOn && (
          <Video videoTrack$={localVideoTrack$} />
        )}
        {localMicTrack$ && localFeedOn && (
          <Audio audioTrack$={localMicTrack$} />
        )}
        {remoteVideoTrack$ && remoteFeedOn && (
          <Video videoTrack$={remoteVideoTrack$} />
        )}
        {remoteAudioTrack$ && remoteFeedOn && (
          <Audio audioTrack$={remoteAudioTrack$} />
        )}
      </div>
      <select
        value={preferredWebcamDeviceId}
        onChange={(e) => setPreferredWebcamDeviceId(e.target.value)}
      >
        <option value="">Select webcam</option>
        {devices
          ?.filter((d) => d.kind === "videoinput")
          .map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
      </select>
      <pre>
        {JSON.stringify(
          { peerConnectionState, sessionId, preferredWebcamDeviceId },
          null,
          2
        )}
      </pre>
    </div>
  );
}

function Button(props: ComponentProps<"button">) {
  return <button className="border px-1" {...props} />;
}

function Video(props: { videoTrack$: Observable<MediaStreamTrack | null> }) {
  const ref = useRef<ComponentRef<"video">>(null);
  useObservable(props.videoTrack$, (track) => {
    if (!ref.current) return;
    if (track) {
      const mediaStream = new MediaStream();
      mediaStream.addTrack(track);
      ref.current.srcObject = mediaStream;
    } else {
      ref.current.srcObject = null;
    }
  });

  return (
    <video className="h-full w-full" ref={ref} autoPlay muted playsInline />
  );
}

function Audio(props: { audioTrack$: Observable<MediaStreamTrack | null> }) {
  const ref = useRef<ComponentRef<"audio">>(null);
  useObservable(props.audioTrack$, (track) => {
    if (!ref.current) return;
    if (track) {
      const mediaStream = new MediaStream();
      mediaStream.addTrack(track);
      ref.current.srcObject = mediaStream;
    } else {
      ref.current.srcObject = null;
    }
  });

  // biome-ignore lint/a11y/useMediaCaption: Not able to generate captions for this currently.
  return <audio className="h-full w-full" ref={ref} autoPlay playsInline />;
}

function useWebcamTrack$(enabled: boolean) {
  return useMemo(() => {
    if (!enabled) return null;
    return resilientTrack$({ kind: "videoinput" });
  }, [enabled]);
}

function useMicTrack$(enabled: boolean) {
  return useMemo(() => {
    if (!enabled) return null;
    return resilientTrack$({ kind: "audioinput" });
  }, [enabled]);
}
