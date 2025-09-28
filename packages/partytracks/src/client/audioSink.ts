import { BehaviorSubject, map } from "rxjs";
import type { Observable, Subscription } from "rxjs";
import { devices$ } from "./resilientTrack$";

export interface CreateSinkOptions {
  audioElement: HTMLAudioElement;
  sinkId?: string;
}

export interface SinkApi {
  attach: (pulledAudioTrack$: Observable<MediaStreamTrack>) => Subscription;
  setSinkId: (sinkId: string) => void;
  devices$: Observable<MediaDeviceInfo[]>;
  cleanup: () => void;
}

export const createAudioSink = ({
  audioElement,
  sinkId = "default"
}: CreateSinkOptions): SinkApi => {
  audioElement.setSinkId(sinkId);
  const sinkId$ = new BehaviorSubject(sinkId);
  const mediaStream = new MediaStream();
  audioElement.srcObject = mediaStream;
  const resetSrcObject = () => {
    audioElement.addEventListener("canplay", () => audioElement.play(), {
      once: true
    });
    audioElement.srcObject = mediaStream;
  };
  const subs: Subscription[] = [];

  const attach = (pulledAudioTrack$: Observable<MediaStreamTrack>) => {
    const sub = pulledAudioTrack$.subscribe((track) => {
      mediaStream.addTrack(track);
      resetSrcObject();
      sub.add(() => {
        mediaStream.removeTrack(track);
        resetSrcObject();
      });
    });
    subs.push(sub);
    return sub;
  };

  const setSinkId = (sinkId: string) => {
    audioElement.setSinkId(sinkId);
    sinkId$.next(sinkId);
  };

  const cleanup = () => {
    subs.forEach((s) => {
      s.unsubscribe();
    });
    audioElement.srcObject = null;
  };

  return {
    attach,
    setSinkId,
    devices$: devices$.pipe(
      map((devices) => devices.filter((d) => d.kind === "audiooutput"))
    ),
    cleanup
  };
};
