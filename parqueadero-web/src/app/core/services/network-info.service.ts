import { Injectable, OnDestroy, signal } from '@angular/core';
import { fromEvent, merge, Observable, map, startWith } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NetworkInfoService implements OnDestroy {
  private readonly _isOnline = signal(navigator.onLine);

  readonly isOnline$: Observable<boolean> = merge(
    fromEvent(window, 'online').pipe(map(() => true)),
    fromEvent(window, 'offline').pipe(map(() => false)),
  ).pipe(startWith(navigator.onLine));

  private readonly _sub = this.isOnline$.subscribe((online) => {
    this._isOnline.set(online);
  });

  isOnline(): boolean {
    return this._isOnline();
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }
}
