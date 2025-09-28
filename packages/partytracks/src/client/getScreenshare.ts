import { inaudibleAudioTrack$ } from "./inaudibleTrack$";
import {
  map,
  switchMap,
  of,
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged
} from "rxjs";
import type { Observable } from "rxjs";
import { blackCanvasTrack$ } from "./blackCanvasTrack$";
import { screenshare$ } from "./screenshare$";
import { makeBroadcastTrack, type BroadcastTrack } from "./makeBroadcastTrack";

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

const defaultAudioConfig = {
  constraints: {} as MediaTrackConstraints,
  options: { broadcasting: false }
};

const defaultVideoConfig = {
  constraints: {} as MediaTrackConstraints,
  options: { broadcasting: false }
};

const defaultOptions = {
  activateSource: false,
  retainIdleTracks: false
} satisfies ScreenshareOptions;

export const getScreenshare = (
  options: ScreenshareOptions = defaultOptions
): Screenshare => {
  const audioConstraints =
    options.audio === true || options.audio === undefined
      ? defaultAudioConfig.constraints
      : options.audio === false
        ? undefined
        : options.audio.constraints;
  const audioBroadcastOptions =
    options.audio === true || options.audio === undefined
      ? defaultAudioConfig.options
      : options.audio === false
        ? defaultAudioConfig.options
        : {
            ...defaultAudioConfig.options,
            ...options.audio.options
          };
  const videoConstraints =
    options.video === true || options.video === undefined
      ? defaultVideoConfig.constraints
      : options.video === false
        ? undefined
        : options.video.constraints;
  const videoBroadcastOptions =
    options.video === true || options.video === undefined
      ? defaultVideoConfig.options
      : options.video === false
        ? defaultVideoConfig.options
        : {
            ...defaultVideoConfig.options,
            ...options.video.options
          };

  const screenshareSource$ = screenshare$({
    audio: audioConstraints,
    video: videoConstraints
  });

  const audioSourceTrack$ = screenshareSource$.pipe(
    switchMap((ms) => {
      const [track] = ms.getAudioTracks();
      return track ? of(track) : inaudibleAudioTrack$;
    })
  );

  const isSourceEnabled$ = new BehaviorSubject(
    options.activateSource ?? defaultOptions.activateSource
  );

  const audioShouldBroadcast$ = new BehaviorSubject(
    audioBroadcastOptions.broadcasting
  );
  const audioApi = makeBroadcastTrack({
    contentTrack$: audioSourceTrack$,
    fallbackTrack$: inaudibleAudioTrack$,
    ...defaultOptions,
    retainIdleTrack: options.retainIdleTracks,
    shouldBroadcast$: audioShouldBroadcast$,
    isSourceEnabled$,
    ...audioBroadcastOptions
  });

  const audio: Partial<typeof audioApi> = {
    ...audioApi
  };

  delete audio.toggleIsSourceEnabled;
  delete audio.disableSource;
  delete audio.enableSource;
  delete audio.isSourceEnabled$;

  const videoSourceTrack$ = screenshareSource$.pipe(
    map((ms) => ms.getVideoTracks()[0])
  );

  const videoShouldBroadcast$ = new BehaviorSubject(
    videoBroadcastOptions.broadcasting
  );
  const videoApi = makeBroadcastTrack({
    contentTrack$: videoSourceTrack$,
    fallbackTrack$: blackCanvasTrack$,
    retainIdleTrack: options.retainIdleTracks,
    shouldBroadcast$: videoShouldBroadcast$,
    isSourceEnabled$,
    ...videoBroadcastOptions
  });

  const video: Partial<typeof videoApi> = {
    ...videoApi
  };

  delete video.toggleIsSourceEnabled;
  delete video.disableSource;
  delete video.enableSource;
  delete video.isSourceEnabled$;

  const disableSource = () => {
    isSourceEnabled$.next(false);
    videoApi.stopBroadcasting();
    audioApi.stopBroadcasting();
  };

  const enableSource = () => {
    isSourceEnabled$.next(true);
  };

  const toggleIsSourceEnabled = () => {
    if (isSourceEnabled$.value) {
      disableSource();
    } else {
      enableSource();
    }
  };

  const startBroadcasting = () => {
    audioApi.startBroadcasting();
    videoApi.startBroadcasting();
  };

  const stopBroadcasting = () => {
    audioApi.stopBroadcasting();
    videoApi.stopBroadcasting();
  };

  const toggleBroadcasting = () => {
    if (audioShouldBroadcast$.value || videoShouldBroadcast$.value) {
      stopBroadcasting();
    } else {
      startBroadcasting();
    }
  };

  const isBroadcasting$ = combineLatest([
    audioApi.isBroadcasting$,
    videoApi.isBroadcasting$
  ]).pipe(
    map(
      ([audioIsBroadcasting, videoIsBroadcasting]) =>
        audioIsBroadcasting || videoIsBroadcasting
    ),
    distinctUntilChanged()
  );

  return {
    audio: audio as Omit<
      BroadcastTrack,
      | "enableSource"
      | "disableSource"
      | "toggleIsSourceEnabled"
      | "isSourceEnabled$"
    >,
    video: video as Omit<
      BroadcastTrack,
      | "enableSource"
      | "disableSource"
      | "toggleIsSourceEnabled"
      | "isSourceEnabled$"
    >,
    disableSource,
    enableSource,
    toggleIsSourceEnabled,
    isSourceEnabled$,
    startBroadcasting,
    stopBroadcasting,
    toggleBroadcasting,
    isBroadcasting$
  };
};

export interface Screenshare {
  audio: ScreenshareBroadcastTrack;
  video: ScreenshareBroadcastTrack;

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

export interface ScreenshareBroadcastTrack {
  /**
   Applies a transformation to the content track. Be sure to store
   a reference to the filter you've added if you want to remove it
   with removeTransform() and add cleanup logic when creating your
   Observable:
 
   ```ts
   track => new Observable<MediaStreamTrack>(subscriber => {
     // do your setup then emit...
     subscriber.next(transformedTrack)
     subscriber.add(() => {
       // add cleanup logic here
     })
   })
   ```
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
}
