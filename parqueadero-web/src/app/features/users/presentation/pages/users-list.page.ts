import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import {
  CREATE_USER_TOKEN,
  LIST_USERS_TOKEN,
  TOGGLE_USER_ACTIVE_TOKEN,
  UPDATE_USER_ROLE_TOKEN,
} from '../../../../core/di/injection-tokens';
import { ListUsersUseCase } from '../../domain/usecases/list-users.usecase';
import { CreateUserUseCase } from '../../domain/usecases/create-user.usecase';
import { UpdateUserRoleUseCase } from '../../domain/usecases/update-user-role.usecase';
import { ToggleUserActiveUseCase } from '../../domain/usecases/toggle-user-active.usecase';
import { UserEntity, UserRole } from '../../../auth/domain/entities/user.entity';
import { AuthStateService } from '../../../../core/services/auth-state.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  UserCreateDialogComponent,
  UserCreateFormValue,
} from '../components/user-create-dialog.component';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  operador: 'Operador',
  contador: 'Contador',
};

@Component({
  selector: 'app-users-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './users-list.page.html',
  styleUrl: './users-list.page.scss',
})
export class UsersListPageComponent implements OnInit {
  protected readonly users = signal<UserEntity[]>([]);
  protected readonly loading = signal(false);
  protected readonly includeInactive = signal(false);

  protected readonly roles: UserRole[] = ['admin', 'operador', 'contador'];

  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly authState = inject(AuthStateService);

  constructor(
    @Inject(LIST_USERS_TOKEN) private readonly listUC: ListUsersUseCase,
    @Inject(CREATE_USER_TOKEN) private readonly createUC: CreateUserUseCase,
    @Inject(UPDATE_USER_ROLE_TOKEN) private readonly updateRoleUC: UpdateUserRoleUseCase,
    @Inject(TOGGLE_USER_ACTIVE_TOKEN) private readonly toggleActiveUC: ToggleUserActiveUseCase,
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  protected roleLabel(r: UserRole): string {
    return ROLE_LABEL[r] ?? r;
  }

  protected isSelf(user: UserEntity): boolean {
    return user.id === this.authState.currentUser()?.id;
  }

  protected onIncludeInactiveChange(event: Event): void {
    this.includeInactive.set((event.target as HTMLInputElement).checked);
    void this.load();
  }

  protected openCreateDialog(): void {
    const ref = this.dialog.open<UserCreateFormValue | undefined>(UserCreateDialogComponent, {});
    ref.closed.subscribe(async (value) => {
      if (!value) return;
      const result = await this.createUC.execute(value);
      result.fold(
        (f) => this.toast.error(`No se pudo crear: ${f.message}`),
        () => {
          this.toast.success(`Usuario ${value.email} creado`);
          void this.load();
        },
      );
    });
  }

  protected async onRoleChange(user: UserEntity, event: Event): Promise<void> {
    const newRole = (event.target as HTMLSelectElement).value as UserRole;
    if (newRole === user.role) return;
    const result = await this.updateRoleUC.execute({ userId: user.id, role: newRole });
    result.fold(
      (f) => this.toast.error(`No se pudo cambiar rol: ${f.message}`),
      () => {
        this.toast.success(`Rol de ${user.email} cambiado a ${newRole}`);
        void this.load();
      },
    );
  }

  protected async toggleActive(user: UserEntity): Promise<void> {
    const result = await this.toggleActiveUC.execute({
      userId: user.id,
      activate: !user.isActive,
    });
    result.fold(
      (f) => this.toast.error(`No se pudo cambiar estado: ${f.message}`),
      () => {
        this.toast.success(user.isActive ? 'Usuario desactivado' : 'Usuario activado');
        void this.load();
      },
    );
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const result = await this.listUC.execute({ includeInactive: this.includeInactive() });
    this.loading.set(false);
    result.fold(
      (f) => this.toast.error(`Error al cargar usuarios: ${f.message}`),
      (list) => this.users.set(list),
    );
  }
}
