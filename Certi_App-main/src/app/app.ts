import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { PdfPreviewDialogComponent } from './shared/pdf-preview-dialog/pdf-preview-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialogComponent, PdfPreviewDialogComponent],
  template: '<router-outlet></router-outlet><app-confirm-dialog></app-confirm-dialog><app-pdf-preview-dialog></app-pdf-preview-dialog>',
  styles: [':host { display: block; }']
})
export class App {
  title = 'LAndingpage';
}
