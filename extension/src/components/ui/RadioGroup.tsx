import type { HTMLAttributes, KeyboardEvent } from 'react';

/** Arrow keys move and select within a radio group, as native radio inputs do. */
export function RadioGroup(props: HTMLAttributes<HTMLDivElement>) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].filter(
      (button) => !button.matches(':disabled'),
    );
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || buttons.length === 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  return <div {...props} role="radiogroup" onKeyDown={move} />;
}
