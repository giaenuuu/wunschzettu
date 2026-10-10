import { linkedSignal, Signal } from '@angular/core';

/**
 * A resource's value that survives reloads with a new request (which reset `value()` to undefined).
 * Keeps the page stable instead of flashing empty states or destroying components with open dialogs.
 */
export function lastValue<T>(resource: { value: Signal<T | undefined> }): Signal<T | undefined> {
  return linkedSignal<T | undefined, T | undefined>({
    source: () => resource.value(),
    computation: (value, previous) => value ?? previous?.value,
  });
}
