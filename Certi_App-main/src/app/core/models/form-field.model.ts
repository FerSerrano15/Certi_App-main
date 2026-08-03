// ============================================================
// core/models/form-field.model.ts
// ============================================================
export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'radio' | 'checkbox' | 'select' | 'textarea' | 'signature';
  label: string;
  controlName: string;
  placeholder?: string;
  required?: boolean;
  group?: string;
  options?: FormFieldOption[];
  rows?: number;
  value?: string;
}
