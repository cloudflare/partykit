import type { ObservableInput } from "rxjs";
import { Observable } from "rxjs";
import { innerFrom } from "rxjs/internal/observable/innerFrom";
import { createOperatorSubscriber } from "rxjs/internal/operators/OperatorSubscriber";

type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export function fromFetch<T>(
  input: string | Request,
  init: RequestInit & {
    selector: (response: Response) => ObservableInput<T>;
    fetchImpl?: FetchFn;
  }
): Observable<T>;

export function fromFetch(
  input: string | Request,
  init?: RequestInit
): Observable<Response>;

/**
 * Slightly modified version of rxjs fromFetch that
 * allows providing the fetcher function.
 */
export function fromFetch<T>(
  input: string | Request,
  initWithSelector: RequestInit & {
    selector?: (response: Response) => ObservableInput<T>;
    fetchImpl?: FetchFn;
  } = {}
): Observable<Response | T> {
  const { selector, fetchImpl = fetch, ...init } = initWithSelector;
  return new Observable<Response | T>((subscriber) => {
    // Our controller for aborting this fetch.
    // Any externally provided AbortSignal will have to call
    // abort on this controller when signaled, because the
    // signal from this controller is what is being passed to `fetch`.
    const controller = new AbortController();
    const { signal } = controller;
    // This flag exists to make sure we don't `abort()` the fetch upon tearing down
    // this observable after emitting a Response. Aborting in such circumstances
    // would also abort subsequent methods - like `json()` - that could be called
    // on the Response. Consider: `fromFetch().pipe(take(1), mergeMap(res => res.json()))`
    let abortable = true;

    // If the user provided an init configuration object,
    // let's process it and chain our abort signals, if necessary.
    // If a signal is provided, just have it finalized. It's a cancellation token, basically.
    const { signal: outerSignal } = init;
    if (outerSignal) {
      if (outerSignal.aborted) {
        controller.abort();
      } else {
        // We got an AbortSignal from the arguments passed into `fromFetch`.
        // We need to wire up our AbortController to abort when this signal aborts.
        const outerSignalHandler = () => {
          if (!signal.aborted) {
            controller.abort();
          }
        };
        outerSignal.addEventListener("abort", outerSignalHandler);
        subscriber.add(() =>
          outerSignal.removeEventListener("abort", outerSignalHandler)
        );
      }
    }

    // The initialization object passed to `fetch` as the second
    // argument. This ferries in important information, including our
    // AbortSignal. Create a new init, so we don't accidentally mutate the
    // passed init, or reassign it. This is because the init passed in
    // is shared between each subscription to the result.
    const perSubscriberInit: RequestInit = { ...init, signal };

    const handleError = (err: unknown) => {
      abortable = false;
      subscriber.error(err);
    };

    fetchImpl(input, perSubscriberInit)
      .then((response) => {
        if (selector) {
          // If we have a selector function, use it to project our response.
          // Note that any error that comes from our selector will be
          // sent to the promise `catch` below and handled.
          innerFrom(selector(response)).subscribe(
            createOperatorSubscriber(
              subscriber,
              // Values are passed through to the subscriber
              undefined,
              // The projected response is complete.
              () => {
                abortable = false;
                subscriber.complete();
              },
              handleError
            )
          );
        } else {
          abortable = false;
          subscriber.next(response);
          subscriber.complete();
        }
      })
      .catch(handleError);

    return () => {
      if (abortable) {
        controller.abort();
      }
    };
  });
}
