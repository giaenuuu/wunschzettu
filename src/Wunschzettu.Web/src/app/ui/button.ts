import { Directive, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold ' +
  'transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  'focus-visible:outline-offset-3 cursor-pointer no-underline';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[0_1px_0_oklch(1_0_0/0.25)_inset,0_6px_16px_-6px_var(--color-accent)] hover:bg-accent-hover',
  secondary: 'bg-accent-soft text-on-accent-soft hover:bg-[color-mix(in_oklch,var(--color-accent-soft),var(--color-accent)_14%)]',
  outline: 'border-[1.5px] border-line-strong bg-transparent text-ink hover:border-accent hover:text-accent',
  ghost: 'bg-transparent text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:brightness-110',
  'danger-ghost': 'bg-transparent text-danger hover:bg-danger-soft',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.9375rem]',
  lg: 'h-14 px-7 text-base',
};

const iconSizes: Record<ButtonSize, string> = { sm: 'size-9', md: 'size-11', lg: 'size-14' };

/**
 * Buttons and button-looking links: `<button uiButton>`, `<a uiButton variant="secondary">`.
 * Icon-only buttons (`iconOnly`) must carry an aria-label. `busy` shows a spinner and announces it.
 */
@Directive({
  selector: 'button[uiButton], a[uiButton]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'busy() || null',
  },
})
export class UiButton {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input(false);
  readonly busy = input(false);
  readonly wide = input(false);

  protected readonly classes = computed(() =>
    [
      base,
      variants[this.variant()],
      this.iconOnly() ? `${iconSizes[this.size()]} px-0` : sizes[this.size()],
      this.wide() ? 'w-full' : '',
      this.busy()
        ? 'pointer-events-none before:size-4 before:shrink-0 before:animate-spin before:rounded-full before:border-2 before:border-current before:border-r-transparent'
        : '',
    ].join(' '),
  );
}
