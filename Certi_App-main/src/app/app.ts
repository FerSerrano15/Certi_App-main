import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialogComponent],
  template: '<router-outlet></router-outlet><app-confirm-dialog></app-confirm-dialog>',
  styles: [':host { display: block; }']
})
export class App {
  title = 'LAndingpage';
}
