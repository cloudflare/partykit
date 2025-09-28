import { useEffect, useRef, useState } from "react";
import { BehaviorSubject } from "rxjs";

import type { Observable, Observer } from "rxjs";

/**
 * Subscribes to an Observable and returns the latest emitted value,
 * and unsubscribes when unmounting. Uses useOnEmit under the hood.
 * Accepts an optional default value. If one is not provided, value
 * will be undefined until the Observable emits something else.
 *
 * NOTE: It's important that your Observable be stable, so be sure to
 * memoize it before passing it in!
 */
export function useObservableAsValue<T>(
  observable: Observable<T>
): T | undefined;
export function useObservableAsValue<T>(
  observable: Observable<T>,
  defaultValue: T
): T;
export function useObservableAsValue<T>(
  observable: Observable<T>,
  defaultValue?: T
): T {
  const [state, setState] = useState(defaultValue);
  useEffect(() => {
    setState(defaultValue);
  }, [observable]);
  useObservable(observable, { next: setState });
  return state!;
}

/**
 * Subscribes to an Observable with the provided Observer, and
 * unsubscribes when unmounting.
 *
 * NOTE: It's important that your Observable be stable, so be sure to
 * memoize it before passing in!
 */
export function useObservable<T>(
  observable: Observable<T>,
  observerOrNext: Partial<Observer<T>> | ((value: T) => void)
) {
  const observerOrNextRef = useRef(observerOrNext);
  observerOrNextRef.current = observerOrNext;
  useEffect(() => {
    const subscription = observable.subscribe({
      next: (value) =>
        typeof observerOrNextRef.current === "function"
          ? observerOrNextRef.current(value)
          : observerOrNextRef.current.next?.(value),
      error: (value) =>
        typeof observerOrNextRef.current !== "function" &&
        observerOrNextRef.current.error?.(value),
      complete: () =>
        typeof observerOrNextRef.current !== "function" &&
        observerOrNextRef.current.complete?.()
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [observable]);
}

/**
 * Turns a value into a stable Observable that will emit new
 * values when the value changes, and completes upon unmounting.
 */
export function useValueAsObservable<T>(value: T): Observable<T> {
  const ref = useRef(new BehaviorSubject(value));
  const observableRef = useRef(ref.current.asObservable());
  const previousValueRef = useRef<T>(value);
  if (previousValueRef.current !== value) {
    previousValueRef.current = value;
    // since subscribers might call a setState, we don't want to
    // do this in the render path.
    queueMicrotask(() => ref.current.next(value));
  }

  useEffect(() => {
    const { current } = ref;
    if (!current) return;
    return () => {
      current.complete();
    };
  }, []);

  return observableRef.current;
}
