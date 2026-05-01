import {
  ChangeDetectionStrategy, Component, input, output, OnInit, OnDestroy
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-input.component.html',
  styleUrl: './search-input.component.scss',
})
export class SearchInputComponent implements OnInit, OnDestroy {
  label       = input('Buscar');
  placeholder = input('Buscar...');
  inputId     = input('search-input');
  debounce    = input(300);

  searched = output<string>();

  protected rawValue = '';

  private readonly push$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.push$.pipe(
      debounceTime(this.debounce()),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((v) => this.searched.emit(v));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected push(value: string): void {
    this.push$.next(value);
  }

  protected clear(): void {
    this.rawValue = '';
    this.push$.next('');
    this.searched.emit('');
  }
}
