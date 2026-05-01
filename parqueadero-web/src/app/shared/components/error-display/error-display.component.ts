import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ErrorDisplayVariant = 'inline' | 'card';

@Component({
  selector: 'app-error-display',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './error-display.component.html',
  styleUrl: './error-display.component.scss',
})
export class ErrorDisplayComponent {
  message  = input.required<string>();
  variant  = input<ErrorDisplayVariant>('inline');
  actionLabel = input<string>('');
  action   = output<void>();
}
